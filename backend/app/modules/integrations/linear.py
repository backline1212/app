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
    markdown_description,
)

LINEAR_API_URL = "https://api.linear.app/graphql"

_TEAMS_QUERY = "query Teams { teams(first: 100) { nodes { id name key } } }"
_FILE_UPLOAD_MUTATION = """
mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
  fileUpload(contentType: $contentType, filename: $filename, size: $size) {
    success
    uploadFile { uploadUrl assetUrl headers { key value } }
  }
}
"""
_ISSUE_CREATE_MUTATION = """
mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url } }
}
"""


async def _graphql(
    config: dict[str, Any], query: str, variables: dict[str, Any] | None = None
) -> dict[str, Any]:
    """One GraphQL call. Linear reports most failures as 200 with an `errors` array,
    so both that and a non-2xx status become ExternalServiceError."""
    # Personal API keys go in the Authorization header as-is, without "Bearer".
    headers = {"Authorization": decrypt_secret(config["api_key_encrypted"])}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                LINEAR_API_URL,
                headers=headers,
                json={"query": query, "variables": variables or {}},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ExternalServiceError(f"Linear request failed: {http_error_detail(exc)}") from exc
    body: dict[str, Any] = response.json()
    if body.get("errors"):
        message = body["errors"][0].get("message", "unknown error")
        raise ExternalServiceError(f"Linear request failed: {message}")
    data: dict[str, Any] = body.get("data") or {}
    return data


async def _upload_screenshot(config: dict[str, Any], comment: CommentOut) -> str:
    """Markdown for the screenshot hosted on Linear's own storage, or "" when there is
    none or the upload fails - the issue is still worth filing without it."""
    if not comment.screenshot_url:
        return ""
    try:
        image = await fetch_screenshot(comment.screenshot_url)
        data = await _graphql(
            config,
            _FILE_UPLOAD_MUTATION,
            {"contentType": "image/png", "filename": "screenshot.png", "size": len(image)},
        )
        upload = data["fileUpload"]["uploadFile"]
        headers = {item["key"]: item["value"] for item in upload.get("headers", [])}
        headers.update({"Content-Type": "image/png", "Cache-Control": "public, max-age=31536000"})
        # A separate client: the signed upload URL is Linear's storage bucket, which
        # must not receive the API key.
        async with httpx.AsyncClient(timeout=20.0) as client:
            put = await client.put(upload["uploadUrl"], content=image, headers=headers)
            put.raise_for_status()
        return f"![Screenshot]({upload['assetUrl']})"
    except (ExternalServiceError, httpx.HTTPError, KeyError, TypeError):
        return ""


class LinearIntegration:
    """Linear issues through a personal API key (Settings -> Security & access ->
    Personal API keys). Issues are filed into one chosen team."""

    destination_key = "team_id"

    async def list_destinations(self, ctx: IntegrationContext) -> list[Destination]:
        data = await _graphql(ctx.config, _TEAMS_QUERY)
        return [
            Destination(id=team["id"], name=f"{team['name']} ({team['key']})")
            for team in data.get("teams", {}).get("nodes", [])
        ]

    async def create_item(
        self, comment: CommentOut, ctx: IntegrationContext, *, backlink_url: str
    ) -> tuple[str, str]:
        """Returns (identifier like "ENG-42", issue url)."""
        config = ctx.config
        image_md = await _upload_screenshot(config, comment)
        data = await _graphql(
            config,
            _ISSUE_CREATE_MUTATION,
            {
                "input": {
                    "teamId": config["team_id"],
                    "title": issue_title(comment),
                    "description": markdown_description(comment, backlink_url, image_md=image_md),
                }
            },
        )
        result = data.get("issueCreate") or {}
        issue = result.get("issue")
        if not result.get("success") or not issue:
            raise ExternalServiceError("Linear did not create the issue.")
        return str(issue["identifier"]), str(issue["url"])

    async def test_connection(self, ctx: IntegrationContext) -> bool:
        try:
            data = await _graphql(ctx.config, "query Viewer { viewer { id } }")
            return bool(data.get("viewer", {}).get("id"))
        except ExternalServiceError:
            return False
