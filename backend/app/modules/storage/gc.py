from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.modules.storage.quota_repository import StorageQuotaRepository
from app.modules.storage.r2_client import delete_object
from app.modules.storage.repository import ObjectGcRepository


async def run_object_gc(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    correlation_id: str,
) -> dict[str, int]:
    """Process every tombstone once per run; failed rows remain retryable."""
    repo = ObjectGcRepository(db)
    eligible_before = datetime.now(UTC)
    while tombstone := await repo.claim_next(
        workspace_id,
        project_id,
        correlation_id,
        eligible_before=eligible_before,
    ):
        try:
            await delete_object(tombstone["key"])
            await StorageQuotaRepository(db).release_deleted(workspace_id, tombstone["key"])
        except Exception as exc:
            await repo.mark_failed(
                tombstone["workspace_id"],
                tombstone["_id"],
                f"{type(exc).__name__}: {exc}",
            )
        else:
            await repo.mark_deleted(tombstone["workspace_id"], tombstone["_id"])
    return await repo.counts(workspace_id, project_id, correlation_id)
