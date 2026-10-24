from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.core.mongo_utils import to_object_id


class RevisionRepository:
    """`revisions` - 11-Database.md §11.8. Only the create-a-new-revision-on-hash-change
    path lands in Milestone 3; the diff engine (10-Revision-Recovery.md) is Milestone 8."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def find_current(
        self, workspace_id: str, page_id: str, *, session: AsyncIOMotorClientSession | None = None
    ) -> dict[str, Any] | None:
        page = await self.db.pages.find_one(
            {"workspace_id": workspace_id, "_id": to_object_id(page_id)},
            session=session,
        )
        if page and page.get("latest_revision_id"):
            pointed = await self.db.revisions.find_one(
                {
                    "workspace_id": workspace_id,
                    "page_id": page_id,
                    "_id": to_object_id(page["latest_revision_id"]),
                    "snapshot_key": {"$type": "string"},
                },
                session=session,
            )
            if pointed:
                return {**pointed, "is_current": True}
        return await self.db.revisions.find_one(
            {"workspace_id": workspace_id, "page_id": page_id, "is_current": True}, session=session
        )

    async def find_previous(
        self, workspace_id: str, page_id: str, *, exclude_revision_id: str
    ) -> dict[str, Any] | None:
        """The revision that was current immediately before `exclude_revision_id` (the
        new one) - used by the recovery pipeline (10-Revision-Recovery.md §10.4) to diff
        against. Not simply "is_current: False", since a page can have many old
        revisions; this is the most recent one that isn't the new one itself."""
        revision = await self.db.revisions.find_one(
            {
                "workspace_id": workspace_id,
                "page_id": page_id,
                "_id": to_object_id(exclude_revision_id),
            }
        )
        if revision and "previous_revision_id" in revision:
            previous_id = revision["previous_revision_id"]
            if previous_id is None:
                return None
            return await self.db.revisions.find_one(
                {
                    "workspace_id": workspace_id,
                    "page_id": page_id,
                    "_id": to_object_id(previous_id),
                    "snapshot_key": {"$type": "string"},
                }
            )
        cursor = (
            self.db.revisions.find(
                {
                    "workspace_id": workspace_id,
                    "page_id": page_id,
                    "_id": {"$ne": to_object_id(exclude_revision_id)},
                    "snapshot_key": {"$type": "string"},
                }
            )
            .sort("captured_at", -1)
            .limit(1)
        )
        async for doc in cursor:
            result: dict[str, Any] = doc
            return result
        return None

    async def list_for_pages(
        self, workspace_id: str, page_ids: list[str], *, limit: int = 200
    ) -> list[dict[str, Any]]:
        if not page_ids:
            return []
        cursor = (
            self.db.revisions.find({"workspace_id": workspace_id, "page_id": {"$in": page_ids}})
            .sort([("captured_at", -1), ("_id", -1)])
            .limit(limit)
        )
        return [doc async for doc in cursor]

    async def create(
        self, *, page_id: str, workspace_id: str, full_page_hash: str
    ) -> dict[str, Any]:
        doc = {
            "page_id": page_id,
            "workspace_id": workspace_id,
            "snapshot_key": None,
            "full_page_hash": full_page_hash,
            "captured_at": datetime.now(UTC),
            "is_current": True,
        }
        result = await self.db.revisions.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def set_snapshot_key(
        self, workspace_id: str, revision_id: str, snapshot_key: str
    ) -> None:
        await self.db.revisions.update_one(
            {"_id": to_object_id(revision_id), "workspace_id": workspace_id},
            {"$set": {"snapshot_key": snapshot_key}},
        )

    async def mark_not_current(self, workspace_id: str, revision_id: str) -> None:
        await self.db.revisions.update_one(
            {"_id": to_object_id(revision_id), "workspace_id": workspace_id},
            {"$set": {"is_current": False}},
        )

    async def commit_ready(
        self,
        *,
        session: AsyncIOMotorClientSession,
        workspace_id: str,
        page_id: str,
        revision_id: ObjectId,
        snapshot_key: str,
        full_page_hash: str,
        actor_type: str,
        actor_id: str,
        trusted_capture: bool = True,
    ) -> tuple[dict[str, Any], bool]:
        current = await self.find_current(workspace_id, page_id, session=session)
        if current and current["full_page_hash"] == full_page_hash and current.get("snapshot_key"):
            # Legacy completed rows may predate the durable outbox. Repair once;
            # completed deliveries are never reset by an identical snapshot retry.
            await self.db.revisions.update_one(
                {
                    "workspace_id": workspace_id,
                    "_id": current["_id"],
                    "delivery_state": {"$exists": False},
                },
                {
                    "$set": {
                        "delivery_state": "pending",
                        "delivery_after": datetime.now(UTC),
                        "actor_type": actor_type,
                        "actor_id": actor_id,
                    }
                },
                session=session,
            )
            return current, False
        doc = {
            "_id": revision_id,
            "workspace_id": workspace_id,
            "page_id": page_id,
            "snapshot_key": snapshot_key,
            "full_page_hash": full_page_hash,
            "captured_at": datetime.now(UTC),
            # Current identity is the page's transactional pointer. Keep this legacy
            # index flag false: reusing a unique index key inside one transaction
            # is not safe across Mongo versions. Existing flags/indexes are retained.
            "is_current": False,
            "delivery_state": "pending",
            "delivery_after": datetime.now(UTC),
            "actor_type": actor_type,
            "actor_id": actor_id,
            # A team member or the dashboard canvas captured it (not an outside
            # reviewer) - recovery_engine trusts drastic page changes only from these.
            "trusted_capture": trusted_capture,
        }
        if current is None:
            doc["previous_revision_id"] = None
        elif current.get("snapshot_key"):
            doc["previous_revision_id"] = str(current["_id"])
        await self.db.revisions.insert_one(doc, session=session)
        return {**doc, "is_current": True}, True

    async def due_deliveries(self, *, limit: int = 100) -> list[dict[str, Any]]:
        cursor = (
            # workspace-scope-exempt: maintenance discovery only. Each selected row
            # carries its workspace; claim/finish scope every mutation by that workspace.
            self.db.revisions.find(
                {
                    "delivery_state": {"$in": ["pending", "processing"]},
                    "delivery_after": {"$lte": datetime.now(UTC)},
                }
            )
            .sort("delivery_after", 1)
            .limit(limit)
        )
        return [doc async for doc in cursor]

    async def claim_delivery(self, workspace_id: str, revision_id: str) -> dict[str, Any] | None:
        now = datetime.now(UTC)
        return await self.db.revisions.find_one_and_update(
            {
                "workspace_id": workspace_id,
                "_id": to_object_id(revision_id),
                "delivery_state": {"$in": ["pending", "processing"]},
                "delivery_after": {"$lte": now},
            },
            {
                "$set": {
                    "delivery_state": "processing",
                    "delivery_after": now + timedelta(minutes=10),
                }
            },
            return_document=ReturnDocument.AFTER,
        )

    async def finish_delivery(
        self,
        workspace_id: str,
        revision_id: str,
        *,
        lease: datetime,
        success: bool,
    ) -> None:
        await self.db.revisions.update_one(
            {
                "workspace_id": workspace_id,
                "_id": to_object_id(revision_id),
                "delivery_state": "processing",
                "delivery_after": lease,
            },
            {
                "$set": {
                    "delivery_state": "done" if success else "pending",
                    "delivery_after": datetime.now(UTC) + timedelta(minutes=1),
                }
            },
        )
