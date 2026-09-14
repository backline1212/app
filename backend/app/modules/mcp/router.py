from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import Session, require_workspace_context, require_workspace_match
from app.modules.mcp import service as mcp_service
from app.modules.mcp.schemas import (
    GeneratePromptRequest,
    GeneratePromptResult,
    McpTokenCreate,
    McpTokenIssued,
    McpTokenOut,
)

router = APIRouter(tags=["mcp"])


@router.get("/workspaces/{workspace_id}/mcp/tokens", response_model=list[McpTokenOut])
async def list_mcp_tokens(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> list[McpTokenOut]:
    require_workspace_match(session, workspace_id)
    return await mcp_service.list_tokens(
        get_db(), workspace_id=workspace_id, user_id=session.user_id
    )


@router.post(
    "/workspaces/{workspace_id}/mcp/tokens", response_model=McpTokenIssued, status_code=201
)
async def create_mcp_token(
    workspace_id: str,
    body: McpTokenCreate,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> McpTokenIssued:
    require_workspace_match(session, workspace_id)
    return await mcp_service.issue_token(
        get_db(),
        user_id=session.user_id,
        workspace_id=workspace_id,
        label=body.label,
        agent_hint=body.agent_hint,
    )


@router.delete("/mcp/tokens/{token_id}", status_code=204)
async def revoke_mcp_token(
    token_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> None:
    await mcp_service.revoke_token(get_db(), token_id=token_id, actor_user_id=session.user_id)


@router.post(
    "/comments/{comment_id}/mcp/generate-prompt",
    response_model=GeneratePromptResult,
)
async def generate_prompt(
    comment_id: str,
    body: GeneratePromptRequest,
    session: Session = Depends(require_permission("comment:view_team")),
) -> GeneratePromptResult:
    """The dashboard's own "Generate implementation prompt" action (copy-paste flow) -
    session-authenticated, distinct from the PAT-authenticated MCP tool in
    modules/mcp/server.py that an already-connected agent calls directly."""
    return await mcp_service.generate_implementation_prompt(
        get_db(),
        workspace_id=require_workspace_context(session),
        comment_id=comment_id,
        agent=body.agent,
    )
