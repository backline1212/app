from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase


class RecoveryLogRepository:
    """`recovery_logs` - 11-Database.md §11.11."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        comment_id: str,
        workspace_id: str,
        from_revision_id: str,
        to_revision_id: str,
        strategy_used: str,
        confidence: float,
        candidates_considered: int,
        outcome: str,
    ) -> dict[str, Any]:
        doc = {
            "comment_id": comment_id,
            "workspace_id": workspace_id,
            "from_revision_id": from_revision_id,
            "to_revision_id": to_revision_id,
            "strategy_used": strategy_used,
            "confidence": confidence,
            "candidates_considered": candidates_considered,
            "outcome": outcome,
            "created_at": datetime.now(UTC),
        }
        result = await self.db.recovery_logs.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def comment_ids_processed_for_revision(
        self, *, workspace_id: str, to_revision_id: str
    ) -> set[str]:
        """Retry-idempotency support for run_recovery_pipeline, at comment granularity
        rather than whole-job granularity: a comment_id that already has a log row for
        this exact to_revision_id was already fully processed (status updated + logged
        + broadcast) by a prior attempt at this same job, so a retry must skip it
        rather than re-run it and double-count consecutive_orphaned_revisions."""
        cursor = self.db.recovery_logs.find(
            {"workspace_id": workspace_id, "to_revision_id": to_revision_id},
            projection={"comment_id": 1},
        )
        return {doc["comment_id"] async for doc in cursor}

    async def list_for_comment(
        self, *, workspace_id: str, comment_id: str, limit: int = 100
    ) -> list[dict[str, Any]]:
        cursor = (
            self.db.recovery_logs.find({"workspace_id": workspace_id, "comment_id": comment_id})
            .sort("created_at", -1)
            .limit(limit)
        )
        return [doc async for doc in cursor]

    async def summaries_for_revisions(
        self, workspace_id: str, revision_ids: list[str]
    ) -> dict[str, dict[str, int]]:
        if not revision_ids:
            return {}
        rows = await self.db.recovery_logs.aggregate(
            [
                {
                    "$match": {
                        "workspace_id": workspace_id,
                        "to_revision_id": {"$in": revision_ids},
                    }
                },
                {
                    "$group": {
                        "_id": {"revision_id": "$to_revision_id", "outcome": "$outcome"},
                        "count": {"$sum": 1},
                    }
                },
            ]
        ).to_list(length=None)
        summaries: dict[str, dict[str, int]] = {}
        for row in rows:
            revision_id = str(row["_id"]["revision_id"])
            summaries.setdefault(revision_id, {})[str(row["_id"]["outcome"])] = int(row["count"])
        return summaries
