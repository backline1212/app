from fastapi import APIRouter, Depends, Request

from app.core.config import get_settings
from app.core.db import get_db
from app.core.permissions import require_project_permission
from app.core.rate_limit import actor_rate_limit_key, check_rate_limit
from app.core.redis_client import get_redis
from app.core.session import Actor, Session, get_current_actor, require_workspace_context
from app.modules.pages import service as page_service
from app.modules.pages.schemas import PageCreate, PageOut, PageRegister, PageReorder, PageUpdate

router = APIRouter(tags=["pages"])


@router.get("/projects/{project_id}/pages", response_model=list[PageOut])
async def list_pages(
    project_id: str,
    session: Session = Depends(require_project_permission("project:view")),
) -> list[PageOut]:
    return await page_service.list_pages(
        get_db(), project_id=project_id, workspace_id=require_workspace_context(session)
    )


@router.post("/projects/{project_id}/pages", response_model=PageOut, status_code=201)
async def create_page(
    project_id: str,
    body: PageCreate,
    session: Session = Depends(require_project_permission("page:manage")),
) -> PageOut:
    return await page_service.create_page(
        get_db(),
        workspace_id=require_workspace_context(session),
        project_id=project_id,
        actor_user_id=session.user_id,
        url=body.url,
        title=body.title,
    )


@router.patch("/projects/{project_id}/pages/reorder", response_model=list[PageOut])
async def reorder_pages(
    project_id: str,
    body: PageReorder,
    session: Session = Depends(require_project_permission("page:manage")),
) -> list[PageOut]:
    return await page_service.reorder_pages(
        get_db(),
        workspace_id=require_workspace_context(session),
        project_id=project_id,
        actor_user_id=session.user_id,
        body=body,
    )


@router.post("/pages", response_model=PageOut, status_code=201)
async def register_page(
    body: PageRegister, request: Request, actor: Actor = Depends(get_current_actor)
) -> PageOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("page-register", request, actor),
        limit=settings.page_register_rate_limit_per_minute,
        window_seconds=60,
    )
    return await page_service.register_page(
        get_db(), actor=actor, project_id=body.project_id, url=body.url, title=body.title
    )


@router.patch("/pages/{page_id}", response_model=PageOut)
async def update_page(
    page_id: str,
    body: PageUpdate,
    # M-01: dashboard page management (rename/reorder) is a member-only action -
    # guests must never reach it. `register_page` above stays on get_current_actor
    # since guest page *registration* (idempotent, widget-driven) is intentionally
    # separate from staff page *management* here (13-Authentication.md §13.5's
    # permission matrix has no guest page-mutation row at all).
    session: Session = Depends(require_project_permission("page:manage")),
) -> PageOut:
    return await page_service.update_page(
        get_db(),
        workspace_id=require_workspace_context(session),
        page_id=page_id,
        changes=body,
        actor_user_id=session.user_id,
    )


@router.delete("/pages/{page_id}", status_code=204)
async def delete_page(
    page_id: str,
    session: Session = Depends(require_project_permission("page:manage")),
) -> None:
    await page_service.delete_page(
        get_db(),
        workspace_id=require_workspace_context(session),
        page_id=page_id,
        actor_user_id=session.user_id,
    )
