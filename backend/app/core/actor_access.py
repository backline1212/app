from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import PermissionDeniedError
from app.core.project_access import load_project_for
from app.core.session import Actor, GuestSession, Session
from app.modules.projects import service as project_service
from app.modules.share_links.repository import (
    GuestSessionRepository,
    ShareLinkRepository,
    is_canvas_link,
)
from app.modules.workspaces.repository import MembershipRepository


async def _check_canvas_member(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    guest: GuestSession,
    link: dict[str, Any],
    project_id: str,
    action: str,
) -> None:
    """A dashboard canvas session acts for one member (TDR-0057): it may do exactly
    what that member's project role allows today, re-read on every call, so a role
    change or removal applies at once. A canvas link with no member behind it - a
    session minted any other way - is refused outright."""
    if guest.member_user_id is None:
        raise PermissionDeniedError("This link only opens inside the Backline dashboard.")
    membership = await MembershipRepository(db).find(
        workspace_id=link["workspace_id"], user_id=guest.member_user_id
    )
    if membership is None:
        raise PermissionDeniedError("You're no longer a member of this workspace.")
    member = Session(
        user_id=guest.member_user_id,
        workspace_id=link["workspace_id"],
        role=membership["role"],
    )
    await load_project_for(db, member, project_id, action)


async def resolve_actor_project_access(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    actor: Actor,
    project_id: str,
    action: str = "project:view",
) -> str:
    """Shared by storage/pages/snapshot_engine, all of which accept "member or guest"
    (12-API-WebSocket.md §12.3). Returns the workspace_id the actor is authorized to act
    within for this project; raises otherwise. Members are checked against their
    workspace-scoped token (raises NotFoundError via project_service if the project
    belongs to another workspace) and against their project role for `action`
    (TDR-0056); guests are checked against their share link's project -
    the guest-side equivalent of the cross-tenant guarantee (03-System-Architecture.md §3.5).
    A guest session from the dashboard canvas also answers to its member's project role
    for `action` (TDR-0057); a client's own guest session isn't role-checked."""
    if isinstance(actor, Session):
        workspace_id = actor.workspace_id
        if workspace_id is None:
            raise PermissionDeniedError("No active workspace context.")
        await load_project_for(db, actor, project_id, action)
        project = await project_service.get_project(
            db, project_id=project_id, workspace_id=workspace_id
        )
        if project.archived_at:
            raise PermissionDeniedError("This project is archived. Restore it before reviewing.")
        return workspace_id

    guest: GuestSession = actor
    link = await ShareLinkRepository(db).find_by_id(guest.share_link_id)
    if link is None or link["revoked_at"] is not None:
        raise PermissionDeniedError("Guest session's share link is no longer active.")
    if link["project_id"] != project_id:
        raise PermissionDeniedError("Guest session is not scoped to this project.")
    if link.get("expires_at") and link["expires_at"] <= datetime.now(UTC):
        raise PermissionDeniedError("This review link has expired.")
    if guest.member_user_id is not None or is_canvas_link(link):
        await _check_canvas_member(db, guest, link, project_id, action)
    project = await project_service.get_project(
        db, project_id=project_id, workspace_id=link["workspace_id"]
    )
    if project.archived_at:
        raise PermissionDeniedError("This project is archived.")

    guest_workspace_id: str = link["workspace_id"]
    await GuestSessionRepository(db).touch_last_seen(
        workspace_id=guest_workspace_id,
        guest_session_id=guest.guest_session_id,
    )
    return guest_workspace_id
