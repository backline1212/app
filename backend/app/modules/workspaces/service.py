import logging
import re
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.email import send_email
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
from app.core.events import append_event
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
    JoinRequestOut,
    JoinRequestResponse,
    MemberOut,
    WorkspaceOut,
)

logger = logging.getLogger("backline.workspaces")

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    return _SLUG_RE.sub("-", name.lower()).strip("-") or "workspace"


def _workspace_out(doc: dict[str, Any], role: str | None) -> WorkspaceOut:
    return WorkspaceOut(
        id=str(doc["_id"]),
        name=doc["name"],
        slug=doc["slug"],
        # A lapsed prepaid plan reads as Free everywhere, not just on the billing page.
        plan=effective_plan_id(doc),
        created_at=doc["created_at"],
        role=role,
        room_code=doc.get("room_code"),
        join_requires_approval=doc.get("join_requires_approval", True),
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
            workspace_id=workspace_id, user_id=user_id, role="owner", invited_by=None
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
    membership_repo = MembershipRepository(db)
    workspace_repo = WorkspaceRepository(db)

    memberships = await membership_repo.list_for_user(user_id)
    results = []
    for membership in memberships:
        workspace_doc = await workspace_repo.find_by_id(membership["workspace_id"])
        if workspace_doc is not None:
            results.append(_workspace_out(workspace_doc, role=membership["role"]))
    return results


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
    room_code: str | None = None,
    join_requires_approval: bool | None = None,
    actor_user_id: str | None = None,
    actor_role: str | None = None,
    _clear_room_code: bool = False,
) -> WorkspaceOut:
    workspace_repo = WorkspaceRepository(db)
    workspace_doc = await workspace_repo.find_by_id(workspace_id)
    if workspace_doc is None:
        raise NotFoundError("Workspace not found.")

    if room_code:
        existing = await workspace_repo.find_by_room_code(room_code)
        if existing and str(existing["_id"]) != workspace_id:
            raise ConflictError("Room code is already in use by another workspace.")

    await workspace_repo.update(
        workspace_id,
        name=name,
        room_code=room_code,
        join_requires_approval=join_requires_approval,
        clear_room_code=_clear_room_code,
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.WORKSPACE_UPDATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={
            "name": name,
            "room_code": room_code,
            "join_requires_approval": join_requires_approval,
        },
    )

    updated = await workspace_repo.find_by_id(workspace_id)
    assert updated is not None
    return _workspace_out(updated, role=actor_role)


async def list_members(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> list[MemberOut]:
    membership_repo = MembershipRepository(db)
    user_repo = UserRepository(db)

    memberships = await membership_repo.list_for_workspace(workspace_id)
    results = []
    for membership in memberships:
        user_doc = await user_repo.find_by_id(membership["user_id"])
        if user_doc is not None:
            results.append(_member_out(membership, user_doc))
    return results


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
            workspace_id=workspace_id, user_id=user_id, role=role, invited_by=inviter_user_id
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
        payload={"invited_email": email, "role": role},
    )

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
        payload={"membership_id": membership_id, "new_role": role},
    )


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
        payload={"membership_id": membership_id},
    )


def _join_request_out(doc: dict[str, Any], user_doc: dict[str, Any]) -> JoinRequestOut:
    return JoinRequestOut(
        id=str(doc["_id"]),
        workspace_id=doc["workspace_id"],
        user_id=doc["user_id"],
        user_email=user_doc["email"],
        user_name=user_doc["name"],
        status=doc["status"],
        created_at=doc["created_at"],
    )


async def list_join_requests(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str
) -> list[JoinRequestOut]:
    join_repo = JoinRequestRepository(db)
    user_repo = UserRepository(db)
    requests = await join_repo.list_for_workspace(workspace_id)
    if not requests:
        return []
    users_by_id = await user_repo.find_many_by_ids([req["user_id"] for req in requests])
    results = []
    for req in requests:
        user_doc = users_by_id.get(req["user_id"])
        if user_doc:
            results.append(_join_request_out(req, user_doc))
    return results


async def submit_join_request(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, room_code: str, user_id: str
) -> JoinRequestResponse:
    workspace_repo = WorkspaceRepository(db)
    workspace = await workspace_repo.find_by_room_code(room_code)
    if not workspace:
        raise NotFoundError("Invalid room code.")

    workspace_id = str(workspace["_id"])
    membership_repo = MembershipRepository(db)
    if await membership_repo.find(workspace_id=workspace_id, user_id=user_id):
        raise ConflictError("You are already a member of this workspace.")

    if not workspace.get("join_requires_approval", True):
        # Instant join
        await membership_repo.create(
            workspace_id=workspace_id, user_id=user_id, role="member", invited_by=None
        )
        await append_event(
            db,
            workspace_id=workspace_id,
            type="workspace.member_joined_via_code",
            actor_type="member",
            actor_id=user_id,
            payload={"room_code": room_code},
        )
        return JoinRequestResponse(status="joined", workspace_id=workspace_id)

    # Needs approval
    join_repo = JoinRequestRepository(db)
    existing = await join_repo.find_pending(workspace_id, user_id)
    if existing:
        return JoinRequestResponse(status="pending", workspace_id=workspace_id)

    await join_repo.create(workspace_id=workspace_id, user_id=user_id)
    return JoinRequestResponse(status="pending", workspace_id=workspace_id)


async def approve_join_request(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    request_id: str,
    actor_user_id: str,
) -> MemberOut:
    join_repo = JoinRequestRepository(db)
    req = await join_repo.find_by_id(workspace_id, request_id)
    if not req or req["status"] != "pending":
        raise NotFoundError("Request not found or already processed.")

    user_id = req["user_id"]
    await require_within_plan_limit(db, workspace_id, "members")

    await join_repo.update_status(workspace_id, request_id, "approved")
    membership_repo = MembershipRepository(db)
    membership = await membership_repo.find(workspace_id=workspace_id, user_id=user_id)
    if membership is None:
        membership = await membership_repo.create(
            workspace_id=workspace_id, user_id=user_id, role="member", invited_by=actor_user_id
        )

    user_doc = await UserRepository(db).find_by_id(user_id)
    assert user_doc is not None
    assert membership is not None

    await append_event(
        db,
        workspace_id=workspace_id,
        type="workspace.join_request_approved",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"user_id": user_id, "request_id": request_id},
    )
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
    if not req or req["status"] != "pending":
        raise NotFoundError("Request not found or already processed.")

    await join_repo.update_status(workspace_id, request_id, "rejected")
    await append_event(
        db,
        workspace_id=workspace_id,
        type="workspace.join_request_rejected",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"user_id": req["user_id"], "request_id": request_id},
    )
