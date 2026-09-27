from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.redis_client import get_redis
from app.core.session import Session, require_workspace_context
from app.modules.session_sync import service as session_sync_service
from app.modules.session_sync.schemas import SessionSyncCreate, SessionSyncTicketOut

router = APIRouter(tags=["session-sync"])


@router.post(
    "/projects/{project_id}/session-sync",
    response_model=SessionSyncTicketOut,
    status_code=201,
)
async def create_session_sync_ticket(
    project_id: str,
    body: SessionSyncCreate,
    session: Session = Depends(require_permission("project:manage")),
) -> SessionSyncTicketOut:
    """Called by the Backline browser extension (docs/tdr/0041), never the dashboard
    itself - the payload is cookies/localStorage read from the member's own real,
    signed-in browser tab, which only the extension (chrome.cookies, HttpOnly included)
    can see. Same permission browser_render's dashboard-only actions use."""
    return await session_sync_service.create_ticket(
        get_db(),
        get_redis(),
        workspace_id=require_workspace_context(session),
        project_id=project_id,
        body=body,
    )
