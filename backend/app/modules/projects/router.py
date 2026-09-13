from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import Session, require_workspace_context, require_workspace_match
from app.modules.projects import deletion_service
from app.modules.projects import service as project_service
from app.modules.projects.schemas import (
    ProjectCreate,
    ProjectHardDeleteConfirm,
    ProjectHardDeletePreviewOut,
    ProjectHardDeleteResult,
    ProjectOut,
    ProjectResolve,
    ProjectSettingsOut,
    ProjectSettingsUpdate,
    ProjectUpdate,
)

router = APIRouter(tags=["projects"])


@router.get("/workspaces/{workspace_id}/projects", response_model=list[ProjectOut])
async def list_projects(
    workspace_id: str,
    include_archived: bool = False,
    session: Session = Depends(require_permission("project:manage")),
) -> list[ProjectOut]:
    require_workspace_match(session, workspace_id)
    return await project_service.list_projects(
        get_db(), workspace_id, include_archived=include_archived
    )


@router.post("/workspaces/{workspace_id}/projects", response_model=ProjectOut, status_code=201)
async def create_project(
    workspace_id: str,
    body: ProjectCreate,
    session: Session = Depends(require_permission("project:manage")),
) -> ProjectOut:
    require_workspace_match(session, workspace_id)
    return await project_service.create_project(
        get_db(),
        workspace_id=workspace_id,
        actor_user_id=session.user_id,
        name=body.name,
        target_origin=body.target_origin,
        project_type=body.project_type,
        environment=body.environment,
        client_id=body.client_id,
        hero_url=body.hero_url,
    )


@router.post(
    "/workspaces/{workspace_id}/projects/resolve", response_model=ProjectOut, status_code=200
)
async def resolve_project(
    workspace_id: str,
    body: ProjectResolve,
    session: Session = Depends(require_permission("project:manage")),
) -> ProjectOut:
    """Browser-extension "auto-detect current site" flow: finds the existing website
    project for this origin, or creates one - so the extension never has to already
    know whether a project exists before it can register a page/comment against it."""
    require_workspace_match(session, workspace_id)
    return await project_service.find_or_create_project_for_origin(
        get_db(),
        workspace_id=workspace_id,
        actor_user_id=session.user_id,
        target_origin=body.target_origin,
        name=body.name,
    )


@router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: str,
    session: Session = Depends(require_permission("project:manage")),
) -> ProjectOut:
    return await project_service.get_project(
        get_db(), project_id=project_id, workspace_id=require_workspace_context(session)
    )


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    session: Session = Depends(require_permission("project:manage")),
) -> ProjectOut:
    return await project_service.update_project(
        get_db(),
        project_id=project_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
        name=body.name,
        target_origin=body.target_origin,
        changes=body,
    )


@router.delete("/projects/{project_id}", status_code=204)
async def archive_project(
    project_id: str,
    session: Session = Depends(require_permission("project:manage")),
) -> None:
    await project_service.archive_project(
        get_db(),
        project_id=project_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
    )


@router.post("/projects/{project_id}/restore", response_model=ProjectOut)
async def restore_project(
    project_id: str,
    session: Session = Depends(require_permission("project:manage")),
) -> ProjectOut:
    return await project_service.restore_project(
        get_db(),
        project_id=project_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
    )


@router.patch("/projects/{project_id}/settings", response_model=ProjectSettingsOut)
async def update_project_settings(
    project_id: str,
    body: ProjectSettingsUpdate,
    session: Session = Depends(require_permission("project:manage")),
) -> ProjectSettingsOut:
    """FD-AUD-018: persist the five review-settings flags for a project."""
    return await project_service.update_project_settings(
        get_db(),
        project_id=project_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
        settings=body,
    )


@router.post("/projects/{project_id}/duplicate", response_model=ProjectOut, status_code=201)
async def duplicate_project(
    project_id: str,
    session: Session = Depends(require_permission("project:manage")),
) -> ProjectOut:
    return await project_service.duplicate_project(
        get_db(),
        project_id=project_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
    )


@router.post(
    "/projects/{project_id}/hard-delete/preview",
    response_model=ProjectHardDeletePreviewOut,
)
async def preview_hard_delete_project(
    project_id: str,
    session: Session = Depends(require_permission("project:hard_delete")),
) -> ProjectHardDeletePreviewOut:
    return await deletion_service.preview_hard_delete(
        get_db(),
        project_id=project_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
    )


@router.post(
    "/projects/{project_id}/hard-delete/confirm",
    response_model=ProjectHardDeleteResult,
)
async def confirm_hard_delete_project(
    project_id: str,
    body: ProjectHardDeleteConfirm,
    session: Session = Depends(require_permission("project:hard_delete")),
) -> ProjectHardDeleteResult:
    return await deletion_service.confirm_hard_delete(
        get_db(),
        project_id=project_id,
        workspace_id=require_workspace_context(session),
        actor_user_id=session.user_id,
        confirmation=body,
    )


@router.get("/projects/{project_id}/export")
async def export_project(
    project_id: str,
    session: Session = Depends(require_permission("project:manage")),
) -> PlainTextResponse:
    csv_content = await project_service.export_project_comments(
        get_db(),
        project_id=project_id,
        workspace_id=require_workspace_context(session),
    )
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="project_{project_id}_comments.csv"'
        },
    )
