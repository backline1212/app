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

CLICKUP_API_BASE = "https://api.clickup.com/api/v2"
# A destination picker, not an export: stop walking a very large ClickUp account once
# this many lists have been found.
_MAX_DESTINATIONS = 500


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
            raise ExternalServiceError(
                f"ClickUp token exchange failed: {http_error_detail(exc)}"
            ) from exc
    token: str = response.json()["access_token"]
    return token


def _token(config: dict[str, Any]) -> str:
    """OAuth connections store `oauth_token_encrypted`; personal-token connections
    store `api_token_encrypted`. ClickUp takes either, unprefixed, in the same
    Authorization header."""
    encrypted = config.get("oauth_token_encrypted") or config["api_token_encrypted"]
    return decrypt_secret(encrypted)


class ClickUpIntegration:
    destination_key = "list_id"

    async def list_destinations(self, ctx: IntegrationContext) -> list[Destination]:
        headers = {"Authorization": _token(ctx.config)}
        destinations: list[Destination] = []
        try:
            async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:

                async def get(path: str, **params: Any) -> dict[str, Any]:
                    response = await client.get(f"{CLICKUP_API_BASE}{path}", params=params)
                    response.raise_for_status()
                    body: dict[str, Any] = response.json()
                    return body

                teams = (await get("/team")).get("teams", [])
                for team in teams:
                    spaces = (await get(f"/team/{team['id']}/space", archived="false")).get(
                        "spaces", []
                    )
                    for space in spaces:
                        folders, loose = await asyncio.gather(
                            get(f"/space/{space['id']}/folder", archived="false"),
                            get(f"/space/{space['id']}/list", archived="false"),
                        )
                        group = f"{team['name']} › {space['name']}"
                        destinations.extend(
                            Destination(id=item["id"], name=item["name"], group=group)
                            for item in loose.get("lists", [])
                        )
                        for folder in folders.get("folders", []):
                            destinations.extend(
                                Destination(
                                    id=item["id"],
                                    name=item["name"],
                                    group=f"{group} › {folder['name']}",
                                )
                                for item in folder.get("lists", [])
                            )
                        if len(destinations) >= _MAX_DESTINATIONS:
                            return destinations[:_MAX_DESTINATIONS]
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Could not load ClickUp lists: {http_error_detail(exc)}"
            ) from exc
        return destinations

    async def create_item(
        self, comment: CommentOut, ctx: IntegrationContext, *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (task_id, task_url). The manual, member-triggered action."""
        config = ctx.config
        try:
            token = _token(config)
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{CLICKUP_API_BASE}/list/{config['list_id']}/task",
                    headers={"Authorization": token},
                    json={
                        "name": issue_title(comment),
                        "description": plain_description(comment, backlink_url),
                    },
                )
                response.raise_for_status()
                task = response.json()

                if comment.screenshot_url:
                    try:
                        screenshot_bytes = await fetch_screenshot(comment.screenshot_url)
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
            raise ExternalServiceError(
                f"ClickUp task creation failed: {http_error_detail(exc)}"
            ) from exc
        except KeyError as exc:
            raise ExternalServiceError(f"ClickUp returned an unexpected response: {exc}") from exc

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            token = _token(ctx.config)
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{CLICKUP_API_BASE}/user", headers={"Authorization": token}
                )
            return response.status_code == 200
        except httpx.HTTPError:
            return False
