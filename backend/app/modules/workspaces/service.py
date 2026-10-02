import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.core.email import send_email
from app.core.errors import (
    ConflictError,
    NotFoundError,
    PermissionDeniedError,
    PlanLimitExceededError,
    ValidationError,
)
from app.core.events import append_event
from app.core.project_access import (
    WORKSPACE_MANAGER_ROLES,
    access_settings,
    effective_project_role,
    project_role_source,
    session_hidden_project_ids,
)
from app.core.session import Session
from app.modules.auth.repository import UserRepository
from app.modules.billing.limits import require_within_plan_limit
from app.modules.billing.plans import effective_plan_id
from app.modules.workspaces import events as workspace_events
from app.modules.workspaces.onboarding import seed_sample_project
from app.modules.workspaces.repository import (
    JoinRequestRepository,
    MembershipRepository,
    WorkspaceRepository,
)
from app.modules.workspaces.schemas import (
    AccessMatrixOut,
    AccessMatrixProjectOut,
    JoinPreviewOut,
    JoinRequestOut,
    JoinRequestResponse,
    MemberOut,
    MemberProfileUpdate,
    MyJoinRequestOut,
    WorkspaceOut,
)

logger = logging.getLogger("backline.workspaces")

_SLUG_RE = re.compile(r"[^a-z0-9]+")

# Room codes leave out 0/O, 1/I/L and U so one read aloud or copied by hand still works.
_ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
_CODE_TAKEN = "Another workspace already uses that code. Try another."
# A person whose request was declined can't ask the same workspace again for this long.
_REJECTION_COOLDOWN = timedelta(hours=24)
# How long a declined request stays on the requester's own Join page.
_MY_REQUESTS_WINDOW = timedelta(days=30)


def _slugify(name: str) -> str:
    return _SLUG_RE.sub("-", name.lower()).strip("-") or "workspace"


def _generate_room_code() -> str:
    groups = ("".join(secrets.choice(_ROOM_CODE_ALPHABET) for _ in range(4)) for _ in range(3))
    return "-".join(groups)


def _workspace_out(doc: dict[str, Any], role: str | None) -> WorkspaceOut:
    room_code = doc.get("room_code") or None
    return WorkspaceOut(
        id=str(doc["_id"]),
        name=doc["name"],
        slug=doc["slug"],
        # A lapsed prepaid plan reads as Free everywhere, not just on the billing page.
        plan=effective_plan_id(doc),
        created_at=doc["created_at"],
        role=role,
        # The code is what lets people in, so only the people who manage joining see it.
        room_code=room_code if role in WORKSPACE_MANAGER_ROLES else None,
        room_code_enabled=room_code is not None,
        join_requires_approval=doc.get("join_requires_approval", True),
        members_can_create_projects=doc.get("members_can_create_projects", True),
    )


def _member_out(membership: dict[str, Any], user_doc: dict[str, Any]) -> MemberOut:
    return MemberOut(
        id=str(membership["_id"]),
        user_id=membership["user_id"],
        email=user_doc["email"],
        name=user_doc["name"],
        avatar_url=user_doc.get("avatar_url"),
        role=membership["role"],
        created_at=membership["created_at"],
        title=membership.get("title"),
        team=membership.get("team"),
        manager_user_id=membership.get("manager_user_id"),
        # Invited by email and never signed in: the invite created a placeholder user
        # whose only provider is "invited" (auth/repository.py's touch_login adds the
        # real one at first sign-in).
        invite_pending=user_doc.get("auth_providers") == ["invited"],
        joined_via=membership.get("joined_via"),
    )


async def _publish_members_changed(workspace_id: str) -> None:
    """Open dashboards refetch the member list and org chart; the realtime layer also
    re-reads the changed member's role for its project filter (realtime/manager.py)."""
    from app.modules.realtime.pubsub import publish

    await publish(
        f"workspace:{workspace_id}:all",
        event_type="workspace.members_changed",
        workspace_id=workspace_id,
        payload={},
    )


