import base64
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.encryption import decrypt_secret, encrypt_secret
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

JIRA_AUTH_BASE = "https://auth.atlassian.com"
JIRA_API_BASE = "https://api.atlassian.com"
# Preferred issue types for review feedback, in order; anything else in the project
# that isn't a sub-task is the fallback.
_PREFERRED_ISSUE_TYPES = ("Task", "Bug", "Story")


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


async def _get_fresh_access_token(ctx: IntegrationContext) -> str:
    """Always refreshes rather than trusting a stored access token - create_issue is a
    manual, infrequent action, so a stored access token is more likely stale than not
    by the time it's used. The rotated refresh token is written back through `ctx`.

    Atlassian invalidates a refresh token the instant it's used, so two concurrent
    calls for the same integration (two members clicking "Send to Jira" close
    together) race: whichever refreshes first invalidates the token the other just
    read. Rather than fail the loser outright, `ctx.refetch` (when given) re-reads the
    integration's current config_json and retries once with whatever refresh_token is
    there now - by the time the loser's Atlassian round trip has failed and it retries,
    the winner's rotated token has almost always already been persisted."""
    refresh_token = decrypt_secret(ctx.config["refresh_token_encrypted"])
    try:
        access_token, new_refresh_token = await _refresh_access_token(refresh_token)
    except ExternalServiceError:
        if ctx.refetch is None:
            raise
        fresh_config = await ctx.refetch()
        if fresh_config is None:
            raise
        refresh_token = decrypt_secret(fresh_config["refresh_token_encrypted"])
        access_token, new_refresh_token = await _refresh_access_token(refresh_token)
    ctx.config["refresh_token_encrypted"] = encrypt_secret(new_refresh_token)
    await ctx.save()
    return access_token


async def _session(ctx: IntegrationContext) -> tuple[str, dict[str, str]]:
    """(REST base URL, auth headers) for either connection mode.

    - API token: Basic auth with the account email, straight against the site.
    - OAuth (3LO): a bearer token against Atlassian's API gateway for the cloud id.
    """
    config = ctx.config
    if config.get("api_token_encrypted"):
        raw = f"{config['email']}:{decrypt_secret(config['api_token_encrypted'])}"
        credentials = base64.b64encode(raw.encode()).decode()
        return config["site_url"].rstrip("/"), {"Authorization": f"Basic {credentials}"}
    access_token = await _get_fresh_access_token(ctx)
    return (
        f"{JIRA_API_BASE}/ex/jira/{config['cloud_id']}",
        {"Authorization": f"Bearer {access_token}"},
    )


def _adf_description(comment: CommentOut, backlink_url: str) -> dict[str, Any]:
    """Jira's v3 issue API requires the description in Atlassian Document Format, not
    a plain string - this is the minimal single-paragraph-per-line shape ADF accepts."""
    return {
        "type": "doc",
        "version": 1,
        "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": line}]}
            for line in plain_description(comment, backlink_url).splitlines()
            if line.strip()
        ],
    }


def _pick_issue_type(issue_types: list[dict[str, Any]]) -> dict[str, Any] | None:
    usable = [t for t in issue_types if not t.get("subtask")]
    for name in _PREFERRED_ISSUE_TYPES:
        for issue_type in usable:
            if issue_type.get("name") == name:
                return issue_type
    return usable[0] if usable else None


class JiraIntegration:
    destination_key = "project_key"

    async def list_destinations(self, ctx: IntegrationContext) -> list[Destination]:
        base, headers = await _session(ctx)
        try:
            async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
                response = await client.get(
                    f"{base}/rest/api/3/project/search",
                    params={"maxResults": 100, "orderBy": "name", "expand": "issueTypes"},
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Could not load Jira projects: {http_error_detail(exc)}"
            ) from exc
        destinations = []
        for project in response.json().get("values", []):
            issue_type = _pick_issue_type(project.get("issueTypes", []))
            destinations.append(
                Destination(
                    id=project["key"],
                    name=f"{project['name']} ({project['key']})",
                    extra={"issue_type_id": issue_type["id"]} if issue_type else {},
                )
            )
        return destinations

    async def create_item(
        self, comment: CommentOut, ctx: IntegrationContext, *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (issue_key, issue_url)."""
        config = ctx.config
        base, headers = await _session(ctx)
        # Connections made before issue types were picked per project keep asking for
        # "Task", which is what they always asked for.
        issue_type = (
            {"id": config["issue_type_id"]} if config.get("issue_type_id") else {"name": "Task"}
        )
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{base}/rest/api/3/issue",
                    headers=headers,
                    json={
                        "fields": {
                            "project": {"key": config["project_key"]},
                            "summary": issue_title(comment),
                            "description": _adf_description(comment, backlink_url),
                            "issuetype": issue_type,
                        }
                    },
                )
                response.raise_for_status()
                issue = response.json()

                if comment.screenshot_url:
                    try:
                        screenshot_bytes = await fetch_screenshot(comment.screenshot_url)
                        await client.post(
                            f"{base}/rest/api/3/issue/{issue['key']}/attachments",
                            headers={**headers, "X-Atlassian-Token": "no-check"},
                            files={"file": ("screenshot.png", screenshot_bytes, "image/png")},
                        )
                    except httpx.HTTPError as exc:
                        # Best-effort cleanup: the issue already exists server-side, so
                        # without this a failed attachment upload leaves an orphaned
                        # issue and a retry would create a duplicate.
                        try:
                            await client.delete(
                                f"{base}/rest/api/3/issue/{issue['key']}", headers=headers
                            )
                        except httpx.HTTPError:
                            pass
                        raise ExternalServiceError(f"Jira issue creation failed: {exc}") from exc

                issue_url = f"{config['site_url'].rstrip('/')}/browse/{issue['key']}"
                return issue["key"], issue_url
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Jira issue creation failed: {http_error_detail(exc)}"
            ) from exc
        except KeyError as exc:
            raise ExternalServiceError(f"Jira returned an unexpected response: {exc}") from exc

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        """For an OAuth connection this rotates the refresh token: `ctx.config` then
        holds the new one, and the caller (create_integration, before it first
        persists config_json) must save that, not the one it started with."""
        try:
            base, headers = await _session(ctx)
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Not /myself: that needs read:jira-user, which the OAuth authorize URL
                # never asked for. Project search needs only read:jira-work.
                response = await client.get(
                    f"{base}/rest/api/3/project/search",
                    params={"maxResults": 1},
                    headers=headers,
                )
            return response.status_code == 200
        except (ExternalServiceError, httpx.HTTPError):
            return False
