from typing import Any

import httpx

from app.core.config import get_settings
from app.core.encryption import decrypt_secret
from app.core.errors import ExternalServiceError
from app.modules.comments.schemas import CommentOut

CLICKUP_API_BASE = "https://api.clickup.com/api/v2"


async def exchange_code_for_token(code: str) -> str:
    """17.3's OAuth2 connect flow - mirrors auth/google_oauth.py's shape (server-side
    exchange so the client secret never reaches the frontend)."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                f"{CLICKUP_API_BASE}/oauth/token",
                params={
                    "client_id": settings.clickup_oauth_client_id,
                    "client_secret": settings.clickup_oauth_client_secret,
                    "code": code,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(f"ClickUp token exchange failed: {exc}") from exc
    token: str = response.json()["access_token"]
    return token


def _description_block(comment: CommentOut, backlink_url: str) -> str:
    """17.3's round-trip requirement: body + structured metadata + a backlink to the
    comment's pin in Backline, preserved on every create-task call."""
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


class ClickUpIntegration:
    async def create_task(
        self, comment: CommentOut, config: dict[str, Any], *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (task_id, task_url). Not part of the Integration Protocol (§17.1's
        interface only covers automatic on_comment_created/on_status_changed/
        test_connection) - this is the manual, member-triggered action
        (`POST /comments/{id}/integrations/clickup/create-task`)."""
        try:
            token = decrypt_secret(config["oauth_token_encrypted"])
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{CLICKUP_API_BASE}/list/{config['list_id']}/task",
                    headers={"Authorization": token},
                    json={
                        "name": comment.body[:100] or "Backline comment",
                        "description": _description_block(comment, backlink_url),
                    },
                )
                response.raise_for_status()
                task = response.json()

                if comment.screenshot_url:
                    try:
                        screenshot_bytes = (await client.get(comment.screenshot_url)).content
                        await client.post(
                            f"{CLICKUP_API_BASE}/task/{task['id']}/attachment",
                            headers={"Authorization": token},
                            files={"attachment": ("screenshot.png", screenshot_bytes, "image/png")},
                        )
                    except httpx.HTTPError as exc:
                        # Best-effort cleanup: the task already exists server-side, so
                        # without this a failed attachment upload leaves an orphaned task
                        # and a retry would create a duplicate.
                        try:
                            await client.delete(
                                f"{CLICKUP_API_BASE}/task/{task['id']}",
                                headers={"Authorization": token},
                            )
                        except httpx.HTTPError:
                            pass
                        raise ExternalServiceError(f"ClickUp task creation failed: {exc}") from exc
                return task["id"], task["url"]
        except httpx.HTTPError as exc:
            raise ExternalServiceError(f"ClickUp task creation failed: {exc}") from exc
        except KeyError as exc:
            raise ExternalServiceError(f"ClickUp returned an unexpected response: {exc}") from exc

    async def on_comment_created(self, comment: CommentOut, config: dict[str, Any]) -> None:
        # ClickUp is manual-trigger only in MVP (§17.3) - no automatic event posting.
        return None

    async def on_status_changed(self, comment: CommentOut, config: dict[str, Any]) -> None:
        return None

    async def test_connection(self, config: dict[str, Any]) -> bool:
        token = decrypt_secret(config["oauth_token_encrypted"])
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{CLICKUP_API_BASE}/user", headers={"Authorization": token}
                )
            return response.status_code == 200
        except httpx.HTTPError:
            return False