async def create_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, user_id: str, name: str
) -> WorkspaceOut:
    workspace_repo = WorkspaceRepository(db)
    membership_repo = MembershipRepository(db)

    base_slug = _slugify(name)
    slug = base_slug
    suffix = 1
    # Check-then-act against the unique `slug` index is inherently racy (two identical-
    # name creates can both pass find_by_slug before either inserts) - retry on the
    # resulting DuplicateKeyError with the next candidate slug instead of surfacing an
    # unhandled 500.
    workspace_doc: dict[str, Any] | None = None
    for _ in range(10):
        if await workspace_repo.find_by_slug(slug) is not None:
            suffix += 1
            slug = f"{base_slug}-{suffix}"
            continue
        try:
            workspace_doc = await workspace_repo.create(name=name, slug=slug)
            break
        except DuplicateKeyError:
            suffix += 1
            slug = f"{base_slug}-{suffix}"
    if workspace_doc is None:
        raise ConflictError("Could not create a unique workspace slug. Try a different name.")
    workspace_id = str(workspace_doc["_id"])

    try:
        await membership_repo.create(
            workspace_id=workspace_id,
            user_id=user_id,
            role="owner",
            invited_by=None,
            joined_via="created",
        )
    except Exception:
        # The workspace insert already succeeded; without this, a failure here (e.g. a
        # transient Mongo error) orphans a workspace with no owner and no repair path -
        # list_my_workspaces can never surface it for this user again.
        await workspace_repo.db.workspaces.delete_one({"_id": workspace_doc["_id"]})
        raise
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.WORKSPACE_CREATED,
        actor_type="member",
        actor_id=user_id,
        payload={"name": name},
    )
    await seed_sample_project(db, workspace_id=workspace_id, owner_user_id=user_id)

    return _workspace_out(workspace_doc, role="owner")


async def list_my_workspaces(
    db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str
) -> list[WorkspaceOut]:
    memberships = await MembershipRepository(db).list_for_user(user_id)
    workspaces = await WorkspaceRepository(db).find_many_by_ids(
        [membership["workspace_id"] for membership in memberships]
    )
    return [
        _workspace_out(workspaces[membership["workspace_id"]], role=membership["role"])
        for membership in memberships
        if membership["workspace_id"] in workspaces
    ]


async def get_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, requesting_user_id: str
) -> WorkspaceOut:
    membership_repo = MembershipRepository(db)
    workspace_repo = WorkspaceRepository(db)

    membership = await membership_repo.find(workspace_id=workspace_id, user_id=requesting_user_id)
    if membership is None:
        raise PermissionDeniedError("Not a member of this workspace.")

    workspace_doc = await workspace_repo.find_by_id(workspace_id)
    if workspace_doc is None:
        raise NotFoundError("Workspace not found.")

    return _workspace_out(workspace_doc, role=membership["role"])


async def update_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    name: str | None = None,
    join_requires_approval: bool | None = None,
    members_can_create_projects: bool | None = None,
    actor_user_id: str | None = None,
    actor_role: str | None = None,
) -> WorkspaceOut:
    workspace_repo = WorkspaceRepository(db)
    workspace_doc = await workspace_repo.find_by_id(workspace_id)
    if workspace_doc is None:
        raise NotFoundError("Workspace not found.")

    await workspace_repo.update(
        workspace_id,
        name=name,
        join_requires_approval=join_requires_approval,
        members_can_create_projects=members_can_create_projects,
    )
    changes = {
        key: value
        for key, value in (
            ("name", name),
            ("join_requires_approval", join_requires_approval),
            ("members_can_create_projects", members_can_create_projects),
        )
        if value is not None
    }
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.WORKSPACE_UPDATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload=changes,
    )

    updated = await workspace_repo.find_by_id(workspace_id)
    assert updated is not None
    return _workspace_out(updated, role=actor_role)


async def set_room_code(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    code: str | None,
    actor_user_id: str,
    actor_role: str | None,
) -> WorkspaceOut:
    """Turns joining by code on with `code` (already normalized), or with a fresh
    random code when `code` is None. Replacing a code stops the old one working at once."""
    repo = WorkspaceRepository(db)
    if await repo.find_by_id(workspace_id) is None:
        raise NotFoundError("Workspace not found.")
    attempts = 1 if code else 5
    for _ in range(attempts):
        candidate = code or _generate_room_code()
        existing = await repo.find_by_room_code(candidate)
        if existing is not None and str(existing["_id"]) != workspace_id:
            if code:
                raise ConflictError(_CODE_TAKEN)
            continue
        try:
            await repo.set_room_code(workspace_id, candidate)
            break
        except DuplicateKeyError as exc:
            if code:
                raise ConflictError(_CODE_TAKEN) from exc
    else:
        raise ConflictError("Could not generate a unique room code. Try again.")
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.ROOM_CODE_CHANGED,
        actor_type="member",
        actor_id=actor_user_id,
        # Never the code itself: the activity feed is readable by every member.
        payload={"enabled": True, "custom": bool(code)},
    )
    updated = await repo.find_by_id(workspace_id)
    assert updated is not None
    return _workspace_out(updated, role=actor_role)


