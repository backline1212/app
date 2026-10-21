from datetime import UTC, datetime, timedelta
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.core.config import get_settings
from app.core.errors import ConflictError


class UploadRepository:
    """Issued upload references. Object keys are unique, workspace-scoped IDs."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        key: str,
        workspace_id: str,
        project_id: str,
        actor_type: str,
        actor_id: str,
        content_type: str,
        content_length: int,
    ) -> None:
        record = {
            "_id": key,
            "workspace_id": workspace_id,
            "project_id": project_id,
            "actor_type": actor_type,
            "actor_id": actor_id,
            "content_type": content_type,
            "content_length": content_length,
            "created_at": datetime.now(UTC),
        }
        try:
            await self.db.uploads.insert_one(record)
        except DuplicateKeyError:
            existing = await self.find(workspace_id, project_id, key)
            if existing is None or any(
                existing.get(field) != record[field]
                for field in ("actor_type", "actor_id", "content_type", "content_length")
            ):
                raise ConflictError("This upload key already names different content.") from None

    async def find(self, workspace_id: str, project_id: str, key: str) -> dict[str, Any] | None:
        return await self.db.uploads.find_one(
            {
                "_id": key,
                "workspace_id": workspace_id,
                "project_id": project_id,
            }
        )


class ObjectGcRepository:
    """Durable, retry-safe object deletion tombstones."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def prepare(
        self,
        *,
        workspace_id: str,
        project_id: str,
        correlation_id: str,
        keys: list[str],
    ) -> None:
        now = datetime.now(UTC)
        bucket = get_settings().r2_bucket_name
        for key in keys:
            await self.db.object_gc_tombstones.update_one(
                {"workspace_id": workspace_id, "bucket": bucket, "key": key},
                {
                    "$setOnInsert": {
                        "workspace_id": workspace_id,
                        "project_id": project_id,
                        "correlation_id": correlation_id,
                        "bucket": bucket,
                        "key": key,
                        "status": "pending",
                        "attempts": 0,
                        "last_error": None,
                        "created_at": now,
                        "updated_at": now,
                        "deleted_at": None,
                    }
                },
                upsert=True,
            )

    async def claim_next(
        self,
        workspace_id: str,
        project_id: str,
        correlation_id: str,
        *,
        eligible_before: datetime,
    ) -> dict[str, Any] | None:
        now = datetime.now(UTC)
        return await self.db.object_gc_tombstones.find_one_and_update(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "correlation_id": correlation_id,
                "$or": [
                    {
                        "status": {"$in": ["pending", "failed"]},
                        "updated_at": {"$lte": eligible_before},
                    },
                    {
                        "status": "deleting",
                        "updated_at": {"$lt": eligible_before - timedelta(minutes=5)},
                    },
                ],
            },
            {
                "$set": {"status": "deleting", "updated_at": now},
                "$inc": {"attempts": 1},
            },
            sort=[("created_at", 1), ("_id", 1)],
            return_document=ReturnDocument.AFTER,
        )

    async def mark_deleted(self, workspace_id: str, tombstone_id: Any) -> None:
        now = datetime.now(UTC)
        await self.db.object_gc_tombstones.update_one(
            {"_id": tombstone_id, "workspace_id": workspace_id},
            {
                "$set": {
                    "status": "deleted",
                    "last_error": None,
                    "updated_at": now,
                    "deleted_at": now,
                }
            },
        )

    async def mark_failed(self, workspace_id: str, tombstone_id: Any, error: str) -> None:
        await self.db.object_gc_tombstones.update_one(
            {"_id": tombstone_id, "workspace_id": workspace_id},
            {
                "$set": {
                    "status": "failed",
                    "last_error": error[:500],
                    "updated_at": datetime.now(UTC),
                }
            },
        )

    async def counts(
        self, workspace_id: str, project_id: str, correlation_id: str
    ) -> dict[str, int]:
        rows = await self.db.object_gc_tombstones.aggregate(
            [
                {
                    "$match": {
                        "workspace_id": workspace_id,
                        "project_id": project_id,
                        "correlation_id": correlation_id,
                    }
                },
                {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            ]
        ).to_list(length=None)
        return {str(row["_id"]): int(row["count"]) for row in rows}
