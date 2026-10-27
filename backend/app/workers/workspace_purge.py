import logging
from typing import Any

from app.core.db import get_db
from app.modules.workspaces.purge import purge_due_workspaces

logger = logging.getLogger("backline.workspace_purge")


async def purge_closed_workspaces_job(ctx: dict[str, Any]) -> int:
    """Daily: closed workspaces past their 30-day grace period are purged (TDR-0214)."""
    report = await purge_due_workspaces(get_db(), apply=True)
    failed = sum(1 for entry in report if entry.get("error"))
    if report:
        logger.info("Purged %d closed workspace(s), %d failed", len(report) - failed, failed)
    if failed:
        # Failed ones keep purge_failed_at/purge_error and are retried tomorrow.
        logger.error("%d closed workspace(s) could not be purged", failed)
    return len(report) - failed
