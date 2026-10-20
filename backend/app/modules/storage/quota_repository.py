"""Workspace-scoped object reservations; byte usage follows object lifetime."""

import hashlib
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.core.config import get_settings


def object_id(key: str) -> str:
    return hashlib.sha256(f"{get_settings().r2_bucket_name}:{key}".encode()).hexdigest()


class StorageQuotaRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def find(
        self, workspace_id: str, key: str, *, session: AsyncIOMotorClientSession | None = None
    ) -> dict[str, Any] | None:
        return await self.db.storage_objects.find_one(
            {"_id": object_id(key), "workspace_id": workspace_id}, session=session
        )

    async def usage(
        self, workspace_id: str, *, session: AsyncIOMotorClientSession | None = None
    ) -> int:
        rows = await self.db.storage_objects.aggregate(
            [
                {
                    "$match": {
                        "workspace_id": workspace_id,
                        "bucket": get_settings().r2_bucket_name,
                        "state": {"$in": ["reserved", "stored"]},
                    }
                },
                {"$group": {"_id": None, "bytes": {"$sum": "$byte_size"}}},
            ],
            session=session,
        ).to_list(1)
        return int(rows[0]["bytes"]) if rows else 0

    async def reserve(
        self,
        *,
        workspace_id: str,
        project_id: str,
        key: str,
        size: int,
        verify_after: datetime,
        session: AsyncIOMotorClientSession,
        release_missing: bool = True,
    ) -> None:
        await self.db.storage_objects.update_one(
            {"_id": object_id(key), "workspace_id": workspace_id},
            {
                "$set": {
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                    "key": key,
                    "bucket": get_settings().r2_bucket_name,
                    "byte_size": size,
                    "state": "reserved",
                    "verify_after": verify_after,
                    "reservation_token": uuid4().hex,
                    "release_missing": release_missing,
                    "updated_at": datetime.now(UTC),
                }
            },
            upsert=True,
            session=session,
        )

    async def mark_stored(
        self, workspace_id: str, key: str, actual_size: int, *, token: str | None = None
    ) -> None:
        await self.db.storage_objects.update_one(
            {
                "_id": object_id(key),
                "workspace_id": workspace_id,
                "state": {"$in": ["reserved", "stored"]},
                **({"reservation_token": token} if token else {}),
            },
            {
                "$set": {"state": "stored", "updated_at": datetime.now(UTC)},
                "$max": {"byte_size": actual_size},
                "$unset": {"verify_after": ""},
            },
        )

    async def release_deleted(
        self, workspace_id: str, key: str, *, token: str | None = None
    ) -> None:
        await self.db.storage_objects.update_one(
            {
                "_id": object_id(key),
                "workspace_id": workspace_id,
                **({"reservation_token": token, "state": "reserved"} if token else {}),
            },
            {
                "$set": {"state": "deleted", "updated_at": datetime.now(UTC)},
                "$unset": {"verify_after": ""},
            },
        )

    async def due(self, limit: int = 50) -> list[dict[str, Any]]:
        # workspace-scope-exempt: internal reservation scheduler; jobs recheck their
        # workspace-scoped row before HEAD. No tenant content is returned to callers.
        cursor = self.db.storage_objects.find(
            {"state": "reserved", "verify_after": {"$lte": datetime.now(UTC)}},
            {"workspace_id": 1, "key": 1, "verify_after": 1},
        )
        return await cursor.sort("verify_after", 1).limit(limit).to_list(limit)

    async def claim_check(
        self, workspace_id: str, key: str, next_check: datetime
    ) -> dict[str, Any] | None:
        return await self.db.storage_objects.find_one_and_update(
            {
                "_id": object_id(key),
                "workspace_id": workspace_id,
                "state": "reserved",
                "verify_after": {"$lte": datetime.now(UTC)},
            },
            {"$set": {"verify_after": next_check}},
            return_document=ReturnDocument.AFTER,
        )

    async def import_existing(
        self,
        workspace_id: str,
        project_id: str,
        key: str,
        size: int,
        *,
        session: AsyncIOMotorClientSession,
    ) -> None:
        existing = await self.find(workspace_id, key, session=session)
        if existing and existing["state"] in ("reserved", "stored"):
            # Never reduce a live hold from an inventory collected before the lock.
            await self.db.storage_objects.update_one(
                {"_id": existing["_id"], "workspace_id": workspace_id},
                {"$max": {"byte_size": size}},
                session=session,
            )
            return
        await self.reserve(
            workspace_id=workspace_id,
            project_id=project_id,
            key=key,
            size=size,
            verify_after=datetime.now(UTC),
            session=session,
        )
        await self.db.storage_objects.update_one(
            {"_id": object_id(key), "workspace_id": workspace_id},
            {"$set": {"state": "stored"}, "$unset": {"verify_after": ""}},
            session=session,
        )
