from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.errors import ValidationError
from app.core.mongo_utils import to_object_id


class DeploySyncRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def project(
        self,
        workspace_id: str,
        project_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, Any] | None:
        return await self.db.projects.find_one(
            {"workspace_id": workspace_id, "_id": to_object_id(project_id)}, session=session
        )

    async def set_config(
        self,
        workspace_id: str,
        project_id: str,
        config: dict[str, Any],
        *,
        session: AsyncIOMotorClientSession,
    ) -> None:
        await self.db.projects.update_one(
            {"workspace_id": workspace_id, "_id": to_object_id(project_id)},
            {"$set": {"deploy_sync": config}},
            session=session,
        )

    async def find(
        self,
        workspace_id: str,
        project_id: str,
        deployment_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, Any] | None:
        return await self.db.deployments.find_one(
            {"workspace_id": workspace_id, "project_id": project_id, "_id": deployment_id},
            session=session,
        )

    async def create(self, doc: dict[str, Any], *, session: AsyncIOMotorClientSession) -> None:
        await self.db.deployments.insert_one(doc, session=session)

    async def cancel_waiting(
        self,
        workspace_id: str,
        project_id: str,
        *,
        session: AsyncIOMotorClientSession,
        status: str = "cancelled",
        reason: str | None = "credential_changed",
    ) -> None:
        await self.db.deployments.update_many(
            {"workspace_id": workspace_id, "project_id": project_id, "status": "awaiting_review"},
            {
                "$set": {
                    "status": status,
                    "cancel_reason": reason if status == "cancelled" else None,
                }
            },
            session=session,
        )

    async def list_history(
        self, workspace_id: str, project_id: str, cursor: str | None
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"workspace_id": workspace_id, "project_id": project_id}
        if cursor:
            previous = await self.find(workspace_id, project_id, cursor)
            if previous is None:
                raise ValidationError(
                    "This deployment history cursor is no longer available. Refresh history."
                )
            query["$or"] = [
                {"received_at": {"$lt": previous["received_at"]}},
                {"received_at": previous["received_at"], "_id": {"$lt": previous["_id"]}},
            ]
        return (
            await self.db.deployments.find(query)
            .sort([("received_at", -1), ("_id", -1)])
            .limit(26)
            .to_list(26)
        )

    async def capture(
        self,
        workspace_id: str,
        project_id: str,
        deployment_id: str,
        *,
        page_id: str,
        revision_id: str,
        session: AsyncIOMotorClientSession,
    ) -> None:
        # Conflicts with hook/rotation writes to the same project document, making
        # selection and capture atomic even though snapshots use a page transaction.
        await self.db.projects.update_one(
            {"workspace_id": workspace_id, "_id": to_object_id(project_id)},
            {"$inc": {"deploy_capture_version": 1}},
            session=session,
        )
        await self.db.deployments.update_one(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "_id": deployment_id,
                "status": "awaiting_review",
            },
            {
                "$set": {
                    "status": "captured",
                    "page_id": page_id,
                    "revision_id": revision_id,
                    "captured_at": datetime.now(UTC),
                }
            },
            session=session,
        )

    async def recovery_states(self, workspace_id: str, revision_ids: list[str]) -> dict[str, str]:
        rows = self.db.revisions.find(
            {
                "workspace_id": workspace_id,
                "_id": {"$in": [to_object_id(value) for value in revision_ids]},
            },
            {"delivery_state": 1},
        )
        return {str(row["_id"]): str(row.get("delivery_state", "unknown")) async for row in rows}
