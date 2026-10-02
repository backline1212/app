from fastapi import APIRouter, Depends, Query, Request

from app.core.config import get_settings
from app.core.db import get_db
from app.core.permissions import require_project_permission
from app.core.rate_limit import actor_rate_limit_key, check_rate_limit
from app.core.redis_client import get_redis
from app.core.session import Session, require_workspace_context
from app.modules.browser_render import service as render_service
from app.modules.browser_render.schemas import Browser, Orientation, RenderRequest, RenderStatusOut

router = APIRouter(tags=["browser-render"])


# Dashboard-only (matches ProjectFooter/BrowserMenu, which only render inside the
# member review workspace, never the guest widget) - same permission pages/router.py
# uses to gate the project review workspace itself.
@router.post(
    "/projects/{project_id}/pages/{page_id}/render",
    response_model=RenderStatusOut,
    status_code=202,
)
async def request_render(
    project_id: str,
    page_id: str,
    body: RenderRequest,
    request: Request,
    session: Session = Depends(require_project_permission("project:render")),
) -> RenderStatusOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("browser-render", request, session),
        limit=settings.browser_render_rate_limit_per_minute,
        window_seconds=60,
    )
    return await render_service.request_render(
        get_db(),
        workspace_id=require_workspace_context(session),
        project_id=project_id,
        page_id=page_id,
        body=body,
    )


@router.get(
    "/projects/{project_id}/pages/{page_id}/render",
    response_model=RenderStatusOut,
)
async def render_status(
    project_id: str,
    page_id: str,
    browser: Browser,
    width: int = Query(ge=200, le=3840),
    height: int = Query(ge=200, le=3840),
    orientation: Orientation = "portrait",
    session: Session = Depends(require_project_permission("project:view")),
) -> RenderStatusOut:
    return await render_service.get_render_status(
        get_db(),
        workspace_id=require_workspace_context(session),
        project_id=project_id,
        page_id=page_id,
        browser=browser,
        width=width,
        height=height,
        orientation=orientation,
    )
