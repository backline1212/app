"""Durable, leased delivery of committed snapshots (TDR-0068)."""

import logging
from typing import Any, cast

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.events import ActorType, append_event_once
from app.modules.pages.repository import PageRepository
from app.modules.realtime.pubsub import publish
from app.modules.recovery_engine.service import run_recovery_pipeline
from app.modules.snapshot_engine.events import REVISION_CREATED
from app.modules.snapshot_engine.repository import RevisionRepository

logger = logging.getLogger("backline.snapshot_delivery")


async def deliver_revision(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    revision_id: str,
) -> None:
    repo = RevisionRepository(db)
    claimed = await repo.claim_delivery(workspace_id, revision_id)
    if claimed is None:
        return
    try:
        page = await PageRepository(db).find_by_id(claimed["page_id"])
        if page and page["workspace_id"] == workspace_id:
            payload = {
                "page_id": claimed["page_id"],
                "project_id": page["project_id"],
                "revision_id": revision_id,
            }
            await append_event_once(
                db,
                correlation_id=f"snapshot:{workspace_id}:{revision_id}",
                workspace_id=workspace_id,
                type=REVISION_CREATED,
                actor_type=cast(ActorType, claimed["actor_type"]),
                actor_id=claimed["actor_id"],
                payload=payload,
            )
            await publish(
                f"workspace:{workspace_id}:all",
                event_type="revision.created",
                workspace_id=workspace_id,
                payload=payload,
            )
            await run_recovery_pipeline(db, page_id=claimed["page_id"], revision_id=revision_id)
    except Exception as exc:
        await repo.finish_delivery(
            workspace_id,
            revision_id,
            lease=claimed["delivery_after"],
            success=False,
        )
        logger.warning("Snapshot delivery deferred (%s)", type(exc).__name__)
        raise
    await repo.finish_delivery(
        workspace_id,
        revision_id,
        lease=claimed["delivery_after"],
        success=True,
    )


async def sweep_deliveries(db: AsyncIOMotorDatabase[dict[str, Any]]) -> int:
    due = await RevisionRepository(db).due_deliveries()
    for doc in due:
        try:
            await deliver_revision(
                db, workspace_id=doc["workspace_id"], revision_id=str(doc["_id"])
            )
        except Exception:
            # One workspace's temporary failure must not starve the other rows.
            continue
    return len(due)
