import gzip
import json
import logging
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.actor_access import resolve_actor_project_access
from app.core.arq_pool import get_arq_pool
from app.core.errors import NotFoundError
from app.core.session import Actor, Session, actor_identity
from app.modules.deploy_sync.service import attach_snapshot
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository
from app.modules.recovery_engine.repository import RecoveryLogRepository
from app.modules.revision_engine.repository import RevisionDiffRepository
from app.modules.snapshot_engine.repository import RevisionRepository
from app.modules.snapshot_engine.schemas import (
    RevisionChangeSummary,
    RevisionHistoryOut,
    RevisionOut,
    RevisionRecoverySummary,
)
from app.modules.storage.quota import store_bytes

logger = logging.getLogger("backline.snapshots")


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
            is_current=(
                page_map[revision["page_id"]].get("latest_revision_id") == str(revision["_id"])
                if page_map[revision["page_id"]].get("latest_revision_id")
                else revision["is_current"]
            ),
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
    started_at = datetime.now(UTC)
    page_repo = PageRepository(db)
    page = await page_repo.find_by_id(page_id)
    if page is None:
        raise NotFoundError("Page not found.")

    # Raises PermissionDeniedError if the actor isn't authorized for this page's project.
    await resolve_actor_project_access(db, actor, page["project_id"])

    revision_repo = RevisionRepository(db)
    revision_oid = ObjectId()
    revision_id = str(revision_oid)
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
    # Storage succeeds before any current pointer changes. Identical completed
    # snapshots need no new object, but are still repaired/deduplicated transactionally.
    observed = await revision_repo.find_current(page["workspace_id"], page_id)
    if not (
        observed and observed["full_page_hash"] == full_page_hash and observed.get("snapshot_key")
    ):
        await store_bytes(
            db,
            workspace_id=page["workspace_id"],
            project_id=page["project_id"],
            key=snapshot_key,
            data=compressed,
            content_type="application/gzip",
        )
    actor_type, actor_id = actor_identity(actor)
    # Storage can take time; recheck current review/session access before linking
    # the snapshot to a deployment or changing the page pointer.
    await resolve_actor_project_access(db, actor, page["project_id"])

    async def commit(session: AsyncIOMotorClientSession) -> tuple[dict[str, Any], bool]:
        current = await revision_repo.find_current(page["workspace_id"], page_id, session=session)
        # A concurrent different snapshot may have committed after the observed
        # deduplication read. Never create a revision pointing at an unwritten object.
        if (
            observed
            and observed["full_page_hash"] == full_page_hash
            and observed.get("snapshot_key")
        ):
            if (
                current is None
                or current["full_page_hash"] != full_page_hash
                or not current.get("snapshot_key")
            ):
                from app.core.errors import ConflictError

                raise ConflictError("The page changed while saving. Capture it again.")
        saved, created = await revision_repo.commit_ready(
            session=session,
            workspace_id=page["workspace_id"],
            page_id=page_id,
            revision_id=revision_oid,
            snapshot_key=snapshot_key,
            full_page_hash=full_page_hash,
            actor_type=actor_type,
            actor_id=actor_id,
        )
        await page_repo.update_latest_revision(
            page["workspace_id"],
            page_id,
            str(saved["_id"]),
            session=session,
        )
        # External guests may submit ordinary snapshots but cannot complete a
        # team's deployment capture. The dashboard's member-backed guest can.
        if isinstance(actor, Session) or actor.member_user_id:
            await attach_snapshot(
                db, page=page, revision_id=str(saved["_id"]), started_at=started_at, session=session
            )
        return saved, created

    async with await db.client.start_session() as session:
        committed: tuple[dict[str, Any], bool] = await session.with_transaction(commit)
    saved, created = committed

    # Queueing is a latency optimization. The durable row and minute sweep survive
    # Redis outages, lost HTTP responses, API restarts and exhausted Arq retries.
    try:
        pool = await get_arq_pool()
        await pool.enqueue_job(
            "deliver_snapshot_revision_job",
            workspace_id=page["workspace_id"],
            revision_id=str(saved["_id"]),
        )
    except Exception as exc:
        logger.warning("Snapshot delivery deferred to sweep (%s)", type(exc).__name__)
    return _revision_out(saved, created_new=created)
