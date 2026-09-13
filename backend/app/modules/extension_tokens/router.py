from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import (
    Session,
    get_current_session,
    require_workspace_context,
    require_workspace_match,
)
from app.modules.extension_tokens import service as extension_token_service
from app.modules.extension_tokens.schemas import (
    ExtensionTokenCreate,
    ExtensionTokenIssued,
    ExtensionTokenOut,
    ExtensionWhoAmIOut,
)

router = APIRouter(tags=["extension-tokens"])


@router.get("/extension-tokens/whoami", response_model=ExtensionWhoAmIOut)
async def extension_whoami(
    session: Session = Depends(get_current_session),
) -> ExtensionWhoAmIOut:
    """Lets the extension's popup resolve a freshly-pasted token's workspace, name,
    and role - deliberately not under /auth (see ExtensionWhoAmIOut's docstring)."""
    workspace_id = require_workspace_context(session)
    assert session.role is not None
    return await extension_token_service.whoami(
        get_db(), user_id=session.user_id, workspace_id=workspace_id, role=session.role
    )


@router.get(
    "/workspaces/{workspace_id}/extension-tokens", response_model=list[ExtensionTokenOut]
)
async def list_extension_tokens(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> list[ExtensionTokenOut]:
    require_workspace_match(session, workspace_id)
    return await extension_token_service.list_tokens(
        get_db(), workspace_id=workspace_id, user_id=session.user_id
    )


@router.post(
    "/workspaces/{workspace_id}/extension-tokens",
    response_model=ExtensionTokenIssued,
    status_code=201,
)
async def create_extension_token(
    workspace_id: str,
    body: ExtensionTokenCreate,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> ExtensionTokenIssued:
    require_workspace_match(session, workspace_id)
    assert session.role is not None  # guaranteed by require_permission
    return await extension_token_service.issue_token(
        get_db(),
        user_id=session.user_id,
        workspace_id=workspace_id,
        role=session.role,
        name=body.name,
    )


@router.delete("/extension-tokens/{token_id}", status_code=204)
async def revoke_extension_token(
    token_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> None:
    await extension_token_service.revoke_token(
        get_db(), token_id=token_id, actor_user_id=session.user_id
    )
