import gzip
import json
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.actor_access import resolve_actor_project_access
from app.core.arq_pool import get_arq_pool
from app.core.errors import ConflictError, NotFoundError
from app.core.events import append_event
from app.core.session import Actor, actor_identity
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository
from app.modules.realtime.pubsub import publish as publish_realtime_event
from app.modules.recovery_engine.repository import RecoveryLogRepository
from app.modules.revision_engine.repository import RevisionDiffRepository
from app.modules.snapshot_engine import events as snapshot_events
from app.modules.snapshot_engine.repository import RevisionRepository
from app.modules.snapshot_engine.schemas import (
    RevisionChangeSummary,
    RevisionHistoryOut,
    RevisionOut,
    RevisionRecoverySummary,
)
from app.modules.storage.r2_client import upload_bytes


def _revision_out(doc: dict[str, Any], *, created_new: bool) -> RevisionOut:
    return RevisionOut(
        id=str(doc["_id"]),
        page_id=doc["page_id"],
        full_page_hash=doc["full_page_hash"],
        captured_at=doc["captured_at"],
        is_current=doc["is_current"],
        created_new=created_new,
    )


async def list_project_revisions(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
) -> list[RevisionHistoryOut]:
    """Read-only version history backed by the canonical revision/recovery chain."""
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    pages = await PageRepository(db).list_for_project(workspace_id, project_id)
    page_map = {str(page["_id"]): page for page in pages}
    revisions = await RevisionRepository(db).list_for_pages(workspace_id, list(page_map), limit=200)
    revision_ids = [str(revision["_id"]) for revision in revisions]
    diff_summaries = await RevisionDiffRepository(db).summaries_for_revisions(
        workspace_id, revision_ids
    )
    recovery_summaries = await RecoveryLogRepository(db).summaries_for_revisions(
        workspace_id, revision_ids
    )
    return [
        RevisionHistoryOut(
            id=str(revision["_id"]),
            page_id=revision["page_id"],
            page_title=page_map[revision["page_id"]].get("title"),
            page_url=page_map[revision["page_id"]]["url_normalized"],
            full_page_hash=revision["full_page_hash"],
            captured_at=revision["captured_at"],
            is_current=revision["is_current"],
            changes=RevisionChangeSummary(**diff_summaries.get(str(revision["_id"]), {})),
            recovery=RevisionRecoverySummary(**recovery_summaries.get(str(revision["_id"]), {})),
        )
        for revision in revisions
    ]


async def submit_snapshot(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    actor: Actor,
    page_id: str,
    viewport: dict[str, int],
    node_tree: dict[str, Any],
    nodes_index: dict[str, Any],
    full_page_hash: str,
) -> RevisionOut:
    page_repo = PageRepository(db)
    page = await page_repo.find_by_id(page_id)
    if page is None:
        raise NotFoundError("Page not found.")

    # Raises PermissionDeniedError if the actor isn't authorized for this page's project.
    await resolve_actor_project_access(db, actor, page["project_id"])

    revision_repo = RevisionRepository(db)
    current = await revision_repo.find_current(page["workspace_id"], page_id)

    if current is not None and current["full_page_hash"] == full_page_hash:
        # 10-Revision-Recovery.md §10.2: identical hash -> discarded, no new revision.
        return _revision_out(current, created_new=False)

    # Mark the previous current revision not-current BEFORE inserting the new one, and
    # retry on a DuplicateKeyError from revisions_page_current_unique (a partial unique
    # index on {page_id, is_current: true}) - without this ordering + guard, two
    # concurrent submissions for the same page could both read the same `current`, both
    # insert a new is_current:true revision, and each mark a different old doc
    # not-current, leaving two revisions "current" at once.
    new_revision: dict[str, Any] | None = None
    for _ in range(3):
        if current is not None:
            await revision_repo.mark_not_current(page["workspace_id"], str(current["_id"]))
        try:
            new_revision = await revision_repo.create(
                page_id=page_id, workspace_id=page["workspace_id"], full_page_hash=full_page_hash
            )
            break
        except DuplicateKeyError:
            current = await revision_repo.find_current(page["workspace_id"], page_id)
            if current is not None and current["full_page_hash"] == full_page_hash:
                return _revision_out(current, created_new=False)
    if new_revision is None:
        raise ConflictError("Could not save this snapshot right now - try again.")
    revision_id = str(new_revision["_id"])

    snapshot_payload = {
        "revision_id": revision_id,
        "page_id": page_id,
        "viewport": viewport,
        "node_tree": node_tree,
        "nodes_index": nodes_index,
        "full_page_hash": full_page_hash,
    }
    compressed = gzip.compress(json.dumps(snapshot_payload).encode("utf-8"))
    snapshot_key = f"snapshots/{page['project_id']}/{revision_id}/snapshot.json.gz"
    await upload_bytes(snapshot_key, compressed, "application/gzip")
    await revision_repo.set_snapshot_key(page["workspace_id"], revision_id, snapshot_key)

    await page_repo.update_latest_revision(page["workspace_id"], page_id, revision_id)

    actor_type, actor_id = actor_identity(actor)
    await append_event(
        db,
        workspace_id=page["workspace_id"],
        type=snapshot_events.REVISION_CREATED,
        actor_type=actor_type,
        actor_id=actor_id,
        payload={"page_id": page_id, "revision_id": revision_id},
    )
    await publish_realtime_event(
        f"workspace:{page['workspace_id']}:all",
        event_type="revision.created",
        workspace_id=page["workspace_id"],
        payload={"page_id": page_id, "revision_id": revision_id},
    )

    if current is not None:
        # Only worth running if there's a previous revision to recover against - the
        # recovery pipeline itself would no-op on a page's very first snapshot anyway
        # (10-Revision-Recovery.md §10.4), but there's no reason to queue that no-op.
        pool = await get_arq_pool()
        await pool.enqueue_job(
            "run_recovery_pipeline_job", page_id=page_id, revision_id=revision_id
        )

    new_revision["snapshot_key"] = snapshot_key
    return _revision_out(new_revision, created_new=True)
