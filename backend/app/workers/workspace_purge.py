import logging
from typing import Any

from app.core.db import get_db
from app.modules.workspaces.purge import purge_due_workspaces

logger = logging.getLogger("backline.workspace_purge")


async def purge_closed_workspaces_job(ctx: dict[str, Any]) -> int:
    """Daily: closed workspaces past their 30-day grace period are purged (TDR-0214)."""
    report = await purge_due_workspaces(get_db(), apply=True)
    if report:
        logger.info("Purged %d closed workspace(s)", len(report))
    return len(report)
