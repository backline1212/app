from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse

from app.core.db import get_db
from app.core.email_layout import render_email
from app.core.permissions import require_permission
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.redis_client import get_redis
from app.core.session import Session, require_workspace_context
from app.modules.notifications import service as notification_service
from app.modules.notifications import unsubscribe as unsubscribe_service
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


# A standalone page on the API origin: inline styles only, no scripts, posts to itself.
_PAGE_CSP = (
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
    "base-uri 'none'; frame-ancestors 'none'"
)


def _page(title: str, body: str, status_code: int = 200) -> HTMLResponse:
    return HTMLResponse(
        render_email(subject=title, content_html=body),
        status_code=status_code,
        headers={"Content-Security-Policy": _PAGE_CSP},
    )


async def _limit(request: Request) -> None:
    await check_rate_limit(
        get_redis(),
        key=f"rate-limit:email-unsubscribe:{get_client_ip(request)}",
        limit=30,
        window_seconds=60,
    )


_INVALID = (
    "<p>This unsubscribe link isn't valid any more. You can change which emails you get "
    "in {settings}.</p>"
)


@router.get("/email/unsubscribe/{token}", response_class=HTMLResponse, include_in_schema=False)
async def unsubscribe_page(token: str, request: Request) -> HTMLResponse:
    """Confirmation only - opening the link never changes anything by itself."""
    await _limit(request)
    label = unsubscribe_service.label_for(token)
    settings = unsubscribe_service.settings_link()
    if label is None:
        return _page("Unsubscribe", _INVALID.format(settings=settings), 404)
    return _page(
        "Unsubscribe",
        f"<p>Stop receiving Backline {label}?</p>"
        '<form method="post"><button type="submit" style="padding:10px 18px;border:0;'
        "border-radius:6px;background:#16201b;color:#fff;font:600 14px/1 inherit;"
        'cursor:pointer;">Unsubscribe</button></form>'
        f"<p>You can turn them back on at any time in {settings}.</p>",
    )


@router.post("/email/unsubscribe/{token}", response_class=HTMLResponse, include_in_schema=False)
async def unsubscribe_now(token: str, request: Request) -> HTMLResponse:
    """RFC 8058 one-click: mail providers POST here straight from the inbox."""
    await _limit(request)
    label = await unsubscribe_service.unsubscribe(get_db(), token)
    settings = unsubscribe_service.settings_link()
    if label is None:
        return _page("Unsubscribe", _INVALID.format(settings=settings), 404)
    return _page(
        "Unsubscribed",
        f"<p>Done. You won't get Backline {label} any more.</p>"
        f"<p>You can turn them back on at any time in {settings}.</p>",
    )
