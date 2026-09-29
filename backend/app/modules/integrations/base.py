import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.ssrf_guard import assert_safe_to_fetch
from app.modules.comments.schemas import CommentOut


def http_error_detail(exc: httpx.HTTPError) -> str:
    """`str(exc)` on an `httpx.HTTPStatusError` is just the status line - the
    provider's actual error reason (Atlassian's `invalid_grant`, Asana's validation
    message, ...) lives in the response body, and without this an admin staring at
    "Could not verify this connection" has no way to tell why a real, correctly-typed
    credential is failing."""
    response = getattr(exc, "response", None)
    if response is None:
        return str(exc)
    body = response.text.strip()
    return f"{exc} - {body[:300]}" if body else str(exc)


class IntegrationDeliveryError(Exception):
    """Raised by an Integration implementation when a delivery attempt fails in a way
    worth retrying (17-Notifications-Integrations.md §17.7) - the dispatch job catches
    this specifically and applies the exponential backoff schedule; any other exception
    is a bug, not a delivery failure, and should surface normally."""


@dataclass
class IntegrationContext:
    """One integration document's config, plus a way to write it back.

    Most providers only read `config`. Jira's OAuth mode rotates its refresh token on
    every use, so it needs `persist` to save the new one immediately and `refetch` to
    recover when a concurrent call already rotated it (see jira.py). Keeping both on
    one handle means every tracker method has the same signature whether or not its
    provider rotates anything.
    """

    config: dict[str, Any]
    persist: Callable[[dict[str, Any]], Awaitable[None]] | None = None
    refetch: Callable[[], Awaitable[dict[str, Any] | None]] | None = None

    async def save(self) -> None:
        if self.persist is not None:
            await self.persist(self.config)


@dataclass(frozen=True)
class EventContext:
    """What a notifier needs about a comment event beyond the comment itself."""

    project_name: str
    backlink_url: str


@dataclass(frozen=True)
class Destination:
    """Somewhere a tracker can file a ticket: a Trello/ClickUp list, a Jira/Asana/
    GitLab project, a GitHub repository or a Linear team."""

    id: str
    name: str
    group: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class Notifier(Protocol):
    """17.1's generic interface for integrations that post automatically (Slack,
    Discord, Microsoft Teams, signed webhooks) - adding one is a new class registered
    in factory.py, never a change to the dispatch path."""

    async def on_comment_created(
        self, comment: CommentOut, config: dict[str, Any], event: EventContext
    ) -> None: ...

    async def on_status_changed(
        self, comment: CommentOut, config: dict[str, Any], event: EventContext
    ) -> None: ...

    async def on_project_updated(
        self, project: dict[str, Any], config: dict[str, Any], backlink_url: str
    ) -> None: ...

    async def test_connection(self, ctx: IntegrationContext) -> bool: ...


class Tracker(Protocol):
    """Integrations a member files tickets into by hand (ClickUp, Trello, Jira, Asana,
    GitHub, GitLab, Linear). `destination_key` is the config_json key the chosen
    destination's id is stored under - kept per provider because the first four
    already stored it under their own names (`list_id`, `project_key`, ...)."""

    destination_key: str

    async def test_connection(self, ctx: IntegrationContext) -> bool: ...

    async def list_destinations(self, ctx: IntegrationContext) -> list[Destination]: ...

    async def create_item(
        self, comment: CommentOut, ctx: IntegrationContext, *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (external_id, url)."""
        ...


def is_team_only_blocked(comment: CommentOut, config: dict[str, Any]) -> bool:
    """17.2: a team-only comment never reaches a shared channel unless the admin
    explicitly opted in - there's no way to tell from a webhook URL whether the channel
    behind it is private."""
    return comment.layer == "team" and not config.get("notify_team_layer", False)


def issue_title(comment: CommentOut) -> str:
    """The comment's first non-empty line. Jira rejects a summary containing a newline,
    and every tracker shows the title on one line anyway."""
    line = next((part.strip() for part in comment.body.splitlines() if part.strip()), "")
    if len(line) > 120:
        line = line[:117].rstrip() + "..."
    return line or "Backline feedback"


def ticket_ref(comment: CommentOut) -> str:
    return f"#{comment.ticket_number}" if comment.ticket_number is not None else comment.id[-6:]


def context_lines(comment: CommentOut) -> list[tuple[str, str]]:
    """(label, value) pairs describing where and on what the feedback was left - only
    what the comment actually recorded, nothing inferred."""
    context = comment.context or {}
    anchor = comment.anchor or {}
    rows: list[tuple[str, str]] = [("Page", str(context.get("url") or "unknown"))]
    fingerprint = anchor.get("dom_fingerprint") or {}
    selector = fingerprint.get("selector_path") if isinstance(fingerprint, dict) else None
    if selector:
        rows.append(("Element", str(selector)))
    browser = context.get("browser") or "unknown"
    os_name = context.get("os") or "unknown"
    rows.append(("Browser/OS", f"{browser} / {os_name}"))
    rows.append(("Device", str(context.get("device_type") or "unknown")))
    viewport = context.get("viewport") or {}
    if isinstance(viewport, dict) and viewport.get("width") and viewport.get("height"):
        rows.append(("Viewport", f"{viewport['width']}x{viewport['height']}"))
    rows.append(("Priority", comment.priority))
    if comment.tags:
        rows.append(("Tags", ", ".join(comment.tags)))
    rows.append(("Reported by", comment.author_name))
    return rows


def plain_description(comment: CommentOut, backlink_url: str) -> str:
    """17.3's round-trip block: body + structured metadata + a backlink to the
    comment in Backline, for trackers whose description field is plain text."""
    lines = [comment.body, "", "---"]
    lines.extend(f"{label}: {value}" for label, value in context_lines(comment))
    lines.append(f"Backline ticket {ticket_ref(comment)}: {backlink_url}")
    return "\n".join(lines)


def markdown_description(comment: CommentOut, backlink_url: str, *, image_md: str = "") -> str:
    """The same block for trackers that render Markdown (GitHub, GitLab, Linear)."""
    lines = [comment.body, ""]
    if image_md:
        lines.extend([image_md, ""])
    lines.append("---")
    lines.extend(f"**{label}:** {value}  " for label, value in context_lines(comment))
    lines.append("")
    lines.append(f"[Open Backline ticket {ticket_ref(comment)}]({backlink_url})")
    return "\n".join(lines)


async def fetch_screenshot(screenshot_url: str) -> bytes:
    """A comment's screenshot bytes. Raises httpx errors so each tracker decides
    whether a missing image fails the whole create.

    Always its own client: a tracker's client may carry that tracker's credentials as
    default headers, which must never be sent to the storage host serving the image."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(screenshot_url)
    response.raise_for_status()
    return response.content


async def assert_public_url(url: str) -> None:
    """The SSRF guard for URLs an admin typed (custom webhooks, self-hosted GitLab):
    resolved off the event loop right before each request, and each caller disables
    redirects so a public URL can't bounce the request somewhere internal."""
    try:
        await asyncio.to_thread(assert_safe_to_fetch, url)
    except ValueError as exc:
        raise IntegrationDeliveryError(str(exc)) from exc