async def disable_room_code(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    actor_user_id: str,
    actor_role: str | None,
) -> WorkspaceOut:
    """The code stops working. Requests already waiting stay for admins to decide."""
    repo = WorkspaceRepository(db)
    if await repo.find_by_id(workspace_id) is None:
        raise NotFoundError("Workspace not found.")
    await repo.set_room_code(workspace_id, None)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.ROOM_CODE_CHANGED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"enabled": False},
    )
    updated = await repo.find_by_id(workspace_id)
    assert updated is not None
    return _workspace_out(updated, role=actor_role)


async def list_members(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> list[MemberOut]:
    memberships = await MembershipRepository(db).list_for_workspace(workspace_id)
    users = await UserRepository(db).find_many_by_ids([m["user_id"] for m in memberships])
    return [
        _member_out(membership, users[membership["user_id"]])
        for membership in memberships
        if membership["user_id"] in users
    ]


async def invite_member(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    inviter_user_id: str,
    email: str,
    role: str,
) -> MemberOut:
    user_repo = UserRepository(db)
    membership_repo = MembershipRepository(db)

    existing_user = await user_repo.find_by_email(email)
    if existing_user is not None and await membership_repo.find(
        workspace_id=workspace_id, user_id=str(existing_user["_id"])
    ):
        raise ConflictError("User is already a member of this workspace.")

    # Before get_or_create, so an invite the plan refuses doesn't leave a user record
    # behind for an address that was never actually invited.
    await require_within_plan_limit(db, workspace_id, "members")

    user_doc = existing_user or await user_repo.get_or_create(
        email=email, name=email.split("@")[0], avatar_url=None, auth_provider="invited"
    )
    user_id = str(user_doc["_id"])

    try:
        membership = await membership_repo.create(
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
            invited_by=inviter_user_id,
            joined_via="invite",
        )
    except DuplicateKeyError as exc:
        # Same check-then-act race as create_workspace's slug above - a concurrent
        # invite for the same (workspace_id, user_id) can pass the find() check before
        # either insert lands.
        raise ConflictError("User is already a member of this workspace.") from exc
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.MEMBER_INVITED,
        actor_type="member",
        actor_id=inviter_user_id,
        payload={"invited_email": email, "role": role, "user_id": user_id},
    )
    await _publish_members_changed(workspace_id)

    try:
        await send_email(
            to=email,
            subject="You've been invited to a Backline workspace",
            html="<p>You've been invited to collaborate on Backline. Sign in with this email "
            "address to get access.</p>",
        )
    except Exception as exc:
        logger.exception("Failed to send invitation email to %s: %s", email, exc)

    return _member_out(membership, user_doc)


async def update_member_role(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    membership_id: str,
    role: str,
    actor_user_id: str,
) -> None:
    membership_repo = MembershipRepository(db)
    membership = await membership_repo.find_by_id(
        workspace_id=workspace_id, membership_id=membership_id
    )
    if membership is None:
        raise NotFoundError("Member not found.")
    if membership["role"] == "owner":
        raise ValidationError("Cannot change the owner's role.")

    await membership_repo.update_role(
        workspace_id=workspace_id, membership_id=membership_id, role=role
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.MEMBER_ROLE_CHANGED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={
            "membership_id": membership_id,
            "user_id": membership["user_id"],
            "new_role": role,
            "previous_role": membership["role"],
        },
    )
    await _publish_members_changed(workspace_id)


