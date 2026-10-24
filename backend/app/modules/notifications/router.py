from datetime import datetime

from fastapi import APIRouter, Depends, Query

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import Session, require_workspace_context
from app.modules.notifications import service as notification_service
from app.modules.notifications.schemas import NotificationOut

router = APIRouter(tags=["notifications"])


@router.get("/notifications", response_model=list[NotificationOut])
async def list_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    before: datetime | None = None,
    session: Session = Depends(require_permission("notification:manage")),
) -> list[NotificationOut]:
    return await notification_service.list_notifications(
        get_db(),
        workspace_id=require_workspace_context(session),
        user_id=session.user_id,
        limit=limit,
        before=before,
    )


@router.get("/notifications/unread-count", response_model=int)
async def unread_count(
    session: Session = Depends(require_permission("notification:manage")),
) -> int:
    return await notification_service.count_unread(
        get_db(), workspace_id=require_workspace_context(session), user_id=session.user_id
    )


@router.patch("/notifications/{notification_id}/read", status_code=204)
async def mark_read(
    notification_id: str,
    session: Session = Depends(require_permission("notification:manage")),
) -> None:
    await notification_service.mark_read(
        get_db(),
        notification_id=notification_id,
        workspace_id=require_workspace_context(session),
        user_id=session.user_id,
    )


@router.post("/notifications/mark-all-read", status_code=204)
async def mark_all_read(
    session: Session = Depends(require_permission("notification:manage")),
) -> None:
    await notification_service.mark_all_read(
        get_db(), workspace_id=require_workspace_context(session), user_id=session.user_id
    )
