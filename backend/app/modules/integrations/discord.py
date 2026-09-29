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
# Discord rejects a message over 2000 characters outright.
_MESSAGE_LIMIT = 2000


def _format_message(comment: CommentOut, heading: str, event: EventContext) -> str:
    body = comment.body
    if len(body) > _BODY_TRUNCATE_LENGTH:
        body = body[:_BODY_TRUNCATE_LENGTH].rstrip() + "..."
    page_url = comment.context.get("url", "(unknown page)") if comment.context else "(unknown page)"
    layer_label = "Team only" if comment.layer == "team" else "Client visible"
    message = (
        f"**{heading}** · {event.project_name} ({layer_label})\n"
        f"{body}\n"
        f"<{page_url}>\n"
        f"[Open {ticket_ref(comment)} in Backline](<{event.backlink_url}>)"
    )
    return message[:_MESSAGE_LIMIT]


class DiscordIntegration:
    """A channel webhook (Channel settings -> Integrations -> Webhooks) - same
    "paste one URL" connection as Slack, no bot or app review."""

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
        if not config.get("notify_status_changes", True) or is_team_only_blocked(comment, config):
            return
        heading = f"Status changed to {comment.status.replace('_', ' ')}"
        await self._post(config["webhook_url"], _format_message(comment, heading, event))

    async def on_project_updated(
        self, project: dict[str, Any], config: dict[str, Any], backlink_url: str
    ) -> None:
        if not config.get("notify_project_updates", True):
            return
        name = project.get("name", "Untitled project")
        await self._post(config["webhook_url"], f"**Project updated**\n[{name}](<{backlink_url}>)")

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            await self._post(
                ctx.config["webhook_url"],
                "Backline is connected - comment notifications will appear here.",
            )
            return True
        except IntegrationDeliveryError:
            return False

    async def _post(self, webhook_url: str, content: str) -> None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    webhook_url,
                    # Comment bodies are written by clients: never let one turn into an
                    # @everyone/@here or role ping.
                    json={
                        "content": content,
                        "allowed_mentions": {"parse": []},
                        "username": "Backline",
                    },
                )
        except httpx.HTTPError as exc:
            raise IntegrationDeliveryError(f"Discord webhook request failed: {exc}") from exc
        # 204 No Content without ?wait=true; 200 with it.
        if response.status_code not in (200, 204):
            raise IntegrationDeliveryError(
                f"Discord webhook returned {response.status_code}: {response.text[:300]}"
            )
