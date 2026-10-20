from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

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
        email_pending: bool = False,
    ) -> dict[str, Any]:
        doc: dict[str, Any] = {
            "workspace_id": workspace_id,
            "user_id": user_id,
            "type": type,
            "payload_json": payload_json,
            "target_route": target_route,
            "read_at": None,
            "created_at": datetime.now(UTC),
        }
        if email_pending:
            doc.update(
                {
                    "email_state": "pending",
                    "email_after": datetime.now(UTC),
                    "email_expires_at": datetime.now(UTC) + timedelta(hours=24),
                    "email_attempts": 0,
                }
            )
        result = await self.db.notifications.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def due_email_deliveries(self, limit: int = 50) -> list[dict[str, Any]]:
        # workspace-scope-exempt: internal worker sweep of opted-in outbox rows only;
        # each claim and delivery uses the row's workspace and rechecks recipient access.
        cursor = self.db.notifications.find(
            {"email_state": "pending", "email_after": {"$lte": datetime.now(UTC)}},
            {"workspace_id": 1, "email_after": 1},
        )
        return await cursor.sort("email_after", 1).limit(limit).to_list(length=limit)

    async def claim_email(self, workspace_id: str, notification_id: str) -> dict[str, Any] | None:
        return await self.db.notifications.find_one_and_update(
            {
                "workspace_id": workspace_id,
                "_id": to_object_id(notification_id),
                "email_state": "pending",
                "email_after": {"$lte": datetime.now(UTC)},
            },
            {
                "$set": {
                    "email_after": datetime.now(UTC) + timedelta(minutes=2),
                    "email_lease": uuid4().hex,
                },
                "$inc": {"email_attempts": 1},
            },
            return_document=ReturnDocument.AFTER,
        )

    async def finish_email(
        self,
        workspace_id: str,
        notification_id: str,
        *,
        lease: str,
        state: Literal["sent", "skipped", "failed", "pending"],
        retry_after: datetime | None = None,
    ) -> None:
        fields: dict[str, Any] = {"email_state": state}
        if retry_after is not None:
            fields["email_after"] = retry_after
        else:
            fields["email_finished_at"] = datetime.now(UTC)
        await self.db.notifications.update_one(
            {
                "workspace_id": workspace_id,
                "_id": to_object_id(notification_id),
                "email_state": "pending",
                "email_lease": lease,
            },
            {"$set": fields, "$unset": {"email_lease": ""}},
        )

    async def prepare_email(
        self,
        workspace_id: str,
        notification_id: str,
        *,
        lease: str,
        envelope: dict[str, str],
    ) -> bool:
        result = await self.db.notifications.update_one(
            {
                "workspace_id": workspace_id,
                "_id": to_object_id(notification_id),
                "email_state": "pending",
                "email_lease": lease,
            },
            {"$set": {"email_envelope": envelope}},
        )
        return result.matched_count == 1

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
