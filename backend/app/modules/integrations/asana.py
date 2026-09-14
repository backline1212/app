from typing import Any

import httpx

from app.core.config import get_settings
from app.core.encryption import decrypt_secret
from app.core.errors import ExternalServiceError
from app.modules.comments.schemas import CommentOut

ASANA_AUTH_BASE = "https://app.asana.com/-/oauth_token"
ASANA_API_BASE = "https://app.asana.com/api/1.0"


async def exchange_code_for_refresh_token(code: str) -> str:
    """Unlike Jira, Asana's refresh token is not single-use/rotated on refresh - it
    stays valid until the user revokes access, so only it (not the short-lived access
    token) needs to be stored."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                ASANA_AUTH_BASE,
                data={
                    "grant_type": "authorization_code",
                    "client_id": settings.asana_oauth_client_id,
                    "client_secret": settings.asana_oauth_client_secret,
                    "redirect_uri": settings.asana_oauth_redirect_uri,
                    "code": code,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(f"Asana token exchange failed: {exc}") from exc
    refresh_token: str = response.json()["refresh_token"]
    return refresh_token


async def _refresh_access_token(refresh_token: str) -> str:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                ASANA_AUTH_BASE,
                data={
                    "grant_type": "refresh_token",
                    "client_id": settings.asana_oauth_client_id,
                    "client_secret": settings.asana_oauth_client_secret,
                    "refresh_token": refresh_token,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(f"Asana token refresh failed: {exc}") from exc
    access_token: str = response.json()["access_token"]
    return access_token


def _notes_block(comment: CommentOut, backlink_url: str) -> str:
    """Mirrors ClickUp/Trello's structured block."""
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


class AsanaIntegration:
    async def create_task(
        self, comment: CommentOut, config: dict[str, Any], *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (task_gid, permalink_url). Manual, member-triggered - not part of
        the automatic Integration Protocol, same as ClickUp's create_task."""
        refresh_token = decrypt_secret(config["refresh_token_encrypted"])
        access_token = await _refresh_access_token(refresh_token)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{ASANA_API_BASE}/tasks",
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={
                        "data": {
                            "name": comment.body[:100] or "Backline comment",
                            "notes": _notes_block(comment, backlink_url),
                            "projects": [config["project_gid"]],
                        }
                    },
                )
                response.raise_for_status()
                task = response.json()["data"]

                if comment.screenshot_url:
                    try:
                        screenshot_bytes = (await client.get(comment.screenshot_url)).content
                        await client.post(
                            f"{ASANA_API_BASE}/tasks/{task['gid']}/attachments",
                            headers={"Authorization": f"Bearer {access_token}"},
                            files={"file": ("screenshot.png", screenshot_bytes, "image/png")},
                        )
                    except httpx.HTTPError as exc:
                        # Best-effort cleanup: the task already exists server-side, so
                        # without this a failed attachment upload leaves an orphaned
                        # task and a retry would create a duplicate.
                        try:
                            await client.delete(
                                f"{ASANA_API_BASE}/tasks/{task['gid']}",
                                headers={"Authorization": f"Bearer {access_token}"},
                            )
                        except httpx.HTTPError:
                            pass
                        raise ExternalServiceError(f"Asana task creation failed: {exc}") from exc
                return task["gid"], task["permalink_url"]
        except httpx.HTTPError as exc:
            raise ExternalServiceError(f"Asana task creation failed: {exc}") from exc
        except KeyError as exc:
            raise ExternalServiceError(f"Asana returned an unexpected response: {exc}") from exc

    async def on_comment_created(self, comment: CommentOut, config: dict[str, Any]) -> None:
        # Manual-trigger only in MVP, same as ClickUp/Trello.
        return None

    async def on_status_changed(self, comment: CommentOut, config: dict[str, Any]) -> None:
        return None

    async def test_connection(self, config: dict[str, Any]) -> bool:
        try:
            await _refresh_access_token(decrypt_secret(config["refresh_token_encrypted"]))
            return True
        except ExternalServiceError:
            return False
