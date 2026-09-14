from typing import Any

import httpx

from app.modules.comments.schemas import CommentOut
from app.modules.integrations.base import IntegrationDeliveryError

_BODY_TRUNCATE_LENGTH = 300


def _format_message(comment: CommentOut, heading: str) -> str:
    body = comment.body
    if len(body) > _BODY_TRUNCATE_LENGTH:
        body = body[:_BODY_TRUNCATE_LENGTH].rstrip() + "..."
    page_url = comment.context.get("url", "(unknown page)") if comment.context else "(unknown page)"
    layer_label = "Team only" if comment.layer == "team" else "Client visible"
    return f"*{heading}* ({layer_label})\n{body}\n{page_url}"


class SlackIntegration:
    """17.2 - Incoming Webhook, no OAuth app review needed for MVP."""

    async def on_comment_created(self, comment: CommentOut, config: dict[str, Any]) -> None:
        if comment.layer == "team" and not config.get("notify_team_layer", False):
            return
        await self._post(config["webhook_url"], _format_message(comment, "New comment"))

    async def on_status_changed(self, comment: CommentOut, config: dict[str, Any]) -> None:
        if not config.get("notify_status_changes", True):
            return
        if comment.layer == "team" and not config.get("notify_team_layer", False):
            return
        heading = f"Status changed to {comment.status.replace('_', ' ')}"
        await self._post(config["webhook_url"], _format_message(comment, heading))

    async def on_project_updated(self, project: dict[str, Any], config: dict[str, Any]) -> None:
        """Not part of the automatic Integration Protocol (base.py) - dispatched
        directly from integrations/service.py's dispatch_project_updated_event, called
        from projects/service.py's update_project. `project` is the raw project doc
        (not a full ProjectOut - this only ever needs the name)."""
        await self._post(
            config["webhook_url"], f"*Project updated*\n{project.get('name', 'Untitled project')}"
        )

    async def test_connection(self, config: dict[str, Any]) -> bool:
        try:
            await self._post(
                config["webhook_url"],
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
