from typing import Any

from arq.worker import Retry

from app.core.db import get_db
from app.modules.projects.deletion_service import resume_confirmed_hard_delete
from app.modules.storage.gc import run_object_gc
from app.modules.storage.repository import ObjectGcRepository


async def resume_project_hard_delete_job(
    ctx: dict[str, Any],
    *,
    workspace_id: str,
    project_id: str,
    correlation_id: str,
) -> None:
    """Retry from durable tombstones; all storage/Mongo/event operations are idempotent."""
    del ctx
    await resume_confirmed_hard_delete(
        get_db(),
        workspace_id=workspace_id,
        project_id=project_id,
        correlation_id=correlation_id,
    )


async def resume_project_transfer_cleanup_job(
    ctx: dict[str, Any],
    *,
    workspace_id: str,
    project_id: str,
    correlation_id: str,
) -> None:
    """Deletes the old copies of a moved project's files that the request couldn't."""
    counts = await run_object_gc(
        get_db(), workspace_id=workspace_id, project_id=project_id, correlation_id=correlation_id
    )
    if any(counts.get(state, 0) for state in ("pending", "deleting", "failed")):
        raise Retry(defer=60 * ctx.get("job_try", 1))


async def sweep_transfer_cleanups_job(ctx: dict[str, Any]) -> int:
    """Finishes old-file removal whose follow-up job was never queued or gave up."""
    del ctx
    db = get_db()
    pending = await ObjectGcRepository(db).unfinished_transfers()
    for cleanup in pending:
        await run_object_gc(db, **cleanup)
    return len(pending)
