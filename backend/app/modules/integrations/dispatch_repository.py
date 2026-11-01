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

    async def create_comment_event(
        self,
        *,
        workspace_id: str,
        project_id: str,
        comment_id: str,
        event_type: Literal["comment.created", "comment.status_changed"],
        integration_ids: list[str],
        status: str | None = None,
        session: AsyncIOMotorClientSession,
    ) -> list[dict[str, Any]]:
        """The new rows (id, workspace, `after`) so the caller can queue them as soon as
        its transaction commits."""
        if not integration_ids:
            return []
        # Millisecond precision, as Mongo stores it, so a job id built from `after` here
        # matches the one the sweep builds from the stored row.
        now = datetime.now(UTC).replace(microsecond=datetime.now(UTC).microsecond // 1000 * 1000)
        result = await self.db.integration_dispatches.insert_many(
            [
                {
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                    "comment_id": comment_id,
                    "integration_id": integration_id,
                    "event_type": event_type,
                    **({"status": status} if status is not None else {}),
                    "state": "pending",
                    "after": now,
                    "attempts": 0,
                    "created_at": now,
                }
                for integration_id in integration_ids
            ],
            session=session,
        )
        return [
            {"_id": inserted_id, "workspace_id": workspace_id, "after": now}
            for inserted_id in result.inserted_ids
        ]

    async def due(self, limit: int = 500) -> list[dict[str, Any]]:
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
