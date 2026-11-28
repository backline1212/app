"""The things a person chooses to take with a project when moving it (TDR-0245): its
client and the people on it. The preview and the move read the same rules."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.errors import ConflictError, ValidationError
from app.core.events import append_event
from app.core.permissions import PROJECT_ROLE_RANK, ProjectRole
from app.core.project_access import VISIBILITY_PRIVATE, access_settings, effective_project_role
from app.modules.auth.repository import UserRepository
from app.modules.billing.limits import count_usage, plan_limit, require_within_plan_limit
from app.modules.billing.plans import effective_plan_id, get_plan_definition
from app.modules.billing.repository import BillingRepository
from app.modules.clients.repository import ClientRepository
from app.modules.projects.schemas import (
    ProjectTransferClient,
    ProjectTransferPerson,
    ProjectTransferPreview,
)
from app.modules.projects.transfer_activity import TransferActivityRepository
from app.modules.projects.transfer_repository import (
    ProjectContents,
    ProjectTransferRepository,
    people_named_on,
)
from app.modules.workspaces import events as workspace_events
from app.modules.workspaces.repository import MembershipRepository

ClientOutcome = Literal["linked", "created", "none"]


async def _roles(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    *,
    session: AsyncIOMotorClientSession | None = None,
) -> dict[str, str]:
    members = await MembershipRepository(db).list_for_workspace(workspace_id, session=session)
    return {str(m["user_id"]): m["role"] for m in members}


def _tickets_by_person(project: dict[str, Any], contents: ProjectContents) -> dict[str, set[str]]:
    """Everyone on the project: named on a live ticket, or on its access list."""
    held: dict[str, set[str]] = {m["user_id"]: set() for m in access_settings(project)[2]}
    for comment in contents.comments:
        if comment.get("deleted_at") is None:
            ticket = comment.get("parent_id") or str(comment["_id"])
            for user in people_named_on(comment):
                held.setdefault(user, set()).add(ticket)
    return held


async def _addable(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    source_id: str,
    target_id: str,
    project: dict[str, Any],
    contents: ProjectContents,
    session: AsyncIOMotorClientSession | None = None,
) -> dict[str, set[str]]:
    """People on the project who are still in this workspace but not in the destination.
    Nobody else can be added through a move."""
    here = await _roles(db, source_id, session=session)
    there = await _roles(db, target_id, session=session)
    return {
        user: tickets
        for user, tickets in _tickets_by_person(project, contents).items()
        if user in here and user not in there
    }


def _client_summary(doc: dict[str, Any]) -> ProjectTransferClient:
    return ProjectTransferClient(
        name=doc["name"], contact_name=doc.get("contact_name") or "", email=doc.get("email")
    )


async def preview(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    source_id: str,
    target_id: str,
    project: dict[str, Any],
) -> ProjectTransferPreview:
    project_id = str(project["_id"])
    repo = ProjectTransferRepository(db)
    contents = await repo.contents(source_id, project_id)

    clients = ClientRepository(db)
    client = (
        await clients.find(source_id, project["client_id"]) if project.get("client_id") else None
    )
    match = await clients.find_by_name(target_id, client["name"]) if client else None

    addable = await _addable(
        db, source_id=source_id, target_id=target_id, project=project, contents=contents
    )
    users = await UserRepository(db).find_many_by_ids(list(addable))
    people = [
        ProjectTransferPerson(
            user_id=user_id,
            name=users[user_id].get("name") or users[user_id]["email"],
            email=users[user_id]["email"],
            ticket_count=len(tickets),
        )
        for user_id, tickets in addable.items()
        if user_id in users
    ]

    workspace = await BillingRepository(db).find_workspace(target_id)
    assert workspace is not None
    return ProjectTransferPreview(
        client=_client_summary(client) if client else None,
        existing_client=_client_summary(match) if match else None,
        people=sorted(people, key=lambda person: person.name.casefold()),
        member_count=await count_usage(db, target_id, "members"),
        member_limit=plan_limit(get_plan_definition(effective_plan_id(workspace)), "members"),
        issue_link_count=await repo.issue_link_count(source_id, contents.comment_ids),
        activity_count=await TransferActivityRepository(db).count(
            source_id,
            project_id,
            contents.page_ids,
            contents.comment_ids,
            contents.share_link_ids,
        ),
    )


async def require_room_for(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    source_id: str,
    target_id: str,
    project: dict[str, Any],
    user_ids: list[str],
) -> None:
    """Refuses before any file is copied when the people asked for can't all be added."""
    if not user_ids:
        return
    contents = await ProjectTransferRepository(db).contents(source_id, str(project["_id"]))
    addable = await _addable(
        db, source_id=source_id, target_id=target_id, project=project, contents=contents
    )
    there = await _roles(db, target_id)
    new = {user for user in user_ids if user not in there}
    if new - set(addable):
        raise ValidationError("Only people on this project can be added with it.")
    workspace = await BillingRepository(db).find_workspace(target_id)
    assert workspace is not None
    limit = plan_limit(get_plan_definition(effective_plan_id(workspace)), "members")
    if limit is not None and new and await count_usage(db, target_id, "members") + len(new) > limit:
        raise ValidationError(
            f"The destination workspace has room for {limit} members. "
            "Add fewer people, or upgrade it first."
        )


