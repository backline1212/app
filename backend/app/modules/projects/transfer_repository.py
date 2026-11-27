from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument, UpdateOne

from app.core.config import get_settings
from app.core.mongo_utils import to_object_id
from app.core.project_access import access_settings
from app.modules.projects.repository import TRANSFER_LOCK_TTL

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
        # A lock left behind by a crashed move remembers the state before that attempt.
        stale = project.get("transfer")
        original = stale["was_archived_at"] if stale else project.get("archived_at")
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
                    "archived_at": project.get("archived_at") or now,
                    "transfer": {
                        "id": transfer_id,
                        "started_at": now,
                        "was_archived_at": original,
                    },
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        return False if result is None else original

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

    async def forget_cleanups(
        self,
        workspace_id: str,
        keys: list[str],
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> None:
        """Drops earlier delete records for these paths. A project moved back reuses its old
        paths: a leftover pending delete would remove the new copy, and a finished one would
        stop the same path ever being queued again."""
        if keys:
            await self.db.object_gc_tombstones.delete_many(
                {
                    "workspace_id": workspace_id,
                    "bucket": get_settings().r2_bucket_name,
                    "key": {"$in": keys},
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

    async def move_graph(
        self,
        *,
        source_id: str,
        target_id: str,
        project: dict[str, Any],
        prefixes: list[tuple[str, str]],
        archived_at: datetime | None,
        actor_user_id: str,
        session: AsyncIOMotorClientSession,
    ) -> int:
        """Re-homes the project and everything that hangs off it, inside the caller's
        transaction. Returns how many tickets were given new numbers."""
        db = self.db
        project_id = str(project["_id"])
        now = datetime.now(UTC)
        members = await self.member_ids(target_id, session=session)
        owned = {"workspace_id": source_id, "project_id": project_id}

        page_ids = [
            str(doc["_id"]) async for doc in db.pages.find(owned, {"_id": 1}, session=session)
        ]
        comment_query = {
            "workspace_id": source_id,
            "$or": [{"project_id": project_id}, {"page_id": {"$in": page_ids}}],
        }
        comments = await db.comments.find(comment_query, session=session).to_list(length=None)
        comment_ids = [str(doc["_id"]) for doc in comments]
        share_link_ids = [
            str(doc["_id"]) async for doc in db.share_links.find(owned, {"_id": 1}, session=session)
        ]

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

        operations: list[UpdateOne] = []
        for comment in comments:
            changes = _changed(comment, prefixes)
            changes["workspace_id"] = target_id
            if comment["_id"] in numbers:
                changes["ticket_number"] = numbers[comment["_id"]]
            # People who aren't in the destination can't stay on its tickets.
            for field in ("assignee_ids", "waiting_on_ids"):
                if comment.get(field):
                    changes[field] = [user for user in comment[field] if user in members]
            if comment.get("assignee_id") and comment["assignee_id"] not in members:
                changes["assignee_id"] = None
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
        await db.integration_links.delete_many(
            {"workspace_id": source_id, "comment_id": {"$in": comment_ids}}, session=session
        )
        await db.integration_dispatches.delete_many(owned, session=session)
        await db.extension_tokens.update_many(
            {**owned, "revoked_at": None}, {"$set": {"revoked_at": now}}, session=session
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
            session=session,
        )
        return len(numbered)

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
        session: AsyncIOMotorClientSession,
    ) -> None:
        now = datetime.now(UTC)
        visibility, default_role, listed = access_settings(project)
        kept = [m for m in listed if m["user_id"] in members and m["user_id"] != actor_user_id]
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
                # Clients are a workspace's own records.
                "client_id": None,
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
        await self.db.projects.update_one(
            {"_id": project["_id"], "workspace_id": source_id},
            {
                "$set": changes,
                "$unset": {"transfer": "", "client_request_id": "", "request_fingerprint": ""},
            },
            session=session,
        )
