from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.arq_pool import get_arq_pool
from app.core.errors import ConflictError, ExternalServiceError, NotFoundError
from app.core.events import append_event_once
from app.modules.projects import events as project_events
from app.modules.projects.deletion_repository import ProjectDeletionRepository, ProjectGraph
from app.modules.projects.repository import ProjectRepository
from app.modules.projects.schemas import (
    ProjectDeletionCounts,
    ProjectHardDeleteConfirm,
    ProjectHardDeletePreviewOut,
    ProjectHardDeleteResult,
)
from app.modules.storage.gc import run_object_gc
from app.modules.storage.r2_client import list_object_keys
from app.modules.storage.repository import ObjectGcRepository

logger = logging.getLogger(__name__)

RETENTION_NOTICE = (
    "Permanent deletion removes review content and private objects. Audit events are "
    "retained. Archive is the recoverable default; only an archived project can be deleted."
)


def _graph_signature(graph: ProjectGraph) -> str:
    canonical = json.dumps(graph.ids, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _allowed_object_prefixes(workspace_id: str, project_id: str) -> list[str]:
    # Both the accepted screenshot UUID prefix and the generalized upload prefix are
    # supported so legacy/current records remain cleanable. Snapshot keys predate a
    # workspace segment but remain safe because project ids are globally unique.
    return [
        f"screenshots/{workspace_id}/{project_id}/",
        f"uploads/{workspace_id}/{project_id}/",
        f"assets/{workspace_id}/{project_id}/",
        f"snapshots/{project_id}/",
        # browser_render/service.py's run_render uploads cross-browser screenshots
        # under this prefix - missing here meant a project hard-delete never
        # enumerated or deleted them (nor the browser_renders Mongo docs, now added
        # to ProjectDeletionRepository.snapshot_graph/delete_graph), leaking both the
        # R2 objects and their rows forever.
        f"renders/{workspace_id}/{project_id}/",
    ]


def _split_referenced_keys(keys: list[str], prefixes: list[str]) -> tuple[list[str], list[str]]:
    safe = sorted({key for key in keys if any(key.startswith(prefix) for prefix in prefixes)})
    unsafe = sorted(set(keys) - set(safe))
    return safe, unsafe


async def preview_hard_delete(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
) -> ProjectHardDeletePreviewOut:
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    if project.get("hard_delete_status") == "deleting":
        raise ConflictError("Permanent deletion is already in progress for this project.")

    repo = ProjectDeletionRepository(db)
    graph = await repo.snapshot_graph(workspace_id, project_id)
    prefixes = _allowed_object_prefixes(workspace_id, project_id)
    safe_references, unsafe_references = _split_referenced_keys(
        graph.referenced_object_keys, prefixes
    )
    try:
        stored_keys = await list_object_keys(prefixes)
    except Exception as exc:
        raise ExternalServiceError(
            "Private object storage could not be enumerated; no deletion plan was created."
        ) from exc
    object_keys = sorted(set(stored_keys) | set(safe_references))

    counts = ProjectDeletionCounts(
        **graph.counts,
        object_keys=len(object_keys),
        retained_audit_events=graph.retained_audit_events,
        unsafe_object_references=len(unsafe_references),
    )
    correlation_id = str(uuid.uuid4())
    expires_at = await repo.create_plan(
        correlation_id=correlation_id,
        workspace_id=workspace_id,
        project_id=project_id,
        project_name=project["name"],
        actor_user_id=actor_user_id,
        graph_signature=_graph_signature(graph),
        counts=counts.model_dump(),
        object_keys=object_keys,
    )
    return ProjectHardDeletePreviewOut(
        correlation_id=correlation_id,
        project_id=project_id,
        project_name=project["name"],
        archived=project.get("archived_at") is not None,
        expires_at=expires_at,
        counts=counts,
        retention_notice=RETENTION_NOTICE,
    )


async def _enqueue_gc_retry(workspace_id: str, project_id: str, correlation_id: str) -> None:
    try:
        pool = await get_arq_pool()
        await pool.enqueue_job(
            "resume_project_hard_delete_job",
            workspace_id=workspace_id,
            project_id=project_id,
            correlation_id=correlation_id,
            _defer_by=30,
            _job_id=f"project-hard-delete:{correlation_id}",
        )
    except Exception:
        # The durable tombstone is the recovery source of truth. Queue failure must not
        # erase it or disguise the original R2 failure returned to the caller.
        logger.exception("Could not enqueue object GC retry for %s", correlation_id)


async def resume_confirmed_hard_delete(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    correlation_id: str,
) -> ProjectHardDeleteResult:
    repo = ProjectDeletionRepository(db)
    plan = await repo.find_plan_by_correlation(workspace_id, project_id, correlation_id)
    if plan is None:
        raise NotFoundError("Deletion plan not found.")
    counts = ProjectDeletionCounts(**plan["counts"])
    if plan["status"] == "complete":
        return ProjectHardDeleteResult(
            correlation_id=correlation_id, status="deleted", counts=counts
        )

    gc_counts = await run_object_gc(
        db,
        workspace_id=workspace_id,
        project_id=project_id,
        correlation_id=correlation_id,
    )
    if sum(gc_counts.get(status, 0) for status in ("pending", "deleting", "failed")):
        await repo.set_plan_status(workspace_id, project_id, correlation_id, "storage_failed")
        raise ExternalServiceError(
            "Private object cleanup is incomplete. MongoDB records were retained and "
            "the tombstones remain retryable.",
            details={"correlation_id": correlation_id, "object_gc": gc_counts},
        )

    await repo.set_plan_status(workspace_id, project_id, correlation_id, "mongo_deleting")
    await repo.delete_graph(plan["workspace_id"], plan["project_id"])
    await append_event_once(
        db,
        correlation_id=correlation_id,
        workspace_id=plan["workspace_id"],
        type=project_events.PROJECT_HARD_DELETED,
        actor_type="member",
        actor_id=plan["actor_user_id"],
        payload={
            "project_id": plan["project_id"],
            "name": plan["project_name"],
            "counts": counts.model_dump(),
        },
    )
    await repo.set_plan_status(workspace_id, project_id, correlation_id, "complete")
    return ProjectHardDeleteResult(correlation_id=correlation_id, status="deleted", counts=counts)


async def confirm_hard_delete(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
    confirmation: ProjectHardDeleteConfirm,
) -> ProjectHardDeleteResult:
    repo = ProjectDeletionRepository(db)
    plan = await repo.find_plan(
        workspace_id=workspace_id,
        project_id=project_id,
        correlation_id=confirmation.correlation_id,
        actor_user_id=actor_user_id,
    )
    if plan is None:
        raise NotFoundError("Deletion plan not found.")
    if plan["expires_at"] <= datetime.now(UTC):
        raise ConflictError("Deletion plan expired. Run a new dry-run first.")
    if confirmation.project_name != plan["project_name"]:
        raise ConflictError("Project name confirmation does not match the dry-run.")
    if plan["status"] == "complete":
        return ProjectHardDeleteResult(
            correlation_id=confirmation.correlation_id,
            status="deleted",
            counts=ProjectDeletionCounts(**plan["counts"]),
        )
    if plan["counts"].get("unsafe_object_references", 0):
        raise ConflictError(
            "The dry-run found object references outside this project's accepted storage "
            "prefixes. Resolve them before permanent deletion."
        )

    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        if plan["status"] == "mongo_deleting":
            return await resume_confirmed_hard_delete(
                db,
                workspace_id=workspace_id,
                project_id=project_id,
                correlation_id=confirmation.correlation_id,
            )
        raise NotFoundError("Project not found.")
    if project.get("archived_at") is None:
        raise ConflictError("Archive the project before permanent deletion.")

    if plan["status"] == "planned":
        current_graph = await repo.snapshot_graph(workspace_id, project_id)
        if _graph_signature(current_graph) != plan["graph_signature"]:
            raise ConflictError(
                "Project contents changed after the dry-run. Run a new dry-run before confirming."
            )
        if not await repo.lock_project(workspace_id, project_id):
            raise ConflictError("Permanent deletion is already in progress.")
        await ObjectGcRepository(db).prepare(
            workspace_id=workspace_id,
            project_id=project_id,
            correlation_id=confirmation.correlation_id,
            keys=plan["object_keys"],
        )
        await repo.set_plan_status(
            workspace_id,
            project_id,
            confirmation.correlation_id,
            "storage_deleting",
        )
        # A delayed, uniquely keyed job is a crash-recovery backstop. The request also
        # executes synchronously so callers receive the final auditable result; if both
        # overlap, tombstone claiming and the correlation event make that safe.
        await _enqueue_gc_retry(workspace_id, project_id, confirmation.correlation_id)

    try:
        return await resume_confirmed_hard_delete(
            db,
            workspace_id=workspace_id,
            project_id=project_id,
            correlation_id=confirmation.correlation_id,
        )
    except ExternalServiceError:
        await _enqueue_gc_retry(workspace_id, project_id, confirmation.correlation_id)
        raise
