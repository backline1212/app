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

_BODY_TRUNCATE_LENGTH = 500


def _card(title: str, lines: list[str], link: tuple[str, str] | None) -> dict[str, Any]:
    """The Adaptive Card envelope a Teams "Post to a channel when a webhook request is
    received" workflow expects (the legacy Office 365 connector URLs accept it too)."""
    body: list[dict[str, Any]] = [
        {"type": "TextBlock", "text": title, "weight": "Bolder", "wrap": True}
    ]
    body.extend({"type": "TextBlock", "text": line, "wrap": True} for line in lines if line)
    content: dict[str, Any] = {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": body,
    }
    if link is not None:
        content["actions"] = [{"type": "Action.OpenUrl", "title": link[0], "url": link[1]}]
    return {
        "type": "message",
        "attachments": [
            {"contentType": "application/vnd.microsoft.card.adaptive", "content": content}
        ],
    }


def _comment_card(comment: CommentOut, heading: str, event: EventContext) -> dict[str, Any]:
    body = comment.body
    if len(body) > _BODY_TRUNCATE_LENGTH:
        body = body[:_BODY_TRUNCATE_LENGTH].rstrip() + "..."
    page_url = comment.context.get("url", "") if comment.context else ""
    layer_label = "Team only" if comment.layer == "team" else "Client visible"
    return _card(
        f"{heading} · {event.project_name} ({layer_label})",
        [body, str(page_url)],
        (f"Open {ticket_ref(comment)} in Backline", event.backlink_url),
    )


class TeamsIntegration:
    """Microsoft Teams through a Workflows webhook URL - the replacement Microsoft
    points to for the retired Office 365 connectors. Same one-URL connection as
    Slack."""

    async def on_comment_created(
        self, comment: CommentOut, config: dict[str, Any], event: EventContext
    ) -> None:
        if is_team_only_blocked(comment, config):
            return
        heading = "New reply" if comment.parent_id else "New comment"
        await self._post(config["webhook_url"], _comment_card(comment, heading, event))

    async def on_status_changed(
        self, comment: CommentOut, config: dict[str, Any], event: EventContext
    ) -> None:
        if not config.get("notify_status_changes", True) or is_team_only_blocked(comment, config):
            return
        heading = f"Status changed to {comment.status.replace('_', ' ')}"
        await self._post(config["webhook_url"], _comment_card(comment, heading, event))

    async def on_project_updated(
        self, project: dict[str, Any], config: dict[str, Any], backlink_url: str
    ) -> None:
        if not config.get("notify_project_updates", True):
            return
        name = str(project.get("name", "Untitled project"))
        await self._post(
            config["webhook_url"],
            _card("Project updated", [name], ("Open in Backline", backlink_url)),
        )

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            await self._post(
                ctx.config["webhook_url"],
                _card(
                    "Backline is connected",
                    ["Comment notifications will appear in this channel."],
                    None,
                ),
            )
            return True
        except IntegrationDeliveryError:
            return False

    async def _post(self, webhook_url: str, payload: dict[str, Any]) -> None:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(webhook_url, json=payload)
        except httpx.HTTPError as exc:
            raise IntegrationDeliveryError(f"Teams webhook request failed: {exc}") from exc
        # Workflows answers 202 Accepted; the legacy connector answered 200.
        if response.status_code not in (200, 202):
            raise IntegrationDeliveryError(
                f"Teams webhook returned {response.status_code}: {response.text[:300]}"
            )
