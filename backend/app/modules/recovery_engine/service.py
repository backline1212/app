import logging
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.events import append_event
from app.modules.anchor_engine.matcher import match_anchor
from app.modules.comments import events as comment_events
from app.modules.comments.repository import CommentRepository
from app.modules.pages.repository import PageRepository
from app.modules.realtime.pubsub import publish as publish_realtime_event
from app.modules.recovery_engine.repository import RecoveryLogRepository
from app.modules.revision_engine.repository import RevisionDiffRepository
from app.modules.revision_engine.service import compute_and_store_diff, load_snapshot_payload
from app.modules.snapshot_engine.repository import RevisionRepository

logger = logging.getLogger("backline.recovery")

# 10-Revision-Recovery.md §10.5: two consecutive misses -> the system has "given up"
# until a human manually reanchors (PATCH /comments/{id}/reanchor). A distinct status
# from plain `orphaned` so the dashboard can show "still trying" vs. "gave up" (P4).
PERMANENTLY_ORPHANED_THRESHOLD = 2


def _rebuild_anchor(old_anchor: dict[str, Any], matched_node: dict[str, Any]) -> dict[str, Any]:
    """Everything a snapshot's nodes_index actually carries (node_hash, ancestor_path_hash,
    tag, attributes, text) is refreshed from the matched node. `selector_path` is the one
    field that can't be reconstructed from a snapshot alone (nodes_index never stores a
    CSS selector, only the widget's live-DOM anchor capture does) - left stale rather than
    invented. It isn't read by match_anchor at all (see matcher.py), so this is inert for
    matching purposes; documented as a known limitation in docs/tdr/0007.

    `click_offset_pct` is carried over unchanged for the same reason as selector_path: a
    snapshot node has no notion of where someone clicked inside it, so the original
    capture-time value is the only one that exists. Dropping it would silently move every
    recovered comment's pin back to its element's corner."""
    old_dom_fp = old_anchor["dom_fingerprint"]
    old_text_fp = old_anchor["text_fingerprint"]
    return {
        "tier": 1,
        "dom_fingerprint": {
            "selector_path": old_dom_fp["selector_path"],
            "tag": matched_node["tag"],
            "attributes": matched_node["attributes"],
            "node_hash": matched_node["node_hash"],
            "ancestor_path_hash": matched_node["ancestor_path_hash"],
            "click_offset_pct": old_dom_fp.get("click_offset_pct"),
        },
        "text_fingerprint": {
            "normalized_text": matched_node.get("text", old_text_fp["normalized_text"]),
            "text_similarity_hash": matched_node.get(
                "text_similarity_hash", old_text_fp["text_similarity_hash"]
            ),
        },
    }


async def _broadcast_recovery_update(
    *,
    workspace_id: str,
    project_id: str,
    comment_id: str,
    layer: str,
    recovery_status: str,
    confidence: float,
) -> None:
    """Same dual-channel rule as every other comment event (12-API-WebSocket.md §12.6):
    always to the workspace's member channel, and to the project's guest channel only
    when the comment is client-visible."""
    payload = {
        "comment_id": comment_id,
        "recovery_status": recovery_status,
        "confidence": confidence,
    }
    await publish_realtime_event(
        f"workspace:{workspace_id}:all",
        event_type="comment.recovery_updated",
        workspace_id=workspace_id,
        payload=payload,
    )
    if layer == "client":
        await publish_realtime_event(
            f"project:{project_id}:client",
            event_type="comment.recovery_updated",
            workspace_id=workspace_id,
            payload=payload,
        )


