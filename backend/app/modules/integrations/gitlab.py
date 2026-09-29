from typing import Any
from urllib.parse import quote

import httpx

from app.core.encryption import decrypt_secret
from app.core.errors import ExternalServiceError
from app.modules.comments.schemas import CommentOut
from app.modules.integrations.base import (
    Destination,
    IntegrationContext,
    IntegrationDeliveryError,
    assert_public_url,
    fetch_screenshot,
    http_error_detail,
    issue_title,
    markdown_description,
)

GITLAB_DEFAULT_BASE = "https://gitlab.com"


def _base(config: dict[str, Any]) -> str:
    return str(config.get("base_url") or GITLAB_DEFAULT_BASE).rstrip("/")


def _headers(config: dict[str, Any]) -> dict[str, str]:
    return {"PRIVATE-TOKEN": decrypt_secret(config["token_encrypted"])}


async def _guard(config: dict[str, Any]) -> None:
    """A self-managed GitLab URL is typed by an admin, so it gets the same SSRF check as
    a custom webhook before every request (gitlab.com passes trivially)."""
    try:
        await assert_public_url(_base(config))
    except IntegrationDeliveryError as exc:
        raise ExternalServiceError(str(exc)) from exc


class GitLabIntegration:
    """GitLab Issues (gitlab.com or self-managed) through a personal, group or project
    access token with the `api` scope."""

    destination_key = "project_id"

    async def list_destinations(self, ctx: IntegrationContext) -> list[Destination]:
        await _guard(ctx.config)
        try:
            async with httpx.AsyncClient(timeout=15.0, headers=_headers(ctx.config)) as client:
                response = await client.get(
                    f"{_base(ctx.config)}/api/v4/projects",
                    params={
                        "membership": "true",
                        "min_access_level": 20,
                        "simple": "true",
                        "archived": "false",
                        "order_by": "last_activity_at",
                        "per_page": 100,
                    },
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"Could not load GitLab projects: {http_error_detail(exc)}"
            ) from exc
        return [
            Destination(
                id=str(project["id"]),
                name=project["path_with_namespace"],
                extra={"project_path": project["path_with_namespace"]},
            )
            for project in response.json()
        ]

    async def create_item(
        self, comment: CommentOut, ctx: IntegrationContext, *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns ("path!N" style reference, issue url). The screenshot is uploaded to
        the project first and embedded in the description; if that upload fails the
        issue is still filed, pointing at Backline for the image."""
        config = ctx.config
        await _guard(config)
        project = quote(str(config["project_id"]), safe="")
        api = f"{_base(config)}/api/v4/projects/{project}"
        try:
            async with httpx.AsyncClient(timeout=20.0, headers=_headers(config)) as client:
                image_md = ""
                if comment.screenshot_url:
                    try:
                        screenshot_bytes = await fetch_screenshot(comment.screenshot_url)
                        upload = await client.post(
                            f"{api}/uploads",
                            files={"file": ("screenshot.png", screenshot_bytes, "image/png")},
                        )
                        upload.raise_for_status()
                        image_md = str(upload.json().get("markdown", ""))
                    except httpx.HTTPError:
                        image_md = ""
                response = await client.post(
                    f"{api}/issues",
                    json={
                        "title": issue_title(comment),
                        "description": markdown_description(
                            comment, backlink_url, image_md=image_md
                        ),
                    },
                )
                response.raise_for_status()
                issue = response.json()
                reference = issue.get("references", {}).get("full") or f"#{issue['iid']}"
                return str(reference), issue["web_url"]
        except httpx.HTTPError as exc:
            raise ExternalServiceError(
                f"GitLab issue creation failed: {http_error_detail(exc)}"
            ) from exc
        except KeyError as exc:
            raise ExternalServiceError(f"GitLab returned an unexpected response: {exc}") from exc

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            await _guard(ctx.config)
            async with httpx.AsyncClient(timeout=10.0, headers=_headers(ctx.config)) as client:
                response = await client.get(f"{_base(ctx.config)}/api/v4/user")
            return response.status_code == 200
        except (ExternalServiceError, httpx.HTTPError):
            return False