async def _clean_up_departed_member(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, membership: dict[str, Any]
) -> None:
    """After someone leaves or is removed: their reports move up to their manager,
    and their project entries go (TDR-0056) so rejoining starts from the defaults."""
    from app.modules.projects.repository import ProjectRepository

    user_id = membership["user_id"]
    await MembershipRepository(db).reassign_reports(
        workspace_id=workspace_id,
        from_user_id=user_id,
        to_user_id=membership.get("manager_user_id"),
    )
    await ProjectRepository(db).remove_member_from_all_projects(workspace_id, user_id)
    await _publish_members_changed(workspace_id)


async def remove_member(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    membership_id: str,
    actor_user_id: str,
) -> None:
    membership_repo = MembershipRepository(db)
    membership = await membership_repo.find_by_id(
        workspace_id=workspace_id, membership_id=membership_id
    )
    if membership is None:
        raise NotFoundError("Member not found.")
    if membership["role"] == "owner":
        raise ValidationError("Cannot remove the workspace owner.")

    await membership_repo.delete(workspace_id=workspace_id, membership_id=membership_id)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.MEMBER_REMOVED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"membership_id": membership_id, "user_id": membership["user_id"]},
    )
    await _clean_up_departed_member(db, workspace_id=workspace_id, membership=membership)


async def leave_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, actor: Session
) -> None:
    membership_repo = MembershipRepository(db)
    membership = await membership_repo.find(workspace_id=workspace_id, user_id=actor.user_id)
    if membership is None:
        raise NotFoundError("You aren't a member of this workspace.")
    if membership["role"] == "owner":
        raise ValidationError("Make someone else the owner before you leave.")
    await membership_repo.delete(workspace_id=workspace_id, membership_id=str(membership["_id"]))
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.MEMBER_LEFT,
        actor_type="member",
        actor_id=actor.user_id,
        payload={"user_id": actor.user_id},
    )
    await _clean_up_departed_member(db, workspace_id=workspace_id, membership=membership)


async def transfer_ownership(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    actor: Session,
    membership_id: str,
) -> None:
    """The owner hands the workspace to another member and becomes an admin. Billing
    follows the owner role (workspace:manage_billing)."""
    membership_repo = MembershipRepository(db)
    current = await membership_repo.find(workspace_id=workspace_id, user_id=actor.user_id)
    if current is None or current["role"] != "owner":
        raise PermissionDeniedError("Only the owner can transfer ownership.")
    target = await membership_repo.find_by_id(
        workspace_id=workspace_id, membership_id=membership_id
    )
    if target is None:
        raise NotFoundError("Member not found.")
    if target["user_id"] == actor.user_id:
        raise ValidationError("You're already the owner.")
    if (await UserRepository(db).find_by_id(target["user_id"]) or {}).get("auth_providers") == [
        "invited"
    ]:
        raise ValidationError("They need to sign in once before they can own the workspace.")
    await membership_repo.update_role(
        workspace_id=workspace_id, membership_id=membership_id, role="owner"
    )
    await membership_repo.update_role(
        workspace_id=workspace_id, membership_id=str(current["_id"]), role="admin"
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.OWNERSHIP_TRANSFERRED,
        actor_type="member",
        actor_id=actor.user_id,
        payload={"from_user_id": actor.user_id, "to_user_id": target["user_id"]},
    )
    from app.modules.notifications.service import notify_ownership_transferred

    await notify_ownership_transferred(
        db,
        workspace_id=workspace_id,
        recipient_user_id=target["user_id"],
        actor_user_id=actor.user_id,
    )
    await _publish_members_changed(workspace_id)


def _creates_reporting_loop(
    managers: dict[str, str | None], *, user_id: str, manager_user_id: str
) -> bool:
    """True when `user_id` already sits somewhere above `manager_user_id`. Also True
    for a loop that's already stored, so a corrupt chain can't be extended."""
    seen: set[str] = set()
    current: str | None = manager_user_id
    while current is not None:
        if current == user_id or current in seen:
            return True
        seen.add(current)
        current = managers.get(current)
    return False