async def run_recovery_pipeline(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, page_id: str, revision_id: str
) -> dict[str, int]:
    """10-Revision-Recovery.md §10.4 - runs once per new revision, scoped to that
    revision's page. Returns a small summary (unmatched by the API, used by tests and
    worker logging): counts of comments processed per outcome."""
    page = await PageRepository(db).find_by_id(page_id)
    if page is None:
        logger.warning("Recovery pipeline: page %s no longer exists, skipping.", page_id)
        return {"skipped": 1}

    revision_repo = RevisionRepository(db)
    new_revision = await revision_repo.find_current(page["workspace_id"], page_id)
    if new_revision is None or str(new_revision["_id"]) != revision_id:
        # The page's current revision has already moved on again by the time this job
        # ran (e.g. two snapshots submitted back to back) - a later job run will cover
        # the newer one; recovering against a stale target would be wasted/wrong work.
        logger.info("Revision %s is no longer current for page %s, skipping.", revision_id, page_id)
        return {"skipped": 1}
    if new_revision.get("snapshot_key") is None:
        return {"skipped": 1}

    previous_revision = await revision_repo.find_previous(
        page["workspace_id"], page_id, exclude_revision_id=revision_id
    )
    if previous_revision is None or previous_revision.get("snapshot_key") is None:
        # This new revision is the page's first ever - nothing existed before it for
        # any comment to have been anchored against.
        return {"skipped": 1}

    diff_repo = RevisionDiffRepository(db)
    if await diff_repo.find_by_to_revision(page["workspace_id"], page_id, revision_id) is not None:
        # Idempotency guard: an Arq job retry/redelivery for this same (page_id,
        # revision_id) must not run twice - without this, a retry both duplicates the
        # revision_diffs row (doubling the change count in list_project_revisions) and
        # re-increments consecutive_orphaned_revisions for every still-orphaned comment,
        # causing premature permanently_orphaned status.
        return {"skipped": 1}

    old_payload = await load_snapshot_payload(previous_revision["snapshot_key"])
    new_payload = await load_snapshot_payload(new_revision["snapshot_key"])
    old_nodes_index: dict[str, Any] = old_payload["nodes_index"]
    new_nodes_index: dict[str, Any] = new_payload["nodes_index"]

    await compute_and_store_diff(
        db,
        page_id=page_id,
        workspace_id=page["workspace_id"],
        from_revision_id=str(previous_revision["_id"]),
        to_revision_id=revision_id,
        old_nodes_index=old_nodes_index,
        new_nodes_index=new_nodes_index,
    )

    comment_repo = CommentRepository(db)
    log_repo = RecoveryLogRepository(db)
    comments = await comment_repo.list_recoverable_for_page(page["workspace_id"], page_id)

    summary: dict[str, int] = {}

    for comment in comments:
        comment_id = str(comment["_id"])
        streak = comment.get("consecutive_orphaned_revisions", 0)
        result = match_anchor(
            comment["anchor"], new_nodes_index, revisions_since_last_confirmed=streak
        )

        final_status: str
        if result.recovery_status in ("ok", "low_confidence"):
            matched_node = new_nodes_index[result.matched_node_id]  # type: ignore[index]
            new_anchor = _rebuild_anchor(comment["anchor"], matched_node)
            final_status = result.recovery_status
            new_streak = 0
        else:
            new_anchor = None
            new_streak = streak + 1
            final_status = (
                "permanently_orphaned"
                if new_streak >= PERMANENTLY_ORPHANED_THRESHOLD
                else "orphaned"
            )

        await comment_repo.update_recovery(
            comment_id,
            anchor=new_anchor,
            recovery_status=final_status,
            consecutive_orphaned_revisions=new_streak,
        )
        await log_repo.create(
            comment_id=comment_id,
            workspace_id=page["workspace_id"],
            from_revision_id=str(previous_revision["_id"]),
            to_revision_id=revision_id,
            strategy_used=result.strategy_used,
            confidence=result.confidence,
            candidates_considered=result.candidates_considered,
            outcome=final_status,
        )
        await append_event(
            db,
            workspace_id=page["workspace_id"],
            type=comment_events.COMMENT_RECOVERY_UPDATED,
            actor_type="system",
            actor_id=None,
            payload={"comment_id": comment_id, "recovery_status": final_status},
        )

        if final_status != comment.get("recovery_status"):
            await _broadcast_recovery_update(
                workspace_id=page["workspace_id"],
                project_id=page["project_id"],
                comment_id=comment_id,
                layer=comment["layer"],
                recovery_status=final_status,
                confidence=result.confidence,
            )

        summary[final_status] = summary.get(final_status, 0) + 1

    return summary
