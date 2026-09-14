"""The Backline-hosted MCP server (docs/implementation/slack-ai-mcp-architecture.md
§2) - mounted at /mcp in app/main.py as its own Starlette app, separate from the
FastAPI REST surface. A user pastes a personal access token (modules/mcp/router.py)
into their own tool's MCP client config as an `Authorization: Bearer <token>` header;
this server verifies it via BacklineTokenVerifier and exposes exactly one tool.
"""

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.shared.exceptions import McpError
from mcp.types import INVALID_REQUEST, ErrorData
from pydantic import AnyHttpUrl

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import NotFoundError
from app.modules.mcp import service as mcp_service
from app.modules.mcp.service import BacklineTokenVerifier, unpack_actor


def _build_mcp() -> FastMCP:
    settings = get_settings()
    return FastMCP(
        name="Backline",
        instructions=(
            "Pull structured implementation prompts from Backline review comments/"
            "tickets. Each prompt includes the comment body, full reply thread, page/"
            "browser context, and a screenshot URL where one exists."
        ),
        token_verifier=BacklineTokenVerifier(),
        auth=AuthSettings(
            issuer_url=AnyHttpUrl(settings.public_api_base_url),
            resource_server_url=None,
        ),
        # Each HTTP request is independent - there's no multi-call session state this
        # server needs to remember between a client's tool calls.
        stateless_http=True,
        # "/" here, not the SDK's own "/mcp" default: main.py mounts the returned
        # Starlette app *at* "/mcp" (app.mount("/mcp", ...)), so the sub-app's own
        # internal route must be root-relative or the reachable path becomes the
        # doubled-up "/mcp/mcp".
        streamable_http_path="/",
    )


mcp = _build_mcp()


@mcp.tool()
async def generate_implementation_prompt(comment_id: str) -> str:
    """Generate a structured implementation prompt for a Backline comment or ticket,
    built from its body, full reply thread, page/browser context, and screenshot URL.
    Pass the comment_id shown in the Backline dashboard URL or ticket reference."""
    access_token = get_access_token()
    if access_token is None:
        # RequireAuthMiddleware (mcp.server.auth) already rejects unauthenticated
        # requests before this tool ever runs - this is unreachable in practice, not a
        # real auth gate.
        raise McpError(ErrorData(code=INVALID_REQUEST, message="Not authenticated."))

    _user_id, workspace_id = unpack_actor(access_token.client_id)
    try:
        result = await mcp_service.generate_implementation_prompt(
            get_db(), workspace_id=workspace_id, comment_id=comment_id, agent="other"
        )
    except NotFoundError as exc:
        raise McpError(ErrorData(code=INVALID_REQUEST, message=str(exc))) from exc
    return result.implementation_prompt
