from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.db import get_db
from app.core.permissions import require_permission, require_project_permission
from app.core.session import Session, require_workspace_context, require_workspace_match
from app.modules.dashboard import service
from app.modules.dashboard.schemas import (
    ActivityListOut,
    DashboardOut,
    SearchResultsOut,
    TicketCreate,
    TicketFilters,
    TicketListOut,
    TicketOut,
)

router = APIRouter(tags=["dashboard"])


@router.get("/workspaces/{workspace_id}/search", response_model=SearchResultsOut)
async def search(
    workspace_id: str,
    q: str = Query(min_length=1, max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
    session: Session = Depends(require_permission("comment:view_team")),
) -> SearchResultsOut:
    require_workspace_match(session, workspace_id)
    return await service.search(get_db(), workspace_id, q, limit, viewer=session)


@router.get("/workspaces/{workspace_id}/tickets", response_model=TicketListOut)
async def list_tickets(
    workspace_id: str,
    filters: Annotated[TicketFilters, Query()],
    session: Session = Depends(require_permission("comment:view_team")),
) -> TicketListOut:
    require_workspace_match(session, workspace_id)
    return await service.list_tickets(
        get_db(), workspace_id, session.user_id, filters, viewer=session
    )


@router.get("/workspaces/{workspace_id}/dashboard", response_model=DashboardOut)
async def summary(
    workspace_id: str, session: Session = Depends(require_permission("comment:view_team"))
) -> DashboardOut:
    require_workspace_match(session, workspace_id)
    return await service.summary(get_db(), workspace_id, session.user_id, viewer=session)


@router.get("/workspaces/{workspace_id}/activity", response_model=ActivityListOut)
async def activity(
    workspace_id: str,
    offset: int = Query(default=0, ge=0, le=100000),
    limit: int = Query(default=50, ge=1, le=100),
    event_type: str = Query(default="", max_length=80),
    session: Session = Depends(require_permission("comment:view_team")),
) -> ActivityListOut:
    require_workspace_match(session, workspace_id)
    return await service.activity(
        get_db(), workspace_id, session.user_id, offset, limit, event_type, viewer=session
    )


@router.post("/projects/{project_id}/tickets", response_model=TicketOut, status_code=201)
async def create_ticket(
    project_id: str,
    body: TicketCreate,
    session: Session = Depends(require_project_permission("comment:update_status")),
) -> TicketOut:
    return await service.create_ticket(
        get_db(), require_workspace_context(session), project_id, session, body
    )
