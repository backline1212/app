from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id


class NotificationRepository:
    """`notifications` - not given an explicit shape in 11-Database.md (§17.8 names the
    collection but never its fields); shape and indexes documented in
    docs/tdr/0009-notifications-integrations-scope-and-design.md."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        workspace_id: str,
        user_id: str,
        type: str,
        payload_json: dict[str, Any],
        target_route: str | None = None,
    ) -> dict[str, Any]:
        doc = {
            "workspace_id": workspace_id,
            "user_id": user_id,
            "type": type,
            "payload_json": payload_json,
            "target_route": target_route,
            "read_at": None,
            "created_at": datetime.now(UTC),
        }
        result = await self.db.notifications.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def list_for_user(
        self,
        *,
        workspace_id: str,
        user_id: str,
        limit: int,
        before: datetime | None,
        visible_project_ids: list[str],
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "user_id": user_id,
            "payload_json.project_id": {"$in": [None, *visible_project_ids]},
        }
        if before is not None:
            query["created_at"] = {"$lt": before}
        cursor = self.db.notifications.find(query).sort("created_at", -1).limit(limit)
        return [doc async for doc in cursor]

    async def count_unread(
        self, *, workspace_id: str, user_id: str, visible_project_ids: list[str]
    ) -> int:
        return await self.db.notifications.count_documents(
            {
                "workspace_id": workspace_id,
                "user_id": user_id,
                "read_at": None,
                "payload_json.project_id": {"$in": [None, *visible_project_ids]},
            }
        )

    async def mark_read(self, notification_id: str, *, workspace_id: str, user_id: str) -> None:
        await self.db.notifications.update_one(
            {
                "_id": to_object_id(notification_id),
                "workspace_id": workspace_id,
                "user_id": user_id,
            },
            {"$set": {"read_at": datetime.now(UTC)}},
        )

    async def mark_all_read(self, *, workspace_id: str, user_id: str) -> None:
        await self.db.notifications.update_many(
            {"workspace_id": workspace_id, "user_id": user_id, "read_at": None},
            {"$set": {"read_at": datetime.now(UTC)}},
        )
