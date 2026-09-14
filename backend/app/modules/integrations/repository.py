from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id


class IntegrationRepository:
    """`integrations` - 11-Database.md §11.12."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        workspace_id: str,
        type: str,
        config_json: dict[str, Any],
        connected_by: str,
        project_scope: str | None = None,
    ) -> dict[str, Any]:
        doc = {
            "workspace_id": workspace_id,
            "type": type,
            "config_json": config_json,
            "project_scope": project_scope,
            "connected_by": connected_by,
            "created_at": datetime.now(UTC),
        }
        result = await self.db.integrations.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_id(self, integration_id: str) -> dict[str, Any] | None:
        oid = to_object_id(integration_id)
        if oid is None:
            return None
        # workspace-scope-exempt: single-document lookup by its own unique _id; every
        # caller (integrations/service.py) checks doc["workspace_id"] before acting.
        return await self.db.integrations.find_one({"_id": oid})

    async def list_for_workspace(self, workspace_id: str) -> list[dict[str, Any]]:
        cursor = self.db.integrations.find({"workspace_id": workspace_id})
        return [doc async for doc in cursor]

    async def list_for_workspace_by_type(
        self, workspace_id: str, type: str
    ) -> list[dict[str, Any]]:
        cursor = self.db.integrations.find({"workspace_id": workspace_id, "type": type})
        return [doc async for doc in cursor]

    async def delete(self, integration_id: str) -> None:
        # workspace-scope-exempt: disconnect_integration already verified
        # doc["workspace_id"] == workspace_id via find_by_id before calling this.
        await self.db.integrations.delete_one({"_id": to_object_id(integration_id)})

    async def update_config(self, integration_id: str, config_json: dict[str, Any]) -> None:
        """Jira rotates its OAuth refresh_token on every use (unlike Asana/ClickUp,
        whose refresh/access tokens are stable) - without persisting the new one here,
        the second create-issue call after a connect would fail with an invalidated
        refresh_token."""
        # workspace-scope-exempt: callers already verified doc["workspace_id"] ==
        # workspace_id via find_by_id before calling this.
        await self.db.integrations.update_one(
            {"_id": to_object_id(integration_id)}, {"$set": {"config_json": config_json}}
        )
