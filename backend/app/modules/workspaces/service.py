import logging
import re
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.email import send_email
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
from app.core.events import append_event
from app.modules.auth.repository import UserRepository
from app.modules.workspaces import events as workspace_events
from app.modules.workspaces.onboarding import seed_sample_project
from app.modules.workspaces.repository import MembershipRepository, WorkspaceRepository
from app.modules.workspaces.schemas import MemberOut, WorkspaceOut

logger = logging.getLogger("backline.workspaces")

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    return _SLUG_RE.sub("-", name.lower()).strip("-") or "workspace"


def _workspace_out(doc: dict[str, Any], role: str | None) -> WorkspaceOut:
    return WorkspaceOut(
        id=str(doc["_id"]),
        name=doc["name"],
        slug=doc["slug"],
        plan=doc["plan"],
        created_at=doc["created_at"],
        role=role,
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
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, name: str | None
) -> WorkspaceOut:
    workspace_repo = WorkspaceRepository(db)
    workspace_doc = await workspace_repo.find_by_id(workspace_id)
    if workspace_doc is None:
        raise NotFoundError("Workspace not found.")

    await workspace_repo.update(workspace_id, name=name)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=workspace_events.WORKSPACE_UPDATED,
        actor_type="member",
        actor_id=None,
        payload={"name": name},
    )

    updated = await workspace_repo.find_by_id(workspace_id)
    assert updated is not None
    return _workspace_out(updated, role=None)


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

    user_doc = await user_repo.find_by_email(email)
    if user_doc is None:
        user_doc = await user_repo.create(
            email=email, name=email.split("@")[0], avatar_url=None, auth_provider="invited"
        )

    user_id = str(user_doc["_id"])
    if await membership_repo.find(workspace_id=workspace_id, user_id=user_id) is not None:
        raise ConflictError("User is already a member of this workspace.")

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
