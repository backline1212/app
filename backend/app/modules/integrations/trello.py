from typing import Any

import httpx

from app.core.encryption import decrypt_secret
from app.core.errors import ExternalServiceError
from app.modules.comments.schemas import CommentOut
from app.modules.integrations.base import (
    Destination,
    IntegrationContext,
    fetch_screenshot,
    http_error_detail,
    issue_title,
    plain_description,
)

TRELLO_API_BASE = "https://api.trello.com/1"


def _auth(config: dict[str, Any]) -> dict[str, str]:
    return {
        "key": decrypt_secret(config["api_key_encrypted"]),
        "token": decrypt_secret(config["token_encrypted"]),
    }


class TrelloIntegration:
    """17.4 - API-key + token connect (the agency pastes both from Trello's own
    token-generation page, mirroring Slack's "simplest possible connection"
    precedent). Cards go into one chosen list."""

    destination_key = "list_id"

    async def list_destinations(self, ctx: IntegrationContext) -> list[Destination]:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    f"{TRELLO_API_BASE}/members/me/boards",
                    params={
                        **_auth(ctx.config),
                        "filter": "open",
                        "fields": "name",
                        "lists": "open",
                        "list_fields": "name",
                    },
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Could not load Trello boards: {http_error_detail(exc)}"
            ) from exc
        return [
            Destination(id=trello_list["id"], name=trello_list["name"], group=board["name"])
            for board in response.json()
            for trello_list in board.get("lists", [])
        ]

    async def create_item(
        self, comment: CommentOut, ctx: IntegrationContext, *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (card_id, card_url)."""
        config = ctx.config
        try:
            auth = _auth(config)
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{TRELLO_API_BASE}/cards",
                    params={
                        **auth,
                        "idList": config["list_id"],
                        "name": issue_title(comment),
                        "desc": plain_description(comment, backlink_url),
                    },
                )
                response.raise_for_status()
                card = response.json()

                if comment.screenshot_url:
                    try:
                        screenshot_bytes = await fetch_screenshot(comment.screenshot_url)
                        await client.post(
                            f"{TRELLO_API_BASE}/cards/{card['id']}/attachments",
                            params=auth,
                            files={"file": ("screenshot.png", screenshot_bytes, "image/png")},
                        )
                    except httpx.HTTPError as exc:
                        # Best-effort cleanup: the card already exists server-side, so
                        # without this a failed attachment upload leaves an orphaned card
                        # and a retry would create a duplicate.
                        try:
                            await client.delete(
                                f"{TRELLO_API_BASE}/cards/{card['id']}", params=auth
                            )
                        except httpx.HTTPError:
                            pass
                        raise ExternalServiceError(f"Trello card creation failed: {exc}") from exc
                return card["id"], card["shortUrl"]
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Trello card creation failed: {http_error_detail(exc)}"
            ) from exc
        except KeyError as exc:
            raise ExternalServiceError(f"Trello returned an unexpected response: {exc}") from exc

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{TRELLO_API_BASE}/members/me", params=_auth(ctx.config)
                )
            return response.status_code == 200
        except httpx.HTTPError:
            return False
