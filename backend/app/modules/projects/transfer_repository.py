from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument, UpdateOne

from app.core.config import get_settings
from app.core.mongo_utils import to_object_id
from app.core.project_access import access_settings
from app.modules.integrations.repository import IntegrationLinkRepository
from app.modules.projects.repository import TRANSFER_LOCK_TTL
from app.modules.projects.transfer_activity import TransferActivityRepository, restricted_audience

# An upload link works for five minutes; a little longer allows for the upload to finish.
_UPLOAD_WINDOW = timedelta(minutes=6)
# Collections whose rows only need to change owner; nothing inside them names the workspace.
_PLAIN_COLLECTIONS = ("pages", "revisions", "revision_diffs", "recovery_logs", "share_links")


def rekey(value: Any, prefixes: list[tuple[str, str]]) -> Any:
    """Every stored-file path under an old prefix, wherever it sits, moved to the new one."""
    if isinstance(value, str):
        for old, new in prefixes:
            if value.startswith(old):
                return new + value[len(old) :]
        return value
    if isinstance(value, dict):
        return {name: rekey(item, prefixes) for name, item in value.items()}
    if isinstance(value, list):
        return [rekey(item, prefixes) for item in value]
    return value


def _changed(before: dict[str, Any], prefixes: list[tuple[str, str]]) -> dict[str, Any]:
    return {
        name: moved
        for name, value in before.items()
        if name != "_id" and (moved := rekey(value, prefixes)) != value
    }


@dataclass(frozen=True)
class ProjectContents:
    """The ids and tickets that make up one project."""

    page_ids: list[str]
    comments: list[dict[str, Any]]
    share_link_ids: list[str]

    @property
    def comment_ids(self) -> list[str]:
        return [str(doc["_id"]) for doc in self.comments]


@dataclass
class MoveResult:
    renumbered: int = 0
    # Person taken off tickets -> those tickets' numbers in the destination.
    unassigned: dict[str, set[int]] = field(default_factory=dict)
    issue_links_kept: int = 0
    activity_copied: int = 0


def people_named_on(comment: dict[str, Any]) -> set[str]:
    """Everyone assigned to a ticket, or being waited on for it."""
    named = {*(comment.get("assignee_ids") or []), *(comment.get("waiting_on_ids") or [])}
    if comment.get("assignee_id"):
        named.add(comment["assignee_id"])
    return {str(user) for user in named}


