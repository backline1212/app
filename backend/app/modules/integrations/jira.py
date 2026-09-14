from typing import Any

import httpx

from app.core.config import get_settings
from app.core.encryption import decrypt_secret, encrypt_secret
from app.core.errors import ExternalServiceError
from app.modules.comments.schemas import CommentOut
from app.modules.integrations.base import http_error_detail

JIRA_AUTH_BASE = "https://auth.atlassian.com"
JIRA_API_BASE = "https://api.atlassian.com"


async def exchange_code_for_tokens(code: str) -> tuple[str, str]:
    """Returns (access_token, refresh_token). Atlassian's 3LO flow (unlike ClickUp's
    non-expiring token) issues a short-lived (~1h) access token plus a refresh token -
    `offline_access` must be in the authorize-URL scope for a refresh token to come
    back at all."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                f"{JIRA_AUTH_BASE}/oauth/token",
                json={
                    "grant_type": "authorization_code",
                    "client_id": settings.jira_oauth_client_id,
                    "client_secret": settings.jira_oauth_client_secret,
                    "code": code,
                    "redirect_uri": settings.jira_oauth_redirect_uri,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Jira token exchange failed: {http_error_detail(exc)}"
            ) from exc
    body = response.json()
    return body["access_token"], body["refresh_token"]


async def _refresh_access_token(refresh_token: str) -> tuple[str, str]:
    """Returns (access_token, new_refresh_token) - Atlassian rotates the refresh token
    on every use, so the caller must persist the new one or the next refresh fails."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.post(
                f"{JIRA_AUTH_BASE}/oauth/token",
                json={
                    "grant_type": "refresh_token",
                    "client_id": settings.jira_oauth_client_id,
                    "client_secret": settings.jira_oauth_client_secret,
                    "refresh_token": refresh_token,
                },
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Jira token refresh failed: {http_error_detail(exc)}"
            ) from exc
    body = response.json()
    return body["access_token"], body["refresh_token"]