async def update_member_profile(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    membership_id: str,
    actor: Session,
    changes: MemberProfileUpdate,
) -> MemberOut:
    """Title and team are a member's own to edit; owners and admins can edit anyone's
    and are the only ones who set reporting lines (TDR-0056)."""
    membership_repo = MembershipRepository(db)
    membership = await membership_repo.find_by_id(
        workspace_id=workspace_id, membership_id=membership_id
    )
    if membership is None:
        raise NotFoundError("Member not found.")
    is_admin = actor.role in WORKSPACE_MANAGER_ROLES
    if not is_admin and membership["user_id"] != actor.user_id:
        raise PermissionDeniedError("Only owners and admins can edit someone else's profile.")

    fields = changes.model_fields_set
    patch: dict[str, Any] = {}
    for key in ("title", "team"):
        if key in fields:
            value = getattr(changes, key)
            patch[key] = value or None
    if "manager_user_id" in fields:
        if not is_admin:
            raise PermissionDeniedError("Only owners and admins can change reporting lines.")
        manager_user_id = changes.manager_user_id or None
        if manager_user_id is not None:
            if manager_user_id == membership["user_id"]:
                raise ValidationError("Someone can't report to themselves.")
            everyone = await membership_repo.list_for_workspace(workspace_id)
            managers = {m["user_id"]: m.get("manager_user_id") for m in everyone}
            if manager_user_id not in managers:
                raise ValidationError("Their manager must be a member of this workspace.")
            if _creates_reporting_loop(
                managers, user_id=membership["user_id"], manager_user_id=manager_user_id
            ):
                raise ValidationError(
                    "That would make a reporting loop - they're already above that person."
                )
        patch["manager_user_id"] = manager_user_id
    if patch:
        await membership_repo.update_profile(
            workspace_id=workspace_id, membership_id=membership_id, patch=patch
        )
        await append_event(
            db,
            workspace_id=workspace_id,
            type=workspace_events.MEMBER_PROFILE_UPDATED,
            actor_type="member",
            actor_id=actor.user_id,
            payload={"membership_id": membership_id, "user_id": membership["user_id"], **patch},
        )
        await _publish_members_changed(workspace_id)
    updated = await membership_repo.find_by_id(
        workspace_id=workspace_id, membership_id=membership_id
    )
    user_doc = await UserRepository(db).find_by_id(membership["user_id"])
    if updated is None or user_doc is None:
        raise NotFoundError("Member not found.")
    return _member_out(updated, user_doc)


async def access_matrix(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, viewer: Session
) -> AccessMatrixOut:
    """Every member's role on every project the viewer can see (TDR-0056)."""
    from app.modules.projects.repository import ProjectRepository

    hidden = set(await session_hidden_project_ids(db, viewer))
    memberships = await MembershipRepository(db).list_for_workspace(workspace_id)
    projects: list[AccessMatrixProjectOut] = []
    for doc in await ProjectRepository(db).list_access_for_workspace(workspace_id):
        project_id = str(doc["_id"])
        if project_id in hidden or doc.get("hard_delete_status") == "deleting":
            continue
        visibility, default_role, _ = access_settings(doc)
        roles: dict[str, Any] = {}
        sources: dict[str, Any] = {}
        for membership in memberships:
            role = effective_project_role(
                doc, user_id=membership["user_id"], workspace_role=membership["role"]
            )
            if role is not None:
                roles[membership["user_id"]] = role.value
            sources[membership["user_id"]] = project_role_source(
                doc, user_id=membership["user_id"], workspace_role=membership["role"]
            )
        projects.append(
            AccessMatrixProjectOut(
                id=project_id,
                name=doc["name"],
                project_type=doc.get("project_type", "website"),
                visibility=visibility,  # type: ignore[arg-type]
                default_role=default_role.value,
                archived=doc.get("archived_at") is not None,
                roles=roles,
                sources=sources,
            )
        )
    return AccessMatrixOut(projects=projects)


# ── Joining with a room code (TDR-0056) ──────────────────────────────────────────


def _join_request_out(doc: dict[str, Any], user_doc: dict[str, Any]) -> JoinRequestOut:
    return JoinRequestOut(
        id=str(doc["_id"]),
        workspace_id=doc["workspace_id"],
        user_id=doc["user_id"],
        user_email=user_doc["email"],
        user_name=user_doc.get("name") or user_doc["email"],
        user_avatar_url=user_doc.get("avatar_url"),
        message=doc.get("message"),
        status=doc["status"],
        created_at=doc["created_at"],
    )


async def _workspace_for_code(
    db: AsyncIOMotorDatabase[dict[str, Any]], room_code: str
) -> dict[str, Any]:
    workspace = await WorkspaceRepository(db).find_by_room_code(room_code) if room_code else None
    if workspace is None:
        raise NotFoundError("That code doesn't match any workspace. Check it and try again.")
    return workspace


