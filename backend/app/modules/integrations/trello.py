from typing import Any

import httpx

from app.core.encryption import decrypt_secret
from app.core.errors import ExternalServiceError
from app.modules.comments.schemas import CommentOut

TRELLO_API_BASE = "https://api.trello.com/1"


def _description_block(comment: CommentOut, backlink_url: str) -> str:
    """Mirrors ClickUp's structured block exactly (17.4: "card description mirrors the
    ClickUp task's structured block")."""
    context = comment.context or {}
    lines = [
        comment.body,
        "",
        "---",
        f"Page: {context.get('url', 'unknown')}",
        f"Browser/OS: {context.get('browser', 'unknown')} / {context.get('os', 'unknown')}",
        f"Device: {context.get('device_type', 'unknown')}",
        f"Backline comment: {backlink_url}",
    ]
    return "\n".join(lines)


class TrelloIntegration:
    """17.4 - same interface, API-key + token connect (no OAuth dance specified for
    Trello in the spec, unlike ClickUp - the agency pastes both from Trello's own
    token-generation page, mirroring Slack's "simplest possible connection" precedent)."""

    async def create_card(
        self, comment: CommentOut, config: dict[str, Any], *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (card_id, card_url). Manual, member-triggered - not part of the
        automatic Integration Protocol, same as ClickUp's create_task."""
        auth = {
            "key": decrypt_secret(config["api_key_encrypted"]),
            "token": decrypt_secret(config["token_encrypted"]),
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{TRELLO_API_BASE}/cards",
                    params={
                        **auth,
                        "idList": config["list_id"],
                        "name": comment.body[:100] or "Backline comment",
                        "desc": _description_block(comment, backlink_url),
                    },
                )
                response.raise_for_status()
                card = response.json()

                if comment.screenshot_url:
                    try:
                        screenshot_bytes = (await client.get(comment.screenshot_url)).content
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
            raise ExternalServiceError(f"Trello card creation failed: {exc}") from exc
        except KeyError as exc:
            raise ExternalServiceError(f"Trello returned an unexpected response: {exc}") from exc

    async def on_comment_created(self, comment: CommentOut, config: dict[str, Any]) -> None:
        # No automatic status sync in MVP (§17.4: "one-directional: Backline -> Trello
        # only," and even that only happens via the manual create-card trigger).
        return None

    async def on_status_changed(self, comment: CommentOut, config: dict[str, Any]) -> None:
        return None

    async def test_connection(self, config: dict[str, Any]) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{TRELLO_API_BASE}/members/me",
                    params={
                        "key": decrypt_secret(config["api_key_encrypted"]),
                        "token": decrypt_secret(config["token_encrypted"]),
                    },
                )
            return response.status_code == 200
        except httpx.HTTPError:
            return False
