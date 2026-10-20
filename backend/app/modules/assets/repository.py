from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id


class AssetRepository:
    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def find_by_request(
        self,
        workspace_id: str,
        request_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, Any] | None:
        return await self.db.project_assets.find_one(
            {"workspace_id": workspace_id, "client_request_id": request_id}, session=session
        )

    async def move_comment(
        self,
        workspace_id: str,
        page_id: str,
        asset_id: str,
        comment_id: str,
        anchor: dict[str, Any],
    ) -> bool:
        result = await self.db.comments.update_one(
            {
                "workspace_id": workspace_id,
                "page_id": page_id,
                "_id": to_object_id(comment_id),
                "parent_id": None,
                "deleted_at": None,
                "anchor.kind": "asset",
                "anchor.asset_id": asset_id,
            },
            {"$set": {"anchor": anchor, "recovery_status": "ok"}},
        )
        return bool(result.matched_count)

    async def create(
        self, doc: dict[str, Any], *, session: AsyncIOMotorClientSession | None = None
    ) -> dict[str, Any]:
        result = await self.db.project_assets.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return doc

    async def count(
        self,
        workspace_id: str,
        project_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> int:
        return await self.db.project_assets.count_documents(
            {"workspace_id": workspace_id, "project_id": project_id, "archived_at": None},
            session=session,
        )

    async def list(
        self, workspace_id: str, project_id: str, *, include_archived: bool = False
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"workspace_id": workspace_id, "project_id": project_id}
        if not include_archived:
            query["archived_at"] = None
        return [
            doc
            async for doc in self.db.project_assets.find(query).sort(
                [("created_at", 1), ("_id", 1)]
            )
        ]

    async def serialize_changes(
        self, workspace_id: str, project_id: str, session: AsyncIOMotorClientSession
    ) -> None:
        """A shared transaction write prevents concurrent uploads/restores from
        both passing a snapshot count and exceeding the active file limit."""
        from app.core.errors import NotFoundError

        result = await self.db.projects.update_one(
            {"_id": to_object_id(project_id), "workspace_id": workspace_id, "archived_at": None},
            {"$inc": {"asset_write_version": 1}},
            session=session,
        )
        if not result.matched_count:
            raise NotFoundError("Active project not found.")

    async def update(
        self,
        workspace_id: str,
        project_id: str,
        asset_id: str,
        patch: dict[str, Any],
        *,
        session: AsyncIOMotorClientSession,
    ) -> None:
        await self.db.project_assets.update_one(
            {"workspace_id": workspace_id, "project_id": project_id, "_id": to_object_id(asset_id)},
            {"$set": patch},
            session=session,
        )

    async def find(
        self,
        workspace_id: str,
        project_id: str,
        asset_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, Any] | None:
        return await self.db.project_assets.find_one(
            {"workspace_id": workspace_id, "project_id": project_id, "_id": to_object_id(asset_id)},
            session=session,
        )
