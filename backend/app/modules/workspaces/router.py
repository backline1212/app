from fastapi import APIRouter, Depends, Request

from app.core.config import get_settings
from app.core.db import get_db
from app.core.permissions import require_permission
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.core.redis_client import get_redis
from app.core.session import Session, get_current_session, require_workspace_match
from app.modules.workspaces import service as workspace_service
from app.modules.workspaces.schemas import (
    AccessMatrixOut,
    InviteMemberRequest,
    JoinPreviewOut,
    JoinPreviewRequest,
    JoinRequestApprove,
    JoinRequestCreate,
    JoinRequestOut,
    JoinRequestResponse,
    MemberOut,
    MemberProfileUpdate,
    MemberRoleUpdateRequest,
    MyJoinRequestOut,
    RoomCodeSet,
    TransferOwnershipRequest,
    WorkspaceCreate,
    WorkspaceOut,
    WorkspaceUpdate,
)

router = APIRouter(tags=["workspaces"])


async def _room_code_rate_limit(request: Request, session: Session) -> None:
    """Per person and per IP, so neither a script on one account nor one machine
    cycling accounts can churn through codes or flood admins with requests."""
    limit = get_settings().room_code_rate_limit_per_minute
    for key in (
        f"rate-limit:room-code:user:{session.user_id}",
        f"rate-limit:room-code:ip:{get_client_ip(request)}",
    ):
        await check_rate_limit(get_redis(), key=key, limit=limit, window_seconds=60)


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


@router.post("/workspaces/join/preview", response_model=JoinPreviewOut)
async def preview_join(
    body: JoinPreviewRequest,
    request: Request,
    session: Session = Depends(get_current_session),
) -> JoinPreviewOut:
    """Which workspace a room code belongs to, before joining it (TDR-0056)."""
    await _room_code_rate_limit(request, session)
    return await workspace_service.preview_join(
        get_db(), room_code=body.room_code, user_id=session.user_id
    )


@router.post("/workspaces/join", response_model=JoinRequestResponse)
async def submit_join_request(
    body: JoinRequestCreate,
    request: Request,
    session: Session = Depends(get_current_session),
) -> JoinRequestResponse:
    await _room_code_rate_limit(request, session)
    return await workspace_service.submit_join_request(
        get_db(), room_code=body.room_code, user_id=session.user_id, message=body.message
    )


@router.get("/join-requests/mine", response_model=list[MyJoinRequestOut])
async def list_my_join_requests(
    session: Session = Depends(get_current_session),
) -> list[MyJoinRequestOut]:
    return await workspace_service.list_my_join_requests(get_db(), user_id=session.user_id)


@router.delete("/join-requests/{request_id}", status_code=204)
async def cancel_my_join_request(
    request_id: str, session: Session = Depends(get_current_session)
) -> None:
    await workspace_service.cancel_my_join_request(
        get_db(), user_id=session.user_id, request_id=request_id
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
        join_requires_approval=body.join_requires_approval,
        members_can_create_projects=body.members_can_create_projects,
        actor_user_id=session.user_id,
        actor_role=session.role,
    )


@router.post("/workspaces/{workspace_id}/room-code", response_model=WorkspaceOut)
async def set_room_code(
    workspace_id: str,
    body: RoomCodeSet,
    session: Session = Depends(require_permission("member:invite")),
) -> WorkspaceOut:
    """Turns on joining by code - with `code`, or a freshly generated one - replacing
    any previous code."""
    require_workspace_match(session, workspace_id)
    return await workspace_service.set_room_code(
        get_db(),
        workspace_id=workspace_id,
        code=body.code,
        actor_user_id=session.user_id,
        actor_role=session.role,
    )


@router.delete("/workspaces/{workspace_id}/room-code", response_model=WorkspaceOut)
async def disable_room_code(
    workspace_id: str,
    session: Session = Depends(require_permission("member:invite")),
) -> WorkspaceOut:
    require_workspace_match(session, workspace_id)
    return await workspace_service.disable_room_code(
        get_db(), workspace_id=workspace_id, actor_user_id=session.user_id, actor_role=session.role
    )


@router.get("/workspaces/{workspace_id}/members", response_model=list[MemberOut])
async def list_members(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> list[MemberOut]:
    require_workspace_match(session, workspace_id)
    return await workspace_service.list_members(get_db(), workspace_id)


@router.get("/workspaces/{workspace_id}/access-matrix", response_model=AccessMatrixOut)
async def access_matrix(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:view_settings")),
) -> AccessMatrixOut:
    """Each member's role on every project the caller can see (TDR-0056)."""
    require_workspace_match(session, workspace_id)
    return await workspace_service.access_matrix(
        get_db(), workspace_id=workspace_id, viewer=session
    )


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


@router.patch("/workspaces/{workspace_id}/members/{member_id}/profile", response_model=MemberOut)
async def update_member_profile(
    workspace_id: str,
    member_id: str,
    body: MemberProfileUpdate,
    session: Session = Depends(require_permission("member:edit_profile")),
) -> MemberOut:
    """Title, team and reporting line for the org chart (TDR-0056)."""
    require_workspace_match(session, workspace_id)
    return await workspace_service.update_member_profile(
        get_db(),
        workspace_id=workspace_id,
        membership_id=member_id,
        actor=session,
        changes=body,
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


@router.post("/workspaces/{workspace_id}/leave", status_code=204)
async def leave_workspace(
    workspace_id: str,
    session: Session = Depends(require_permission("workspace:leave")),
) -> None:
    require_workspace_match(session, workspace_id)
    await workspace_service.leave_workspace(get_db(), workspace_id=workspace_id, actor=session)


@router.post("/workspaces/{workspace_id}/transfer-ownership", status_code=204)
async def transfer_ownership(
    workspace_id: str,
    body: TransferOwnershipRequest,
    session: Session = Depends(require_permission("workspace:transfer_ownership")),
) -> None:
    require_workspace_match(session, workspace_id)
    await workspace_service.transfer_ownership(
        get_db(), workspace_id=workspace_id, actor=session, membership_id=body.member_id
    )


@router.get("/workspaces/{workspace_id}/join-requests", response_model=list[JoinRequestOut])
async def list_join_requests(
    workspace_id: str,
    session: Session = Depends(require_permission("member:invite")),
) -> list[JoinRequestOut]:
    require_workspace_match(session, workspace_id)
    return await workspace_service.list_join_requests(get_db(), workspace_id)


@router.post(
    "/workspaces/{workspace_id}/join-requests/{request_id}/approve", response_model=MemberOut
)
async def approve_join_request(
    workspace_id: str,
    request_id: str,
    body: JoinRequestApprove | None = None,
    session: Session = Depends(require_permission("member:invite")),
) -> MemberOut:
    require_workspace_match(session, workspace_id)
    return await workspace_service.approve_join_request(
        get_db(),
        workspace_id=workspace_id,
        request_id=request_id,
        actor_user_id=session.user_id,
        role=(body or JoinRequestApprove()).role,
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