async def preview_join(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, room_code: str, user_id: str
) -> JoinPreviewOut:
    """What a code leads to, before anyone commits - the Join page shows the
    workspace's name so a mistyped code can't drop someone into the wrong team."""
    workspace = await _workspace_for_code(db, room_code)
    workspace_id = str(workspace["_id"])
    membership_repo = MembershipRepository(db)
    status = "can_join"
    if await membership_repo.find(workspace_id=workspace_id, user_id=user_id):
        status = "already_member"
    elif await JoinRequestRepository(db).find_pending(workspace_id, user_id):
        status = "pending"
    return JoinPreviewOut(
        workspace_id=workspace_id,
        workspace_name=workspace["name"],
        member_count=await membership_repo.count(workspace_id),
        requires_approval=workspace.get("join_requires_approval", True),
        status=status,  # type: ignore[arg-type]
        workspace_slug=workspace["slug"] if status == "already_member" else None,
    )


async def submit_join_request(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    room_code: str,
    user_id: str,
    message: str | None = None,
) -> JoinRequestResponse:
    workspace = await _workspace_for_code(db, room_code)
    workspace_id = str(workspace["_id"])
    name = workspace["name"]
    membership_repo = MembershipRepository(db)
    if await membership_repo.find(workspace_id=workspace_id, user_id=user_id):
        return JoinRequestResponse(
            status="already_member",
            workspace_id=workspace_id,
            workspace_name=name,
            workspace_slug=workspace["slug"],
        )
    user = await UserRepository(db).find_by_id(user_id)
    if user is None:
        raise NotFoundError("Account not found.")
    user_name = user.get("name") or user["email"]

    if not workspace.get("join_requires_approval", True):
        try:
            await require_within_plan_limit(db, workspace_id, "members")
        except PlanLimitExceededError as exc:
            raise ConflictError(
                "This workspace has no free seats right now. Ask one of its admins to make room."
            ) from exc
        try:
            await membership_repo.create(
                workspace_id=workspace_id,
                user_id=user_id,
                role="member",
                invited_by=None,
                joined_via="room_code",
            )
        except DuplicateKeyError:
            pass  # A second tab got there first; they're a member either way.
        else:
            await append_event(
                db,
                workspace_id=workspace_id,
                type=workspace_events.MEMBER_JOINED_VIA_CODE,
                actor_type="member",
                actor_id=user_id,
                payload={"user_id": user_id, "name": user_name},
            )
            from app.modules.notifications.service import notify_member_joined

            await notify_member_joined(
                db, workspace_id=workspace_id, member_user_id=user_id, member_name=user_name
            )
            await _publish_members_changed(workspace_id)
        return JoinRequestResponse(
            status="joined",
            workspace_id=workspace_id,
            workspace_name=name,
            workspace_slug=workspace["slug"],
        )

    join_repo = JoinRequestRepository(db)
    if await join_repo.find_pending(workspace_id, user_id):
        return JoinRequestResponse(status="pending", workspace_id=workspace_id, workspace_name=name)
    if await join_repo.find_recent_rejection(
        workspace_id, user_id, datetime.now(UTC) - _REJECTION_COOLDOWN
    ):
        raise ConflictError(
            "An admin declined your last request to join this workspace. You can ask again "
            "tomorrow, or ask them for an email invite."
        )
    try:
        request = await join_repo.create(
            workspace_id=workspace_id, user_id=user_id, message=message
        )
    except DuplicateKeyError:
        return JoinRequestResponse(status="pending", workspace_id=workspace_id, workspace_name=name)
    request_id = str(request["_id"])
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.MEMBER_JOIN_REQUESTED,
        actor_type="member",
        actor_id=user_id,
        payload={"request_id": request_id, "user_id": user_id, "name": user_name},
    )
    from app.modules.notifications.service import notify_join_requested

    await notify_join_requested(
        db,
        workspace_id=workspace_id,
        request_id=request_id,
        requester_user_id=user_id,
        requester_name=user_name,
    )
    await _publish_members_changed(workspace_id)
    return JoinRequestResponse(status="pending", workspace_id=workspace_id, workspace_name=name)


