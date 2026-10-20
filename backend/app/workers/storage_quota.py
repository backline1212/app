from typing import Any

from app.core.arq_pool import get_arq_pool
from app.core.db import get_db
from app.modules.storage.quota import reconcile_reservation
from app.modules.storage.quota_repository import StorageQuotaRepository


async def reconcile_storage_reservation_job(
    ctx: dict[str, Any], *, workspace_id: str, key: str
) -> None:
    await reconcile_reservation(get_db(), workspace_id=workspace_id, key=key)


async def sweep_storage_reservations_job(ctx: dict[str, Any]) -> int:
    pool = await get_arq_pool()
    queued = 0
    for doc in await StorageQuotaRepository(get_db()).due():
        job = await pool.enqueue_job(
            "reconcile_storage_reservation_job",
            workspace_id=doc["workspace_id"],
            key=doc["key"],
            _job_id=f"storage:{doc['_id']}:{doc['verify_after'].isoformat()}",
        )
        queued += int(job is not None)
    return queued
