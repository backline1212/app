from typing import Any

import httpx

from app.core.encryption import decrypt_secret
from app.core.errors import ExternalServiceError
from app.modules.comments.schemas import CommentOut
from app.modules.integrations.base import (
    Destination,
    IntegrationContext,
    http_error_detail,
    issue_title,
    markdown_description,
)

GITHUB_API_BASE = "https://api.github.com"


def _headers(config: dict[str, Any]) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {decrypt_secret(config['token_encrypted'])}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Backline",
    }


class GitHubIntegration:
    """GitHub Issues through a personal access token (fine-grained, with Issues
    read/write on the chosen repositories, or classic with `repo`). GitHub's API has
    no image upload for issues, so the screenshot stays in Backline and the issue
    links back to it."""

    destination_key = "repository"

    async def list_destinations(self, ctx: IntegrationContext) -> list[Destination]:
        try:
            async with httpx.AsyncClient(timeout=15.0, headers=_headers(ctx.config)) as client:
                response = await client.get(
                    f"{GITHUB_API_BASE}/user/repos",
                    params={"per_page": 100, "sort": "updated"},
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Could not load GitHub repositories: {http_error_detail(exc)}"
            ) from exc
        return [
            Destination(
                id=repo["full_name"],
                name=repo["name"],
                group=repo["owner"]["login"],
            )
            for repo in response.json()
            if repo.get("has_issues") and not repo.get("archived")
        ]

    async def create_item(
        self, comment: CommentOut, ctx: IntegrationContext, *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (issue number as "owner/repo#N", issue url)."""
        repository = ctx.config["repository"]
        try:
            async with httpx.AsyncClient(timeout=15.0, headers=_headers(ctx.config)) as client:
                response = await client.post(
                    f"{GITHUB_API_BASE}/repos/{repository}/issues",
                    json={
                        "title": issue_title(comment),
                        "body": markdown_description(comment, backlink_url),
                    },
                )
                response.raise_for_status()
                issue = response.json()
                return f"{repository}#{issue['number']}", issue["html_url"]
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"GitHub issue creation failed: {http_error_detail(exc)}"
            ) from exc
        except KeyError as exc:
            raise ExternalServiceError(f"GitHub returned an unexpected response: {exc}") from exc

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0, headers=_headers(ctx.config)) as client:
                response = await client.get(f"{GITHUB_API_BASE}/user")
            return response.status_code == 200
        except httpx.HTTPError:
            return False
