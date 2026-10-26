from collections.abc import Sequence
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
            {"$set": {"anchor": anchor, "recovery_status": "ok"}, "$inc": {"revision": 1}},
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
        # Earlier versions of a file don't use up the file limit (TDR-0165).
        return await self.db.project_assets.count_documents(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "archived_at": None,
                "superseded_by": None,
            },
            session=session,
        )

    async def versions(
        self,
        workspace_id: str,
        project_id: str,
        group: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> list[dict[str, Any]]:
        """Every version of one file: the original (whose id names the group) and the
        uploads that replaced it."""
        cursor = self.db.project_assets.find(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "$or": [{"_id": to_object_id(group)}, {"version_group": group}],
            },
            {"version": 1},
            session=session,
        )
        return [doc async for doc in cursor]

    async def mark_superseded(
        self,
        workspace_id: str,
        project_id: str,
        asset_id: str,
        superseded_by: str,
        *,
        session: AsyncIOMotorClientSession,
    ) -> bool:
        """Only the current version can be replaced; False when it already was."""
        result = await self.db.project_assets.update_one(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "_id": to_object_id(asset_id),
                "superseded_by": None,
            },
            {"$set": {"superseded_by": superseded_by}, "$inc": {"revision": 1}},
            session=session,
        )
        return result.modified_count == 1

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
        expected_revision: int | None = None,
    ) -> bool:
        query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "project_id": project_id,
            "_id": to_object_id(asset_id),
        }
        if expected_revision is not None:
            if expected_revision == 0:
                query["$or"] = [{"revision": 0}, {"revision": {"$exists": False}}]
            else:
                query["revision"] = expected_revision
        result = await self.db.project_assets.update_one(
            query,
            {"$set": patch, "$inc": {"revision": 1}},
            session=session,
        )
        return result.matched_count == 1

    async def approval_summary(
        self, workspace_id: str, project_ids: Sequence[str]
    ) -> dict[str, dict[str, int]]:
        """Per project: current files (latest, not archived) and how many are approved."""
        if not project_ids:
            return {}
        rows = await self.db.project_assets.aggregate(
            [
                {
                    "$match": {
                        "workspace_id": workspace_id,
                        "project_id": {"$in": [*project_ids]},
                        "archived_at": None,
                        "superseded_by": None,
                    }
                },
                {
                    "$group": {
                        "_id": "$project_id",
                        "total": {"$sum": 1},
                        "approved": {
                            "$sum": {"$cond": [{"$eq": ["$approval.approved", True]}, 1, 0]}
                        },
                    }
                },
            ]
        ).to_list(length=len(project_ids))
        return {row["_id"]: {"approved": row["approved"], "total": row["total"]} for row in rows}

    async def current_ids(self, workspace_id: str, asset_ids: Sequence[str]) -> set[str]:
        """Which of these files are still the current, non-archived version (a file
        project's card picture is only shown while its file is, TDR-0198)."""
        oids = [oid for oid in map(to_object_id, asset_ids) if oid is not None]
        if not oids:
            return set()
        cursor = self.db.project_assets.find(
            {
                "workspace_id": workspace_id,
                "_id": {"$in": oids},
                "archived_at": None,
                "superseded_by": None,
            },
            {"_id": 1},
        )
        return {str(doc["_id"]) async for doc in cursor}

    async def set_approval(
        self, workspace_id: str, project_id: str, asset_id: str, approval: dict[str, Any] | None
    ) -> bool:
        # Separate from `revision`: signing off must not conflict with a rename in flight.
        result = await self.db.project_assets.update_one(
            {"workspace_id": workspace_id, "project_id": project_id, "_id": to_object_id(asset_id)},
            {"$set": {"approval": approval}},
        )
        return result.matched_count == 1

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