async def add_people(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    source_id: str,
    target_id: str,
    project: dict[str, Any],
    user_ids: list[str],
    actor_user_id: str,
    session: AsyncIOMotorClientSession,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Adds the chosen people to the destination as ordinary members, inside the move's
    transaction, so they join only if the project does. Returns their email addresses and
    any access entries they need to keep seeing a private project."""
    here = await _roles(db, source_id, session=session)
    there = await _roles(db, target_id, session=session)
    new = [user for user in dict.fromkeys(user_ids) if user not in there]
    if not new:
        return [], []
    # Checked again here: someone may have been taken off the project during the copy.
    contents = await ProjectTransferRepository(db).contents(
        source_id, str(project["_id"]), session=session
    )
    addable = await _addable(
        db,
        source_id=source_id,
        target_id=target_id,
        project=project,
        contents=contents,
        session=session,
    )
    if set(new) - set(addable):
        raise ConflictError("The people on this project changed. Check the list and try again.")
    users = await UserRepository(db).find_many_by_ids(new)
    visibility, _, listed = access_settings(project)
    already_listed = {m["user_id"] for m in listed}
    now = datetime.now(UTC)
    emails: list[str] = []
    access: list[dict[str, Any]] = []
    for user_id in new:
        if user_id not in users:
            raise ConflictError("The people on this project changed. Check the list and try again.")
        await require_within_plan_limit(db, target_id, "members", session=session)
        await MembershipRepository(db).create(
            workspace_id=target_id,
            user_id=user_id,
            role="member",
            invited_by=actor_user_id,
            joined_via="invite",
            session=session,
        )
        email = users[user_id]["email"]
        emails.append(email)
        await append_event(
            db,
            workspace_id=target_id,
            type=workspace_events.MEMBER_INVITED,
            actor_type="member",
            actor_id=actor_user_id,
            payload={"invited_email": email, "role": "member", "user_id": user_id},
            session=session,
        )
        # An owner or admin saw a private project without being listed on it.
        had = effective_project_role(project, user_id=user_id, workspace_role=here[user_id])
        if visibility == VISIBILITY_PRIVATE and user_id not in already_listed and had:
            role = min(had, ProjectRole.EDITOR, key=PROJECT_ROLE_RANK.__getitem__)
            access.append(
                {"user_id": user_id, "role": str(role), "added_by": actor_user_id, "added_at": now}
            )
    return emails, access


async def bring_client(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    source_id: str,
    target_id: str,
    project: dict[str, Any],
    choice: Literal["contact", "name", "none"],
    match: Literal["existing", "new"],
    actor_user_id: str,
    session: AsyncIOMotorClientSession,
) -> tuple[str | None, ClientOutcome, str | None]:
    """(destination client id, what happened, its name). The client is copied, never
    moved, and an existing destination client is never overwritten."""
    clients = ClientRepository(db)
    if choice == "none" or not project.get("client_id"):
        return None, "none", None
    original = await clients.find(source_id, project["client_id"], session=session)
    if original is None:
        return None, "none", None
    if match == "existing":
        existing = await clients.find_by_name(target_id, original["name"], session=session)
        if existing is not None:
            return str(existing["_id"]), "linked", existing["name"]
    with_contact = choice == "contact"
    created = await clients.create(
        target_id,
        {
            "name": original["name"],
            "contact_name": (original.get("contact_name") or "") if with_contact else "",
            "email": original.get("email") if with_contact else None,
            "created_by": actor_user_id,
        },
        session=session,
    )
    await append_event(
        db,
        workspace_id=target_id,
        type="client.created",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"client_id": str(created["_id"]), "name": created["name"]},
        session=session,
    )
    return str(created["_id"]), "created", created["name"]
