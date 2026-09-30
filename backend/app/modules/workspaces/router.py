from fastapi import APIRouter, Depends

from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.session import Session, get_current_session, require_workspace_match
from app.modules.workspaces import service as workspace_service
from app.modules.workspaces.schemas import (
    InviteMemberRequest,
    MemberOut,
    MemberRoleUpdateRequest,
    WorkspaceCreate,
    WorkspaceOut,
    WorkspaceUpdate,
    JoinRequestCreate,
    JoinRequestOut,
    JoinRequestResponse,
)

router = APIRouter(tags=["workspaces"])


@router.get("/workspaces", response_model=list[WorkspaceOut])
async def list_workspaces(session: Session = Depends(get_current_session)) -> list[WorkspaceOut]:
    return await workspace_service.list_my_workspaces(get_db(), session.user_id)


@router.post("/workspaces", response_model=WorkspaceOut, status_code=201)
async def create_workspace(
    body: WorkspaceCreate, session: Session = Depends(get_current_session)
) -> WorkspaceOut:
    return await workspace_service.create_workspace(
        get_db(), user_id=session.user_id, name=body.name
    )


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceOut)
async def get_workspace(
    workspace_id: str, session: Session = Depends(get_current_session)
) -> WorkspaceOut:
    return await workspace_service.get_workspace(
        get_db(), workspace_id=workspace_id, requesting_user_id=session.user_id
    )


@router.patch("/workspaces/{workspace_id}", response_model=WorkspaceOut)
async def update_workspace(
    workspace_id: str,
    body: WorkspaceUpdate,
    session: Session = Depends(require_permission("workspace:update_settings")),
) -> WorkspaceOut:
    require_workspace_match(session, workspace_id)
    return await workspace_service.update_workspace(
        get_db(),
        workspace_id=workspace_id,
        name=body.name,
        room_code=body.room_code,
        join_requires_approval=body.join_requires_approval,
        actor_user_id=session.user_id,
        actor_role=session.role,
    )


@router.get("/workspaces/{workspace_id}/members", response_model=list[MemberOut])
async def list_members(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> list[MemberOut]:
    require_workspace_match(session, workspace_id)
    return await workspace_service.list_members(get_db(), workspace_id)


@router.post("/workspaces/{workspace_id}/members/invite", response_model=MemberOut, status_code=201)
async def invite_member(
    workspace_id: str,
    body: InviteMemberRequest,
    session: Session = Depends(require_permission("member:invite")),
) -> MemberOut:
    require_workspace_match(session, workspace_id)
    return await workspace_service.invite_member(
        get_db(),
        workspace_id=workspace_id,
        inviter_user_id=session.user_id,
        email=body.email,
        role=body.role,
    )


@router.patch("/workspaces/{workspace_id}/members/{member_id}", status_code=204)
async def update_member_role(
    workspace_id: str,
    member_id: str,
    body: MemberRoleUpdateRequest,
    session: Session = Depends(require_permission("member:role_change")),
) -> None:
    require_workspace_match(session, workspace_id)
    await workspace_service.update_member_role(
        get_db(),
        workspace_id=workspace_id,
        membership_id=member_id,
        role=body.role,
        actor_user_id=session.user_id,
    )


@router.delete("/workspaces/{workspace_id}/members/{member_id}", status_code=204)
async def remove_member(
    workspace_id: str,
    member_id: str,
    session: Session = Depends(require_permission("member:remove")),
) -> None:
    require_workspace_match(session, workspace_id)
    await workspace_service.remove_member(
        get_db(), workspace_id=workspace_id, membership_id=member_id, actor_user_id=session.user_id
    )

@router.post("/workspaces/join", response_model=JoinRequestResponse)
async def submit_join_request(
    body: JoinRequestCreate,
    session: Session = Depends(get_current_session)
) -> JoinRequestResponse:
    return await workspace_service.submit_join_request(
        get_db(), room_code=body.room_code, user_id=session.user_id
    )

@router.get("/workspaces/{workspace_id}/join-requests", response_model=list[JoinRequestOut])
async def list_join_requests(
    workspace_id: str,
    session: Session = Depends(require_permission("member:invite")),
) -> list[JoinRequestOut]:
    require_workspace_match(session, workspace_id)
    return await workspace_service.list_join_requests(get_db(), workspace_id)

@router.post("/workspaces/{workspace_id}/join-requests/{request_id}/approve", response_model=MemberOut)
async def approve_join_request(
    workspace_id: str,
    request_id: str,
    session: Session = Depends(require_permission("member:invite")),
) -> MemberOut:
    require_workspace_match(session, workspace_id)
    return await workspace_service.approve_join_request(
        get_db(), workspace_id=workspace_id, request_id=request_id, actor_user_id=session.user_id
    )

@router.post("/workspaces/{workspace_id}/join-requests/{request_id}/reject", status_code=204)
async def reject_join_request(
    workspace_id: str,
    request_id: str,
    session: Session = Depends(require_permission("member:invite")),
) -> None:
    require_workspace_match(session, workspace_id)
    await workspace_service.reject_join_request(
        get_db(), workspace_id=workspace_id, request_id=request_id, actor_user_id=session.user_id
    )
