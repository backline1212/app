from typing import Any

import httpx

from app.modules.comments.schemas import CommentOut
from app.modules.integrations.base import (
    EventContext,
    IntegrationContext,
    IntegrationDeliveryError,
    is_team_only_blocked,
    ticket_ref,
)

_BODY_TRUNCATE_LENGTH = 300


def _escape(text: str) -> str:
    """Slack's mrkdwn treats `<...>` as a control sequence - without escaping, a
    reviewer who types `<!channel>` into a comment pings everyone in the channel."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _format_message(comment: CommentOut, heading: str, event: EventContext) -> str:
    body = comment.body
    if len(body) > _BODY_TRUNCATE_LENGTH:
        body = body[:_BODY_TRUNCATE_LENGTH].rstrip() + "..."
    page_url = comment.context.get("url", "(unknown page)") if comment.context else "(unknown page)"
    layer_label = "Team only" if comment.layer == "team" else "Client visible"
    return (
        f"*{heading}* · {_escape(event.project_name)} ({layer_label})\n"
        f"{_escape(body)}\n"
        f"{_escape(str(page_url))}\n"
        f"<{event.backlink_url}|Open {ticket_ref(comment)} in Backline>"
    )


class SlackIntegration:
    """17.2 - Incoming Webhook, no OAuth app review needed for MVP."""

    async def on_comment_created(
        self, comment: CommentOut, config: dict[str, Any], event: EventContext
    ) -> None:
        if is_team_only_blocked(comment, config):
            return
        heading = "New reply" if comment.parent_id else "New comment"
        await self._post(config["webhook_url"], _format_message(comment, heading, event))

    async def on_status_changed(
        self, comment: CommentOut, config: dict[str, Any], event: EventContext
    ) -> None:
        if not config.get("notify_status_changes", True):
            return
        if is_team_only_blocked(comment, config):
            return
        heading = f"Status changed to {comment.status.replace('_', ' ')}"
        await self._post(config["webhook_url"], _format_message(comment, heading, event))

    async def on_project_updated(
        self, project: dict[str, Any], config: dict[str, Any], backlink_url: str
    ) -> None:
        """Dispatched from integrations/service.py's run_project_updated_dispatch.
        `project` is the raw project doc (this only ever needs the name)."""
        if not config.get("notify_project_updates", True):
            return
        name = _escape(str(project.get("name", "Untitled project")))
        await self._post(config["webhook_url"], f"*Project updated*\n<{backlink_url}|{name}>")

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            await self._post(
                ctx.config["webhook_url"],
                "Backline is connected - comment notifications will appear here.",
            )
            return True
        except IntegrationDeliveryError:
            return False

    async def _post(self, webhook_url: str, text: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(webhook_url, json={"text": text})
        except httpx.HTTPError as exc:
            raise IntegrationDeliveryError(f"Slack webhook request failed: {exc}") from exc

        # Slack's Incoming Webhook contract: 200 with a literal "ok" body on success.
        if response.status_code != 200 or response.text != "ok":
            raise IntegrationDeliveryError(
                f"Slack webhook returned {response.status_code}: {response.text}"
            )
