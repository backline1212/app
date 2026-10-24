from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.core.mongo_utils import to_object_id


class PageRepository:
    """`pages` - 11-Database.md §11.7."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def find_in_workspace(self, workspace_id: str, page_id: str) -> dict[str, Any] | None:
        oid = to_object_id(page_id)
        if oid is None:
            return None
        return await self.db.pages.find_one({"workspace_id": workspace_id, "_id": oid})

    async def set_approval(
        self,
        workspace_id: str,
        page_id: str,
        revision_id: str | None,
        expected_updated_at: datetime | None,
        approval: dict[str, Any],
    ) -> dict[str, Any] | None:
        return await self.db.pages.find_one_and_update(
            {
                "workspace_id": workspace_id,
                "_id": to_object_id(page_id),
                "latest_revision_id": revision_id,
                "approval.updated_at": expected_updated_at,
            },
            {"$set": {"approval": approval}},
            return_document=ReturnDocument.AFTER,
        )

    async def find_by_normalized_url(
        self, workspace_id: str, project_id: str, url_normalized: str
    ) -> dict[str, Any] | None:
        return await self.db.pages.find_one(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "url_normalized": url_normalized,
            }
        )

    async def find_by_id(self, page_id: str) -> dict[str, Any] | None:
        oid = to_object_id(page_id)
        if oid is None:
            return None
        # workspace-scope-exempt: single-document lookup by its own unique _id; every
        # caller checks doc["workspace_id"]/doc["project_id"] against the caller's
        # context before acting (e.g. _resolve_page_and_access in comments/service.py).
        return await self.db.pages.find_one({"_id": oid})

    async def create(
        self,
        *,
        project_id: str,
        workspace_id: str,
        url_normalized: str,
        title: str | None,
        sort_order: int = 0,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "project_id": project_id,
            "workspace_id": workspace_id,
            "url_normalized": url_normalized,
            "title": title,
            "sort_order": sort_order,
            "first_seen_at": now,
            "latest_revision_id": None,
        }
        result = await self.db.pages.insert_one(doc, session=session)
        doc["_id"] = result.inserted_id
        return doc

    async def project_ids_for(self, workspace_id: str, page_ids: list[str]) -> dict[str, str]:
        """page_id -> project_id for several pages at once (the activity feed's
        visibility filter, dashboard/service.py)."""
        oids = [oid for oid in map(to_object_id, page_ids) if oid is not None]
        if not oids:
            return {}
        cursor = self.db.pages.find(
            {"workspace_id": workspace_id, "_id": {"$in": oids}}, {"project_id": 1}
        )
        return {str(doc["_id"]): doc["project_id"] async for doc in cursor}

    async def list_for_project(self, workspace_id: str, project_id: str) -> list[dict[str, Any]]:
        cursor = self.db.pages.find({"workspace_id": workspace_id, "project_id": project_id}).sort(
            "first_seen_at", -1
        )
        return [doc async for doc in cursor]

    async def comment_counts(self, workspace_id: str, page_ids: list[str]) -> dict[str, int]:
        if not page_ids:
            return {}
        rows = await self.db.comments.aggregate(
            [
                # Threads only, and not deleted ones - the same count every list shows.
                {
                    "$match": {
                        "workspace_id": workspace_id,
                        "page_id": {"$in": page_ids},
                        "parent_id": None,
                        "deleted_at": None,
                    }
                },
                {"$group": {"_id": "$page_id", "count": {"$sum": 1}}},
            ]
        ).to_list(length=None)
        return {str(row["_id"]): int(row["count"]) for row in rows}

    async def update_latest_revision(
        self,
        workspace_id: str,
        page_id: str,
        revision_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> None:
        result = await self.db.pages.update_one(
            {"_id": to_object_id(page_id), "workspace_id": workspace_id},
            {"$set": {"latest_revision_id": revision_id}},
            session=session,
        )
        if result.matched_count == 0:
            from app.core.errors import NotFoundError

            raise NotFoundError("Page no longer exists.")

    async def update(
        self,
        workspace_id: str,
        page_id: str,
        patch: dict[str, Any],
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> None:
        if not patch:
            return
        await self.db.pages.update_one(
            {"_id": to_object_id(page_id), "workspace_id": workspace_id},
            {"$set": patch},
            session=session,
        )

    async def reorder(self, workspace_id: str, project_id: str, page_ids: list[str]) -> None:
        for sort_order, page_id in enumerate(page_ids):
            await self.db.pages.update_one(
                {
                    "_id": to_object_id(page_id),
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                },
                {"$set": {"sort_order": sort_order}},
            )

    async def mark_referenced(
        self,
        workspace_id: str,
        page_id: str,
        *,
        session: AsyncIOMotorClientSession,
    ) -> bool:
        """Writes the page inside the caller's transaction before it adds something that
        points at the page. delete_page's transaction also writes (deletes) this
        document, so the two conflict and one retries: a comment can no longer land on
        a page deleted as "empty" in the same instant. False when the page is gone."""
        result = await self.db.pages.update_one(
            {"_id": to_object_id(page_id), "workspace_id": workspace_id},
            {"$set": {"last_referenced_at": datetime.now(UTC)}},
            session=session,
        )
        return result.matched_count == 1

    async def reference_counts(
        self,
        workspace_id: str,
        page_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> dict[str, int]:
        query = {"workspace_id": workspace_id, "page_id": page_id}
        return {
            "comments": await self.db.comments.count_documents(query, session=session),
            "revisions": await self.db.revisions.count_documents(query, session=session),
            "revision_diffs": await self.db.revision_diffs.count_documents(query, session=session),
            "project_assets": await self.db.project_assets.count_documents(query, session=session),
        }

    async def delete(
        self,
        workspace_id: str,
        page_id: str,
        *,
        session: AsyncIOMotorClientSession | None = None,
    ) -> None:
        await self.db.pages.delete_one(
            {"_id": to_object_id(page_id), "workspace_id": workspace_id}, session=session
        )
