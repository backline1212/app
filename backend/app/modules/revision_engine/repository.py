from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.modules.revision_engine.diff import DiffResult


class RevisionDiffRepository:
    """`revision_diffs` - 11-Database.md §11.9."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        page_id: str,
        workspace_id: str,
        from_revision_id: str,
        to_revision_id: str,
        diff: DiffResult,
    ) -> dict[str, Any]:
        doc = {
            "page_id": page_id,
            "workspace_id": workspace_id,
            "from_revision_id": from_revision_id,
            "to_revision_id": to_revision_id,
            "moved_node_ids": diff.moved,
            "modified_node_ids": diff.modified,
            "removed_node_ids": diff.removed,
            "added_node_ids": diff.added,
            "created_at": datetime.now(UTC),
        }
        try:
            result = await self.db.revision_diffs.insert_one(doc)
        except DuplicateKeyError:
            # revision_diffs_page_to_revision_unique caught a race that slipped past the
            # find_by_to_revision check in recovery_engine/service.py - fall back to
            # whatever the other writer just inserted rather than erroring.
            existing = await self.find_by_to_revision(workspace_id, page_id, to_revision_id)
            assert existing is not None
            return existing
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_to_revision(
        self, workspace_id: str, page_id: str, to_revision_id: str
    ) -> dict[str, Any] | None:
        """Idempotency guard for run_recovery_pipeline: an Arq job retry/redelivery for
        the same (page_id, revision_id) must not recompute the diff or re-run comment
        recovery a second time - see the check in recovery_engine/service.py."""
        return await self.db.revision_diffs.find_one(
            {"workspace_id": workspace_id, "page_id": page_id, "to_revision_id": to_revision_id}
        )

    async def summaries_for_revisions(
        self, workspace_id: str, revision_ids: list[str]
    ) -> dict[str, dict[str, int]]:
        if not revision_ids:
            return {}
        docs = await self.db.revision_diffs.find(
            {"workspace_id": workspace_id, "to_revision_id": {"$in": revision_ids}}
        ).to_list(length=None)
        return {
            str(doc["to_revision_id"]): {
                "moved": len(doc.get("moved_node_ids", [])),
                "modified": len(doc.get("modified_node_ids", [])),
                "removed": len(doc.get("removed_node_ids", [])),
                "added": len(doc.get("added_node_ids", [])),
            }
            for doc in docs
        }
