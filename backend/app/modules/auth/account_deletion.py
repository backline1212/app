"""Delete my account (TDR-0214).

Self-service, confirmed with a code sent to the account's email. What happens to each
workspace depends on the person's place in it:
- owner of a workspace with other people → blocked until ownership is transferred
  (Team → person → Make owner), so a team never loses its workspace;
- the only member (pending invites don't count) → the workspace is closed: its projects
  are archived, review links revoked, room code turned off, and pending invites
  removed. Nobody can open it; scripts/purge_closed_workspaces.py deletes its content
  after a 30-day grace period (dry run first);
- anywhere else → they leave, as with "Leave workspace".

The account is then anonymised ("Deleted user", an unusable address, no password or
photo), so comments keep their place in threads without naming the person, and every
session and token is revoked. The email address can sign up again.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.email import send_email
from app.core.errors import AuthenticationError, ConflictError
from app.core.events import append_event
from app.core.security import generate_otp_code, hash_secret
from app.core.session import Session

PURGE_GRACE = timedelta(days=30)
DELETED_NAME = "Deleted user"


def deletion_purpose(user_id: str) -> str:
    return f"account_delete:{user_id}"


@dataclass
class DeletionPlan:
    blocking: list[dict[str, str]] = field(default_factory=list)
    closing: list[dict[str, Any]] = field(default_factory=list)
    leaving: list[dict[str, str]] = field(default_factory=list)


async def build_plan(db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str) -> DeletionPlan:
    from app.modules.auth.repository import UserRepository
    from app.modules.projects.repository import ProjectRepository
    from app.modules.workspaces.repository import MembershipRepository, WorkspaceRepository

    memberships = MembershipRepository(db)
    plan = DeletionPlan()
    mine = await memberships.list_for_user(user_id)
    workspaces = await WorkspaceRepository(db).find_many_by_ids([m["workspace_id"] for m in mine])
    for membership in mine:
        workspace = workspaces.get(membership["workspace_id"])
        if workspace is None or workspace.get("closed_at"):
            continue
        entry = {"workspace_id": membership["workspace_id"], "name": workspace["name"]}
        if membership["role"] != "owner":
            plan.leaving.append(entry)
            continue
        others = [
            m
            for m in await memberships.list_for_workspace(membership["workspace_id"])
            if m["user_id"] != user_id
        ]
        people = await UserRepository(db).find_many_by_ids([m["user_id"] for m in others])
        active = [
            m
            for m in others
            if (people.get(m["user_id"]) or {}).get("auth_providers") != ["invited"]
        ]
        if active:
            plan.blocking.append(entry)
        else:
            projects = await ProjectRepository(db).list_for_workspace(
                membership["workspace_id"], include_archived=True
            )
            plan.closing.append({**entry, "projects": len(projects)})
    return plan


async def request_code(db: AsyncIOMotorDatabase[dict[str, Any]], user_id: str) -> None:
    from app.core.config import get_settings
    from app.modules.auth.repository import OtpRepository, UserRepository

    user = await UserRepository(db).find_by_id(user_id)
    if user is None:
        raise AuthenticationError("User not found.")
    settings = get_settings()
    code = generate_otp_code()
    await OtpRepository(db).create(
        email=user["email"],
        code_hash=hash_secret(code),
        ttl_minutes=settings.otp_ttl_minutes,
        purpose=deletion_purpose(user_id),
    )
    await send_email(
        to=user["email"],
        subject="Confirm deleting your Backline account",
        html="<p>Use this code to confirm deleting your Backline account:</p>"
        f'<p style="font:700 24px/1.2 monospace;letter-spacing:4px">{code}</p>'
        f"<p>It expires in {settings.otp_ttl_minutes} minutes. If you didn't ask to delete "
        "your account, ignore this email and consider changing your password.</p>",
    )


async def delete_account(
    db: AsyncIOMotorDatabase[dict[str, Any]], session: Session, *, code: str
) -> None:
    from app.modules.auth.repository import UserRepository
    from app.modules.auth.service import _verify_and_consume_otp, revoke_all_sessions
    from app.modules.notifications.repository import NotificationRepository
    from app.modules.projects.repository import ProjectRepository
    from app.modules.share_links.repository import ShareLinkRepository
    from app.modules.workspaces import events as workspace_events
    from app.modules.workspaces.repository import MembershipRepository, WorkspaceRepository
    from app.modules.workspaces.service import leave_workspace

    users = UserRepository(db)
    user = await users.find_by_id(session.user_id)
    if user is None:
        raise AuthenticationError("User not found.")
    plan = await build_plan(db, session.user_id)
    if plan.blocking:
        names = ", ".join(entry["name"] for entry in plan.blocking)
        raise ConflictError(
            f"You own {names}, which other people use. Make someone else the owner first "
            "(Team → their name → Make owner), then delete your account."
        )
    await _verify_and_consume_otp(
        db, user["email"], code, purpose=deletion_purpose(session.user_id)
    )

    memberships = MembershipRepository(db)
    for entry in plan.leaving:
        membership = await memberships.find(
            workspace_id=entry["workspace_id"], user_id=session.user_id
        )
        if membership is None:
            continue
        await leave_workspace(
            db,
            workspace_id=entry["workspace_id"],
            actor=Session(
                user_id=session.user_id,
                workspace_id=entry["workspace_id"],
                role=membership["role"],
            ),
        )

    purge_after = datetime.now(UTC) + PURGE_GRACE
    for entry in plan.closing:
        workspace_id = entry["workspace_id"]
        await ProjectRepository(db).archive_all_for_workspace(workspace_id)
        await ShareLinkRepository(db).revoke_all_for_workspace(workspace_id)
        await WorkspaceRepository(db).mark_closed(
            workspace_id, closed_by=session.user_id, purge_after=purge_after
        )
        for membership in await memberships.list_for_workspace(workspace_id):
            await memberships.delete(
                workspace_id=workspace_id, membership_id=str(membership["_id"])
            )
        await append_event(
            db,
            workspace_id=workspace_id,
            type=workspace_events.WORKSPACE_CLOSED,
            actor_type="member",
            actor_id=session.user_id,
            payload={"reason": "owner_deleted_account", "purge_after": purge_after.isoformat()},
        )

    await revoke_all_sessions(db, session.user_id)
    await NotificationRepository(db).delete_all_for_user(session.user_id)
    user_oid = ObjectId(session.user_id)
    await users.update(
        user_oid,
        {
            "name": DELETED_NAME,
            "email": f"deleted-{session.user_id}@deleted.invalid",
            "password_hash": None,
            "avatar_url": None,
            "auth_providers": [],
            "email_verified_at": None,
            "deleted_at": datetime.now(UTC),
            "preferences.email_notifications": False,
            "preferences.daily_digest": False,
        },
    )
