from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.redis_client import get_redis
from app.core.session import Session, require_workspace_context
from app.modules.cloud_login import service as cloud_login_service
from app.modules.cloud_login.schemas import CloudLoginSessionOut

router = APIRouter(tags=["cloud-login"])


@router.post(
    "/projects/{project_id}/cloud-login/sessions",
    response_model=CloudLoginSessionOut,
    status_code=201,
)
async def create_cloud_login_session(
    project_id: str,
    session: Session = Depends(require_permission("project:manage")),
) -> CloudLoginSessionOut:
    """Mints a ticket for the separate cloud-login-browser service to redeem when the
    member's browser opens the returned `ws_url` - this endpoint itself never touches
    Playwright (docs/tdr/0042), so it stays on the main API like everything else here."""
    return await cloud_login_service.create_session_ticket(
        get_db(),
        get_redis(),
        workspace_id=require_workspace_context(session),
        project_id=project_id,
    )
