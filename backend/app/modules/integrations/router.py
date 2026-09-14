from fastapi import APIRouter, Depends

from app.core.config import get_settings
from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import Session, require_workspace_context, require_workspace_match
from app.modules.integrations import service as integration_service
from app.modules.integrations.schemas import (
    CreateAsanaTaskResult,
    CreateClickUpTaskResult,
    CreateJiraIssueResult,
    CreateTrelloCardResult,
    IntegrationCreate,
    IntegrationOut,
)

router = APIRouter(tags=["integrations"])


@router.get("/workspaces/{workspace_id}/integrations", response_model=list[IntegrationOut])
async def list_integrations(
    workspace_id: str,
    session: Session = Depends(require_permission("integration:manage")),
) -> list[IntegrationOut]:
    require_workspace_match(session, workspace_id)
    return await integration_service.list_integrations(get_db(), workspace_id)


@router.post(
    "/workspaces/{workspace_id}/integrations", response_model=IntegrationOut, status_code=201
)
async def create_integration(
    workspace_id: str,
    body: IntegrationCreate,
    session: Session = Depends(require_permission("integration:manage")),
) -> IntegrationOut:
    require_workspace_match(session, workspace_id)
    return await integration_service.create_integration(
        get_db(), workspace_id=workspace_id, actor_user_id=session.user_id, body=body
    )


@router.delete("/integrations/{integration_id}", status_code=204)
async def disconnect_integration(
    integration_id: str,
    session: Session = Depends(require_permission("integration:manage")),
) -> None:
    await integration_service.disconnect_integration(
        get_db(),
        integration_id=integration_id,
        workspace_id=require_workspace_context(session),
        actor_id=session.user_id,
    )


@router.post(
    "/comments/{comment_id}/integrations/clickup/create-task",
    response_model=CreateClickUpTaskResult,
)
async def create_clickup_task(
    comment_id: str,
    integration_id: str,
    session: Session = Depends(require_permission("comment:create_integration_task")),
) -> CreateClickUpTaskResult:
    return await integration_service.create_clickup_task(
        get_db(),
        comment_id=comment_id,
        workspace_id=require_workspace_context(session),
        integration_id=integration_id,
        dashboard_base_url=get_settings().public_dashboard_base_url,
    )


@router.post(
    "/comments/{comment_id}/integrations/trello/create-card",
    response_model=CreateTrelloCardResult,
)
async def create_trello_card(
    comment_id: str,
    integration_id: str,
    session: Session = Depends(require_permission("comment:create_integration_task")),
) -> CreateTrelloCardResult:
    return await integration_service.create_trello_card(
        get_db(),
        comment_id=comment_id,
        workspace_id=require_workspace_context(session),
        integration_id=integration_id,
        dashboard_base_url=get_settings().public_dashboard_base_url,
    )


@router.post(
    "/comments/{comment_id}/integrations/jira/create-issue",
    response_model=CreateJiraIssueResult,
)
async def create_jira_issue(
    comment_id: str,
    integration_id: str,
    session: Session = Depends(require_permission("comment:create_integration_task")),
) -> CreateJiraIssueResult:
    return await integration_service.create_jira_issue(
        get_db(),
        comment_id=comment_id,
        workspace_id=require_workspace_context(session),
        integration_id=integration_id,
        dashboard_base_url=get_settings().public_dashboard_base_url,
    )


@router.post(
    "/comments/{comment_id}/integrations/asana/create-task",
    response_model=CreateAsanaTaskResult,
)
async def create_asana_task(
    comment_id: str,
    integration_id: str,
    session: Session = Depends(require_permission("comment:create_integration_task")),
) -> CreateAsanaTaskResult:
    return await integration_service.create_asana_task(
        get_db(),
        comment_id=comment_id,
        workspace_id=require_workspace_context(session),
        integration_id=integration_id,
        dashboard_base_url=get_settings().public_dashboard_base_url,
    )