async def list_my_join_requests(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, user_id: str
) -> list[MyJoinRequestOut]:
    docs = await JoinRequestRepository(db).list_for_user(
        user_id, since=datetime.now(UTC) - _MY_REQUESTS_WINDOW
    )
    workspaces = await WorkspaceRepository(db).find_many_by_ids(
        [doc["workspace_id"] for doc in docs]
    )
    return [
        MyJoinRequestOut(
            id=str(doc["_id"]),
            workspace_id=doc["workspace_id"],
            workspace_name=workspaces[doc["workspace_id"]]["name"],
            status=doc["status"],
            created_at=doc["created_at"],
            decided_at=doc.get("decided_at"),
        )
        for doc in docs
        if doc["workspace_id"] in workspaces
    ]


async def cancel_my_join_request(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, user_id: str, request_id: str
) -> None:
    if not await JoinRequestRepository(db).cancel_own(user_id, request_id):
        raise NotFoundError("That request isn't waiting any more.")


async def list_join_requests(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> list[JoinRequestOut]:
    requests = await JoinRequestRepository(db).list_for_workspace(workspace_id)
    if not requests:
        return []
    users_by_id = await UserRepository(db).find_many_by_ids([req["user_id"] for req in requests])
    return [
        _join_request_out(req, users_by_id[req["user_id"]])
        for req in requests
        if req["user_id"] in users_by_id
    ]


async def _email_join_approved(user_doc: dict[str, Any], workspace: dict[str, Any] | None) -> None:
    if workspace is None:
        return
    url = f"{get_settings().public_dashboard_base_url.rstrip('/')}/w/{workspace['slug']}"
    try:
        await send_email(
            to=user_doc["email"],
            subject=f"You're in: {workspace['name']} on Backline",
            html=(
                f"<p>Your request to join <strong>{escape(workspace['name'])}</strong> "
                f'was approved. <a href="{escape(url)}">Open the workspace</a>.</p>'
            ),
        )
    except Exception:
        logger.exception("Failed to send join-approved email to %s", user_doc.get("email"))


async def approve_join_request(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    request_id: str,
    actor_user_id: str,
    role: str = "member",
) -> MemberOut:
    join_repo = JoinRequestRepository(db)
    req = await join_repo.find_by_id(workspace_id, request_id)
    if not req or req["status"] != "pending":
        raise NotFoundError("This request was already handled.")
    user_doc = await UserRepository(db).find_by_id(req["user_id"])
    if user_doc is None:
        raise NotFoundError("The person who asked no longer has an account.")

    membership_repo = MembershipRepository(db)
    membership = await membership_repo.find(workspace_id=workspace_id, user_id=req["user_id"])
    if membership is None:
        await require_within_plan_limit(db, workspace_id, "members")
    if not await join_repo.claim(
        workspace_id, request_id, status="approved", decided_by=actor_user_id
    ):
        raise NotFoundError("This request was already handled.")
    if membership is None:
        try:
            membership = await membership_repo.create(
                workspace_id=workspace_id,
                user_id=req["user_id"],
                role=role,
                invited_by=actor_user_id,
                joined_via="join_request",
            )
        except DuplicateKeyError:
            membership = await membership_repo.find(
                workspace_id=workspace_id, user_id=req["user_id"]
            )
        except Exception:
            await join_repo.reopen(workspace_id, request_id)
            raise
    if membership is None:
        raise ConflictError("Could not add them. Try again.")

    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.MEMBER_JOIN_APPROVED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={
            "user_id": req["user_id"],
            "request_id": request_id,
            "role": membership["role"],
            "name": user_doc.get("name"),
        },
    )
    await _publish_members_changed(workspace_id)
    await _email_join_approved(user_doc, await WorkspaceRepository(db).find_by_id(workspace_id))
    return _member_out(membership, user_doc)


async def reject_join_request(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    request_id: str,
    actor_user_id: str,
) -> None:
    join_repo = JoinRequestRepository(db)
    req = await join_repo.find_by_id(workspace_id, request_id)
    if not req or not await join_repo.claim(
        workspace_id, request_id, status="rejected", decided_by=actor_user_id
    ):
        raise NotFoundError("This request was already handled.")
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.MEMBER_JOIN_REJECTED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"user_id": req["user_id"], "request_id": request_id},
    )
    await _publish_members_changed(workspace_id)
