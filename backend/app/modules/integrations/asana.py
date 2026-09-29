import asyncio
from typing import Any

import httpx

from app.core.config import get_settings
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
            raise ExternalServiceError(
                f"Asana token exchange failed: {http_error_detail(exc)}"
            ) from exc
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
            raise ExternalServiceError(
                f"Asana token refresh failed: {http_error_detail(exc)}"
            ) from exc
    access_token: str = response.json()["access_token"]
    return access_token


async def _access_token(config: dict[str, Any]) -> str:
    """A personal access token is used as-is; an OAuth connection trades its stored
    refresh token for a short-lived access token on every call."""
    if config.get("access_token_encrypted"):
        return decrypt_secret(config["access_token_encrypted"])
    return await _refresh_access_token(decrypt_secret(config["refresh_token_encrypted"]))


class AsanaIntegration:
    destination_key = "project_gid"

    async def list_destinations(self, ctx: IntegrationContext) -> list[Destination]:
        access_token = await _access_token(ctx.config)
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:
                response = await client.get(
                    f"{ASANA_API_BASE}/workspaces", params={"opt_fields": "name", "limit": 100}
                )
                response.raise_for_status()
                workspaces = response.json()["data"]

                async def projects_for(workspace: dict[str, Any]) -> list[Destination]:
                    reply = await client.get(
                        f"{ASANA_API_BASE}/projects",
                        params={
                            "workspace": workspace["gid"],
                            "archived": "false",
                            "opt_fields": "name",
                            "limit": 100,
                        },
                    )
                    reply.raise_for_status()
                    return [
                        Destination(
                            id=project["gid"], name=project["name"], group=workspace["name"]
                        )
                        for project in reply.json()["data"]
                    ]

                groups = await asyncio.gather(*(projects_for(w) for w in workspaces))
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Could not load Asana projects: {http_error_detail(exc)}"
            ) from exc
        return [destination for group in groups for destination in group]

    async def create_item(
        self, comment: CommentOut, ctx: IntegrationContext, *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (task_gid, permalink_url)."""
        config = ctx.config
        access_token = await _access_token(config)
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{ASANA_API_BASE}/tasks",
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={
                        "data": {
                            "name": issue_title(comment),
                            "notes": plain_description(comment, backlink_url),
                            "projects": [config["project_gid"]],
                        }
                    },
                )
                response.raise_for_status()
                task = response.json()["data"]

                if comment.screenshot_url:
                    try:
                        screenshot_bytes = await fetch_screenshot(comment.screenshot_url)
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
            raise ExternalServiceError(
                f"Asana task creation failed: {http_error_detail(exc)}"
            ) from exc
        except KeyError as exc:
            raise ExternalServiceError(f"Asana returned an unexpected response: {exc}") from exc

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            access_token = await _access_token(ctx.config)
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{ASANA_API_BASE}/users/me",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            return response.status_code == 200
        except (ExternalServiceError, httpx.HTTPError):
            return False