class ProjectTransferRepository:
    """Reads and writes for moving one project between workspaces. Every query is scoped to
    the workspace the project is leaving (or, where it says so, the one receiving it)."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def lock(
        self, workspace_id: str, project: dict[str, Any], transfer_id: str
    ) -> datetime | None | bool:
        """Closes the project to writes by archiving it for the length of the move.
        Returns the archive date to put back (None for an active project), or False when
        another move or a deletion holds it."""
        now = datetime.now(UTC)
        # A lock left behind by a crashed move remembers the state before that attempt -
        # unless someone has restored or archived the project since.
        stale = project.get("transfer")
        untouched = stale and project.get("archived_at") == stale.get("held_at")
        original = stale["was_archived_at"] if stale and untouched else project.get("archived_at")
        held_at = project.get("archived_at") or now
        result = await self.db.projects.find_one_and_update(
            {
                "_id": project["_id"],
                "workspace_id": workspace_id,
                "archived_at": project.get("archived_at"),
                "hard_delete_status": {"$ne": "deleting"},
                "$or": [
                    {"transfer": None},
                    {"transfer.started_at": {"$lt": now - TRANSFER_LOCK_TTL}},
                ],
            },
            {
                "$set": {
                    "archived_at": held_at,
                    "transfer": {
                        "id": transfer_id,
                        "started_at": now,
                        "was_archived_at": original,
                        "held_at": held_at,
                    },
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        return False if result is None else original

    async def renew(self, workspace_id: str, project_id: str, transfer_id: str) -> bool:
        """Keeps the lock fresh. False once this move no longer holds the project in
        `workspace_id`: it finished, or something else took over."""
        result = await self.db.projects.update_one(
            {
                "_id": to_object_id(project_id),
                "workspace_id": workspace_id,
                "transfer.id": transfer_id,
                "hard_delete_status": {"$ne": "deleting"},
            },
            {"$set": {"transfer.started_at": datetime.now(UTC)}},
        )
        return result.matched_count == 1

    async def has_unfinished_cleanup(self, workspace_ids: list[str], project_id: str) -> bool:
        """Files of this project still waiting to be deleted in either workspace. A move
        now could reuse their paths and lose the new copies."""
        found = await self.db.object_gc_tombstones.find_one(
            {
                "workspace_id": {"$in": workspace_ids},
                "project_id": project_id,
                "status": {"$in": ["pending", "deleting", "failed"]},
            },
            {"_id": 1},
        )
        return found is not None

    async def has_open_upload(
        self,
        workspace_id: str,
        project_id: str,
        listed: set[str],
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> bool:
        """An upload link issued moments ago whose file has not arrived could still land
        under the old path after it was copied."""
        cursor = self.db.storage_objects.find(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "state": "reserved",
                "updated_at": {"$gt": datetime.now(UTC) - _UPLOAD_WINDOW},
            },
            {"key": 1},
            session=session,
        )
        return any([doc["key"] not in listed async for doc in cursor])

    async def has_issue_being_filed(
        self, workspace_id: str, comment_ids: list[str], *, session: AsyncIOMotorClientSession
    ) -> bool:
        found = await self.db.integration_links.find_one(
            {
                "workspace_id": workspace_id,
                "comment_id": {"$in": comment_ids},
                "status": "pending",
                "created_at": {"$gt": datetime.now(UTC) - IntegrationLinkRepository.PENDING_TTL},
            },
            {"_id": 1},
            session=session,
        )
        return found is not None

    async def mark_transfer_cleanups(
        self, workspace_id: str, correlation_id: str, *, session: AsyncIOMotorClientSession
    ) -> None:
        """Lets the scheduled sweep find old copies that a lost job left behind."""
        await self.db.object_gc_tombstones.update_many(
            {"workspace_id": workspace_id, "correlation_id": correlation_id},
            {"$set": {"reason": "transfer"}},
            session=session,
        )

    async def release(
        self, workspace_id: str, project_id: str, transfer_id: str, archived_at: datetime | None
    ) -> None:
        await self.db.projects.update_one(
            {
                "_id": to_object_id(project_id),
                "workspace_id": workspace_id,
                "transfer.id": transfer_id,
            },
            {"$set": {"archived_at": archived_at}, "$unset": {"transfer": ""}},
        )

    async def stored_bytes(
        self,
        workspace_id: str,
        project_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, int]:
        cursor = self.db.storage_objects.find(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "bucket": get_settings().r2_bucket_name,
                "state": {"$in": ["reserved", "stored"]},
            },
            {"key": 1, "byte_size": 1},
            session=session,
        )
        return {str(doc["key"]): int(doc["byte_size"]) async for doc in cursor}

    async def hand_over_usage(
        self,
        source_id: str,
        target_id: str,
        project_id: str,
        prefix: str,
        *,
        session: AsyncIOMotorClientSession,
    ) -> None:
        """Files whose path does not name the workspace stay where they are; only the
        workspace their size counts against changes."""
        await self.db.storage_objects.update_many(
            {
                "workspace_id": source_id,
                "project_id": project_id,
                "key": {"$regex": f"^{re.escape(prefix)}"},
            },
            {"$set": {"workspace_id": target_id}},
            session=session,
        )

    async def forget_cleanups(
        self,
        workspace_id: str,
        keys: list[str],
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> None:
        """Drops finished delete records for these paths. A project moved back reuses its
        old paths, and a finished record would stop the same path ever being queued again.
        Unfinished ones block the move instead (has_unfinished_cleanup)."""
        if keys:
            await self.db.object_gc_tombstones.delete_many(
                {
                    "workspace_id": workspace_id,
                    "bucket": get_settings().r2_bucket_name,
                    "key": {"$in": keys},
                    "status": "deleted",
                },
                session=session,
            )

    async def member_ids(
        self, workspace_id: str, *, session: AsyncIOMotorClientSession
    ) -> set[str]:
        cursor = self.db.memberships.find(
            {"workspace_id": workspace_id}, {"user_id": 1}, session=session
        )
        return {str(doc["user_id"]) async for doc in cursor}

    async def contents(
        self,
        workspace_id: str,
        project_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> ProjectContents:
        db = self.db
        owned = {"workspace_id": workspace_id, "project_id": project_id}
        page_ids = [
            str(doc["_id"]) async for doc in db.pages.find(owned, {"_id": 1}, session=session)
        ]
        comments = await db.comments.find(
            {
                "workspace_id": workspace_id,
                "$or": [{"project_id": project_id}, {"page_id": {"$in": page_ids}}],
            },
            session=session,
        ).to_list(length=None)
        share_link_ids = [
            str(doc["_id"]) async for doc in db.share_links.find(owned, {"_id": 1}, session=session)
        ]
        return ProjectContents(page_ids, comments, share_link_ids)

    async def issue_link_count(self, workspace_id: str, comment_ids: list[str]) -> int:
        return await self.db.integration_links.count_documents(
            {"workspace_id": workspace_id, "comment_id": {"$in": comment_ids}, "status": "done"}
        )

    async def move_graph(
        self,
        *,
        source_id: str,
        target_id: str,
        project: dict[str, Any],
        prefixes: list[tuple[str, str]],
        archived_at: datetime | None,
        actor_user_id: str,
        client_id: str | None,
        extra_access: list[dict[str, Any]],
        keep_issue_links: bool,
        copy_activity: bool,
        session: AsyncIOMotorClientSession,
    ) -> MoveResult:
        """Re-homes the project and everything that hangs off it, inside the caller's
        transaction. Anyone to be added to the destination must already be a member."""
        db = self.db
        project_id = str(project["_id"])
        now = datetime.now(UTC)
        members = await self.member_ids(target_id, session=session)
        owned = {"workspace_id": source_id, "project_id": project_id}

        contents = await self.contents(source_id, project_id, session=session)
        page_ids = contents.page_ids
        comments = contents.comments
        comment_ids = contents.comment_ids
        share_link_ids = contents.share_link_ids
        result = MoveResult()
        # First, while guest sessions and tickets are still here to be named.
        result.activity_copied = await TransferActivityRepository(db).carry(
            source_id=source_id,
            target_id=target_id,
            project_id=project_id,
            page_ids=page_ids,
            comment_ids=comment_ids,
            share_link_ids=share_link_ids,
            old_numbers={
                str(doc["_id"]): doc["ticket_number"]
                for doc in comments
                if isinstance(doc.get("ticket_number"), int)
            },
            copy=copy_activity,
            include_issues=keep_issue_links,
            restricted_to=restricted_audience(project),
            session=session,
        )

        # Ticket numbers are unique per workspace, so moved tickets join the end of the
        # destination's sequence, in their old order.
        numbered = sorted(
            (doc for doc in comments if isinstance(doc.get("ticket_number"), int)),
            key=lambda doc: doc["ticket_number"],
        )
        numbers: dict[Any, int] = {}
        if numbered:
            counter = await db.counters.find_one_and_update(
                {"_id": f"tickets:{target_id}"},
                {"$inc": {"seq": len(numbered)}},
                upsert=True,
                return_document=ReturnDocument.AFTER,
                session=session,
            )
            first = int(counter["seq"]) - len(numbered) + 1
            numbers = {doc["_id"]: first + index for index, doc in enumerate(numbered)}
        result.renumbered = len(numbered)
        ticket_numbers = {
            str(doc["_id"]): numbers.get(doc["_id"], doc.get("ticket_number")) for doc in comments
        }

        operations: list[UpdateOne] = []
        for comment in comments:
            changes = _changed(comment, prefixes)
            changes["workspace_id"] = target_id
            if comment["_id"] in numbers:
                changes["ticket_number"] = numbers[comment["_id"]]
            # People who aren't in the destination can't stay on its tickets.
            if comment.get("deleted_at") is None:
                ticket = comment.get("parent_id") or str(comment["_id"])
                for user in people_named_on(comment) - members:
                    held = result.unassigned.setdefault(user, set())
                    number = ticket_numbers.get(ticket)
                    if isinstance(number, int):
                        held.add(number)
            for key in ("assignee_ids", "waiting_on_ids"):
                if comment.get(key):
                    changes[key] = [user for user in comment[key] if user in members]
            if comment.get("assignee_id") and comment["assignee_id"] not in members:
                # The primary assignee is the first of whoever is left.
                remaining = changes.get("assignee_ids") or []
                changes["assignee_id"] = remaining[0] if remaining else None
            operations.append(
                UpdateOne(
                    {"_id": comment["_id"], "workspace_id": source_id},
                    # Retry keys are unique per workspace and have served their purpose.
                    {
                        "$set": changes,
                        "$unset": {"client_request_id": "", "request_fingerprint": ""},
                    },
                )
            )
        if operations:
            await db.comments.bulk_write(operations, session=session)

        for name in ("project_assets", "browser_renders"):
            async for doc in db[name].find(owned, session=session):
                changes = _changed(doc, prefixes)
                changes["workspace_id"] = target_id
                await db[name].update_one(
                    {"_id": doc["_id"], "workspace_id": source_id},
                    {
                        "$set": changes,
                        "$unset": {"client_request_id": "", "request_fingerprint": ""},
                    },
                    session=session,
                )

        # An upload record is keyed by its file path, so it is rewritten rather than updated.
        uploads = await db.uploads.find(owned, session=session).to_list(length=None)
        if uploads:
            await db.uploads.delete_many(owned, session=session)
            await db.uploads.insert_many(
                [
                    {
                        **rekey(doc, prefixes),
                        "workspace_id": target_id,
                    }
                    for doc in uploads
                ],
                session=session,
            )

        # Dashboard preview sessions of people outside the destination end here; clients
        # keep theirs, so their review links carry on working.
        await db.guest_sessions.update_many(
            {
                "workspace_id": source_id,
                "share_link_id": {"$in": share_link_ids},
                "member_user_id": {"$nin": [*members, None]},
            },
            {"$set": {"ended_at": now}},
            session=session,
        )
        await db.guest_sessions.update_many(
            {"workspace_id": source_id, "share_link_id": {"$in": share_link_ids}},
            {"$set": {"workspace_id": target_id}},
            session=session,
        )

        # What belongs to the old workspace's people and connections does not travel.
        await db.notifications.delete_many(
            {
                "workspace_id": source_id,
                "$or": [
                    {"payload_json.project_id": project_id},
                    {"payload_json.comment_id": {"$in": comment_ids}},
                ],
            },
            session=session,
        )
        await db.integrations.delete_many(
            {"workspace_id": source_id, "project_scope": project_id}, session=session
        )
        links = {"workspace_id": source_id, "comment_id": {"$in": comment_ids}}
        if keep_issue_links:
            # A saved link shows the issue on its ticket and stops a second one being
            # filed in the same tracker (TDR-0235). Half-sent ones are dropped below.
            kept = await db.integration_links.update_many(
                {**links, "status": "done"},
                {"$set": {"workspace_id": target_id}},
                session=session,
            )
            result.issue_links_kept = kept.modified_count
        await db.integration_links.delete_many(links, session=session)
        await db.integration_dispatches.delete_many(owned, session=session)
        await db.extension_tokens.update_many(
            {**owned, "revoked_at": None}, {"$set": {"revoked_at": now}}, session=session
        )
        # Deploys waiting on the old workspace's hook are not the new one's to accept.
        await db.deployments.update_many(
            {**owned, "status": "awaiting_review"},
            {"$set": {"status": "cancelled", "cancel_reason": "credential_changed"}},
            session=session,
        )
        await db.deployments.update_many(
            owned, {"$set": {"workspace_id": target_id}}, session=session
        )

        await db.recovery_logs.update_many(
            {"workspace_id": source_id, "comment_id": {"$in": comment_ids}},
            {"$set": {"workspace_id": target_id}},
            session=session,
        )
        for name in ("revisions", "revision_diffs"):
            await db[name].update_many(
                {"workspace_id": source_id, "page_id": {"$in": page_ids}},
                {"$set": {"workspace_id": target_id}},
                session=session,
            )
        for name in ("pages", "share_links"):
            await db[name].update_many(
                owned, {"$set": {"workspace_id": target_id}}, session=session
            )

        await self._move_project(
            source_id=source_id,
            target_id=target_id,
            project=project,
            prefixes=prefixes,
            archived_at=archived_at,
            actor_user_id=actor_user_id,
            members=members,
            client_id=client_id,
            extra_access=extra_access,
            session=session,
        )
        return result

    async def _move_project(
        self,
        *,
        source_id: str,
        target_id: str,
        project: dict[str, Any],
        prefixes: list[tuple[str, str]],
        archived_at: datetime | None,
        actor_user_id: str,
        members: set[str],
        client_id: str | None,
        extra_access: list[dict[str, Any]],
        session: AsyncIOMotorClientSession,
    ) -> None:
        now = datetime.now(UTC)
        visibility, default_role, listed = access_settings(project)
        kept = [m for m in listed if m["user_id"] in members and m["user_id"] != actor_user_id]
        named = {m["user_id"] for m in kept} | {actor_user_id}
        creator = project.get("created_by")
        # A project from before access lists makes its creator a manager; keep that.
        if not project.get("access") and creator in members and creator not in named:
            kept.append(
                {"user_id": creator, "role": "manager", "added_by": creator, "added_at": now}
            )
            named.add(creator)
        kept.extend(m for m in extra_access if m["user_id"] not in named)
        mover = {
            "user_id": actor_user_id,
            "role": "manager",
            "added_by": actor_user_id,
            "added_at": now,
        }
        changes = _changed(project, prefixes)
        changes.pop("transfer", None)
        changes.update(
            {
                "workspace_id": target_id,
                # Clients are a workspace's own records: this is the destination's, or none.
                "client_id": client_id,
                "archived_at": archived_at,
                "updated_at": now,
                "access": {
                    "visibility": visibility,
                    "default_role": str(default_role),
                    "members": [*kept, mover],
                },
            }
        )
        if project.get("created_by") not in members:
            changes["created_by"] = actor_user_id
        # The old team holds the deploy hook's signing secret, so it ends here (TDR-0245).
        if project.get("deploy_sync"):
            changes["deploy_sync"] = {
                "enabled": False,
                "version": int(project["deploy_sync"].get("version", 0)) + 1,
                "rotated_at": now,
            }
        await self.db.projects.update_one(
            {"_id": project["_id"], "workspace_id": source_id},
            {
                "$set": changes,
                "$unset": {"transfer": "", "client_request_id": "", "request_fingerprint": ""},
            },
            session=session,
        )
