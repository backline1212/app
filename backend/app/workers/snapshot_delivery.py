from typing import Any

from app.core.db import get_db
from app.modules.snapshot_engine.delivery import deliver_revision, sweep_deliveries


async def deliver_snapshot_revision_job(
    ctx: dict[str, Any],
    *,
    workspace_id: str,
    revision_id: str,
) -> None:
    await deliver_revision(get_db(), workspace_id=workspace_id, revision_id=revision_id)


async def sweep_snapshot_deliveries_job(ctx: dict[str, Any]) -> int:
    return await sweep_deliveries(get_db())
