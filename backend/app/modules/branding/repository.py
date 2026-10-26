from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.errors import ConflictError
from app.core.mongo_utils import to_object_id

PENDING_CLAIM_TTL = timedelta(days=7)


class CustomDomainRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def list_for_workspace(self, workspace_id: str) -> list[dict[str, Any]]:
        cursor = self.db.custom_domains.find({"workspace_id": workspace_id}).sort("created_at", 1)
        return [doc async for doc in cursor]

    async def find(self, workspace_id: str, domain_id: str) -> dict[str, Any] | None:
        oid = to_object_id(domain_id)
        if oid is None:
            return None
        return await self.db.custom_domains.find_one({"workspace_id": workspace_id, "_id": oid})

    async def find_verified_by_host(self, host: str) -> dict[str, Any] | None:
        # workspace-scope-exempt: a public host lookup; returns only that host's own row
        return await self.db.custom_domains.find_one({"host": host, "status": "verified"})

    async def create(
        self, workspace_id: str, host: str, token: str, actor_id: str
    ) -> dict[str, Any]:
        doc: dict[str, Any] = {
            "_id": ObjectId(),
            "workspace_id": workspace_id,
            "host": host,
            "verification_token": token,
            "status": "pending",
            "connected": False,
            "last_error": None,
            "verified_at": None,
            "created_by": actor_id,
            "created_at": datetime.now(UTC),
        }
        # An unverified claim can't hold a domain for ever: after a week another workspace
        # (normally the domain's real owner) may take it over (TDR-0201).
        # workspace-scope-exempt: the host is globally unique; only a stale unverified
        # claim on it is removed, never a verified one
        await self.db.custom_domains.delete_one(
            {
                "host": host,
                "status": {"$ne": "verified"},
                "workspace_id": {"$ne": workspace_id},
                "created_at": {"$lt": datetime.now(UTC) - PENDING_CLAIM_TTL},
            }
        )
        try:
            await self.db.custom_domains.insert_one(doc)
        except DuplicateKeyError as exc:
            raise ConflictError(
                "That domain is already added to a Backline workspace. An unverified claim "
                "is released 7 days after it was made."
            ) from exc
        return doc

    async def update(self, workspace_id: str, domain_id: str, patch: dict[str, Any]) -> None:
        oid = to_object_id(domain_id)
        if oid is None:
            return
        await self.db.custom_domains.update_one(
            {"workspace_id": workspace_id, "_id": oid}, {"$set": patch}
        )

    async def delete(self, workspace_id: str, domain_id: str) -> bool:
        oid = to_object_id(domain_id)
        if oid is None:
            return False
        result = await self.db.custom_domains.delete_one({"workspace_id": workspace_id, "_id": oid})
        return result.deleted_count == 1