async def fetch_accessible_site(access_token: str) -> tuple[str, str]:
    """Returns (cloud_id, site_url) for the first Jira site this account can reach -
    MVP mirrors ClickUp/Trello's single-destination model rather than letting a member
    pick from multiple connected Jira sites."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                f"{JIRA_API_BASE}/oauth/token/accessible-resources",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Jira site lookup failed: {http_error_detail(exc)}"
            ) from exc
    resources = response.json()
    if not resources:
        raise ExternalServiceError("This Jira account has no accessible sites.")
    return resources[0]["id"], resources[0]["url"]


async def _get_fresh_access_token(
    config: dict[str, Any], *, on_rotate: Any, refetch_config: Any = None
) -> str:
    """Always refreshes rather than trusting a stored access token - create_issue is a
    manual, infrequent action (17-Notifications-Integrations.md's ClickUp/Trello
    pattern), so a stored access token is more likely stale than not by the time it's
    used. `on_rotate` persists the rotated refresh_token back to the integration doc.

    Atlassian invalidates a refresh token the instant it's used, so two concurrent
    create_issue calls for the same integration (two members clicking "Create Jira
    issue" close together) race: whichever refreshes first invalidates the token the
    other just read. Rather than fail the loser outright, `refetch_config` (when given)
    re-reads the integration's current config_json and retries once with whatever
    refresh_token is there now - by the time the loser's Atlassian round trip has
    failed and it retries, the winner's rotated token has almost always already been
    persisted."""
    refresh_token = decrypt_secret(config["refresh_token_encrypted"])
    try:
        access_token, new_refresh_token = await _refresh_access_token(refresh_token)
    except ExternalServiceError:
        if refetch_config is None:
            raise
        fresh_config = await refetch_config()
        if fresh_config is None:
            raise
        refresh_token = decrypt_secret(fresh_config["refresh_token_encrypted"])
        access_token, new_refresh_token = await _refresh_access_token(refresh_token)
    await on_rotate(encrypt_secret(new_refresh_token))
    return access_token


def _adf_description(comment: CommentOut, backlink_url: str) -> dict[str, Any]:
    """Jira's v3 issue API requires the description in Atlassian Document Format, not
    a plain string - this is the minimal single-paragraph-per-line shape ADF accepts."""
    context = comment.context or {}
    lines = [
        comment.body,
        "",
        f"Page: {context.get('url', 'unknown')}",
        f"Browser/OS: {context.get('browser', 'unknown')} / {context.get('os', 'unknown')}",
        f"Device: {context.get('device_type', 'unknown')}",
        f"Backline comment: {backlink_url}",
    ]
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": line}]}
            for line in lines
            if line
        ],
    }


class JiraIntegration:
    async def create_issue(
        self,
        comment: CommentOut,
        config: dict[str, Any],
        *,
        backlink_url: str,
        on_rotate: Any,
        refetch_config: Any = None,
    ) -> tuple[str, str]:
        """Returns (issue_key, issue_url). Manual, member-triggered - not part of the
        automatic Integration Protocol, same as ClickUp's create_task."""
        access_token = await _get_fresh_access_token(
            config, on_rotate=on_rotate, refetch_config=refetch_config
        )
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{JIRA_API_BASE}/ex/jira/{config['cloud_id']}/rest/api/3/issue",
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={
                        "fields": {
                            "project": {"key": config["project_key"]},
                            "summary": comment.body[:100] or "Backline comment",
                            "description": _adf_description(comment, backlink_url),
                            "issuetype": {"name": "Task"},
                        }
                    },
                )
                response.raise_for_status()
                issue = response.json()

                if comment.screenshot_url:
                    try:
                        screenshot_bytes = (await client.get(comment.screenshot_url)).content
                        await client.post(
                            f"{JIRA_API_BASE}/ex/jira/{config['cloud_id']}"
                            f"/rest/api/3/issue/{issue['key']}/attachments",
                            headers={
                                "Authorization": f"Bearer {access_token}",
                                "X-Atlassian-Token": "no-check",
                            },
                            files={"file": ("screenshot.png", screenshot_bytes, "image/png")},
                        )
                    except httpx.HTTPError as exc:
                        # Best-effort cleanup: the issue already exists server-side, so
                        # without this a failed attachment upload leaves an orphaned
                        # issue and a retry would create a duplicate.
                        try:
                            await client.delete(
                                f"{JIRA_API_BASE}/ex/jira/{config['cloud_id']}"
                                f"/rest/api/3/issue/{issue['key']}",
                                headers={"Authorization": f"Bearer {access_token}"},
                            )
                        except httpx.HTTPError:
                            pass
                        raise ExternalServiceError(f"Jira issue creation failed: {exc}") from exc

                issue_url = f"{config['site_url']}/browse/{issue['key']}"
                return issue["key"], issue_url
        except httpx.HTTPError as exc:
            raise ExternalServiceError(f"Jira issue creation failed: {exc}") from exc
        except KeyError as exc:
            raise ExternalServiceError(f"Jira returned an unexpected response: {exc}") from exc

    async def on_comment_created(self, comment: CommentOut, config: dict[str, Any]) -> None:
        # Manual-trigger only in MVP, same as ClickUp/Trello.
        return None

    async def on_status_changed(self, comment: CommentOut, config: dict[str, Any]) -> None:
        return None

    async def test_connection(self, config: dict[str, Any]) -> bool:
        # Mutates `config` in place with the rotated refresh_token: Atlassian
        # invalidates the token used for this call, so the caller (create_integration,
        # before it persists config_json) must save the *new* one, not the one that
        # was current when this method was entered - otherwise the very first refresh
        # after connecting would fail with an invalidated token.
        try:

            async def _persist_rotate(new_refresh_token_encrypted: str) -> None:
                config["refresh_token_encrypted"] = new_refresh_token_encrypted

            await _get_fresh_access_token(config, on_rotate=_persist_rotate)
            return True
        except ExternalServiceError:
            return False
