import hashlib
import hmac
import json
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx

from app.core.encryption import decrypt_secret
from app.modules.comments.schemas import CommentOut
from app.modules.integrations.base import (
    EventContext,
    IntegrationContext,
    IntegrationDeliveryError,
    assert_public_url,
    is_team_only_blocked,
)

SIGNATURE_HEADER = "X-Backline-Signature"
TIMESTAMP_HEADER = "X-Backline-Timestamp"


def sign(secret: str, timestamp: str, body: bytes) -> str:
    """HMAC-SHA256 over `<timestamp>.<raw body>`: the receiver recomputes it with the
    signing secret shown once at connect time, and rejects a stale timestamp to stop
    a captured delivery from being replayed."""
    digest = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256)
    return f"sha256={digest.hexdigest()}"


def _comment_payload(comment: CommentOut, event: EventContext) -> dict[str, Any]:
    context = comment.context or {}
    return {
        "id": comment.id,
        "ticket_number": comment.ticket_number,
        "parent_id": comment.parent_id,
        "body": comment.body,
        "status": comment.status,
        "priority": comment.priority,
        "tags": comment.tags,
        "layer": comment.layer,
        "author_name": comment.author_name,
        "author_type": comment.author_type,
        "page_url": context.get("url"),
        "browser": context.get("browser"),
        "os": context.get("os"),
        "device_type": context.get("device_type"),
        "screenshot_url": comment.screenshot_url,
        "created_at": comment.created_at.isoformat(),
        "url": event.backlink_url,
        "project_name": event.project_name,
    }


class WebhookIntegration:
    """A signed JSON POST to any HTTPS endpoint - Zapier, Make, n8n, Pipedream or the
    agency's own service. Same automatic events and retry schedule as Slack."""

    async def on_comment_created(
        self, comment: CommentOut, config: dict[str, Any], event: EventContext
    ) -> None:
        if is_team_only_blocked(comment, config):
            return
        name = "reply.created" if comment.parent_id else "comment.created"
        await self._deliver(config, name, {"comment": _comment_payload(comment, event)})

    async def on_status_changed(
        self, comment: CommentOut, config: dict[str, Any], event: EventContext
    ) -> None:
        if not config.get("notify_status_changes", True) or is_team_only_blocked(comment, config):
            return
        await self._deliver(
            config, "comment.status_changed", {"comment": _comment_payload(comment, event)}
        )

    async def on_project_updated(
        self, project: dict[str, Any], config: dict[str, Any], backlink_url: str
    ) -> None:
        if not config.get("notify_project_updates", True):
            return
        await self._deliver(
            config,
            "project.updated",
            {
                "project": {
                    "id": str(project["_id"]),
                    "name": project.get("name"),
                    "url": backlink_url,
                }
            },
        )

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            await self._deliver(ctx.config, "ping", {"message": "Backline is connected."})
            return True
        except IntegrationDeliveryError:
            return False

    async def _deliver(self, config: dict[str, Any], event: str, data: dict[str, Any]) -> None:
        url = config["url"]
        await assert_public_url(url)
        payload = {
            "event": event,
            "delivered_at": datetime.now(UTC).isoformat(),
            **data,
        }
        body = json.dumps(payload, separators=(",", ":"), default=str).encode()
        timestamp = str(int(time.time()))
        secret = decrypt_secret(config["signing_secret_encrypted"])
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Backline-Webhooks/1.0",
            "X-Backline-Event": event,
            "X-Backline-Delivery": uuid.uuid4().hex,
            TIMESTAMP_HEADER: timestamp,
            SIGNATURE_HEADER: sign(secret, timestamp, body),
        }
        try:
            # follow_redirects stays off (httpx's default): a redirect could point the
            # request at an internal address after assert_public_url already passed.
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, content=body, headers=headers)
        except httpx.HTTPError as exc:
            raise IntegrationDeliveryError(f"Webhook request failed: {exc}") from exc
        if not 200 <= response.status_code < 300:
            raise IntegrationDeliveryError(
                f"Webhook returned {response.status_code}: {response.text[:300]}"
            )
