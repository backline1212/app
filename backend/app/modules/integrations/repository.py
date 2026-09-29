from datetime import UTC, datetime, timedelta
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

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


class IntegrationLinkRepository:
    """`integration_links` - one row per ticket filed in a tracker from a comment.

    Unique on (workspace_id, comment_id, integration_id). A send first *claims* the row
    (status "pending") and only then calls the tracker, so a double click, two members
    at once or an agent retrying can never file two tickets for one comment: the loser
    of the claim gets the finished link, or a conflict while the winner is still
    filing it. A pending claim older than PENDING_TTL (a crash mid-send) can be taken
    over.
    """

    PENDING_TTL = timedelta(minutes=2)

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def find(
        self, *, workspace_id: str, comment_id: str, integration_id: str
    ) -> dict[str, Any] | None:
        return await self.db.integration_links.find_one(
            {
                "workspace_id": workspace_id,
                "comment_id": comment_id,
                "integration_id": integration_id,
            }
        )

    async def claim(
        self,
        *,
        workspace_id: str,
        comment_id: str,
        integration_id: str,
        type: str,
        created_by: str,
    ) -> tuple[dict[str, Any], bool]:
        """(row, claimed). claimed=False means another send owns or finished it."""
        now = datetime.now(UTC)
        doc: dict[str, Any] = {
            "workspace_id": workspace_id,
            "comment_id": comment_id,
            "integration_id": integration_id,
            "type": type,
            "status": "pending",
            "external_id": None,
            "url": None,
            "created_by": created_by,
            "created_at": now,
        }
        try:
            result = await self.db.integration_links.insert_one(doc)
        except DuplicateKeyError:
            existing = await self.find(
                workspace_id=workspace_id, comment_id=comment_id, integration_id=integration_id
            )
            if existing is None:
                raise
            if (
                existing.get("status") == "pending"
                and existing["created_at"].replace(tzinfo=UTC) < now - self.PENDING_TTL
            ):
                taken = await self.db.integration_links.find_one_and_update(
                    {
                        "workspace_id": workspace_id,
                        "_id": existing["_id"],
                        "status": "pending",
                        "created_at": existing["created_at"],
                    },
                    {"$set": {"created_at": now, "created_by": created_by}},
                    return_document=ReturnDocument.AFTER,
                )
                if taken is not None:
                    return taken, True
            return existing, False
        doc["_id"] = result.inserted_id
        return doc, True

    async def complete(
        self, *, workspace_id: str, link_id: ObjectId, external_id: str, url: str
    ) -> dict[str, Any] | None:
        return await self.db.integration_links.find_one_and_update(
            {"workspace_id": workspace_id, "_id": link_id},
            {"$set": {"status": "done", "external_id": external_id, "url": url}},
            return_document=ReturnDocument.AFTER,
        )

    async def release(self, *, workspace_id: str, link_id: ObjectId) -> None:
        await self.db.integration_links.delete_one(
            {"workspace_id": workspace_id, "_id": link_id, "status": "pending"}
        )

    async def list_for_comment(self, *, workspace_id: str, comment_id: str) -> list[dict[str, Any]]:
        cursor = self.db.integration_links.find(
            {"workspace_id": workspace_id, "comment_id": comment_id, "status": "done"}
        ).sort("created_at", 1)
        return [doc async for doc in cursor]
