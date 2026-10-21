"""Durable, workspace-scoped integration notification intents."""

from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.core.mongo_utils import to_object_id


class IntegrationDispatchRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create_project_updated(
        self,
        *,
        workspace_id: str,
        project_id: str,
        project_name: str,
        integration_ids: list[str],
        session: AsyncIOMotorClientSession,
    ) -> None:
        now = datetime.now(UTC)
        if not integration_ids:
            return
        await self.db.integration_dispatches.insert_many(
            [
                {
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                    "project_name": project_name,
                    "integration_id": integration_id,
                    "event_type": "project.updated",
                    "state": "pending",
                    "after": now,
                    "attempts": 0,
                    "created_at": now,
                }
                for integration_id in integration_ids
            ],
            session=session,
        )

    async def due(self, limit: int = 50) -> list[dict[str, Any]]:
        # workspace-scope-exempt: internal worker sweep discovers only pending rows.
        # Every claim and downstream project/integration lookup is workspace-scoped.
        cursor = self.db.integration_dispatches.find(
            {"state": "pending", "after": {"$lte": datetime.now(UTC)}},
            {"workspace_id": 1, "after": 1},
        ).sort("after", 1)
        return await cursor.limit(limit).to_list(length=limit)

    async def claim(self, *, workspace_id: str, dispatch_id: str) -> dict[str, Any] | None:
        oid = to_object_id(dispatch_id)
        if oid is None:
            return None
        now = datetime.now(UTC)
        return await self.db.integration_dispatches.find_one_and_update(
            {
                "workspace_id": workspace_id,
                "_id": oid,
                "state": "pending",
                "after": {"$lte": now},
            },
            {
                "$set": {"lease": uuid4().hex, "after": now + timedelta(minutes=2)},
                "$inc": {"attempts": 1},
            },
            return_document=ReturnDocument.AFTER,
        )

    async def finish(
        self,
        *,
        workspace_id: str,
        dispatch_id: ObjectId,
        lease: str,
        state: Literal["pending", "sent", "skipped", "failed"],
        after: datetime | None = None,
        error_type: str | None = None,
    ) -> None:
        fields: dict[str, Any] = {"state": state}
        if after is not None:
            fields["after"] = after
        if error_type is not None:
            fields["last_error_type"] = error_type
        if state != "pending":
            fields["finished_at"] = datetime.now(UTC)
        await self.db.integration_dispatches.update_one(
            {
                "workspace_id": workspace_id,
                "_id": dispatch_id,
                "state": "pending",
                "lease": lease,
            },
            {"$set": fields, "$unset": {"lease": ""}},
        )
