"""Retryable project integration delivery from transactionally saved intents."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from urllib.parse import quote

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.arq_pool import get_arq_pool
from app.core.config import get_settings
from app.modules.comments.repository import CommentRepository
from app.modules.comments.service import _comment_out
from app.modules.integrations.dispatch_repository import IntegrationDispatchRepository
from app.modules.integrations.factory import NOTIFIER_TYPES, get_notifier
from app.modules.integrations.repository import IntegrationRepository
from app.modules.integrations.service import build_event_context
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository
from app.modules.workspaces.repository import WorkspaceRepository

logger = logging.getLogger("backline.integration_delivery")


async def _send_project_claimed(
    db: AsyncIOMotorDatabase[dict[str, Any]], doc: dict[str, Any]
) -> Literal["sent", "skipped"]:
    workspace_id = doc["workspace_id"]
    project = await ProjectRepository(db).find_in_workspace(workspace_id, doc["project_id"])
    integration = await IntegrationRepository(db).find_in_workspace(
        workspace_id, doc["integration_id"]
    )
    if project is None or integration is None or integration["type"] not in NOTIFIER_TYPES:
        return "skipped"
    if (
        not (project.get("settings_json") or {}).get("slack_notifications_enabled", True)
        or not integration["config_json"].get("notify_project_updates", True)
        or (integration.get("project_scope") and integration["project_scope"] != doc["project_id"])
    ):
        return "skipped"
    workspace = await WorkspaceRepository(db).find_by_id(workspace_id)
    if workspace is None:
        return "skipped"
    base = get_settings().public_dashboard_base_url.rstrip("/")
    backlink = (
        f"{base}/w/{quote(str(workspace['slug']), safe='')}"
        f"/p/{quote(doc['project_id'], safe='')}"
    )
    # The event's name is immutable even if a later save renames the project.
    await get_notifier(integration["type"]).on_project_updated(
        {**project, "name": doc["project_name"]}, integration["config_json"], backlink
    )
    return "sent"


async def _send_comment_claimed(
    db: AsyncIOMotorDatabase[dict[str, Any]], doc: dict[str, Any]
) -> Literal["sent", "skipped"]:
    workspace_id = doc["workspace_id"]
    integration = await IntegrationRepository(db).find_in_workspace(
        workspace_id, doc["integration_id"]
    )
    raw_comment = await CommentRepository(db).find_by_id(doc["comment_id"])
    if (
        integration is None
        or integration["type"] not in NOTIFIER_TYPES
        or raw_comment is None
        or raw_comment["workspace_id"] != workspace_id
        or raw_comment.get("deleted_at") is not None
    ):
        return "skipped"
    page = await PageRepository(db).find_by_id(raw_comment["page_id"])
    project = await ProjectRepository(db).find_in_workspace(workspace_id, doc["project_id"])
    if (
        page is None
        or page.get("workspace_id") != workspace_id
        or page["project_id"] != doc["project_id"]
        or project is None
        or not (project.get("settings_json") or {}).get("slack_notifications_enabled", True)
        or (integration.get("project_scope") and integration["project_scope"] != doc["project_id"])
    ):
        return "skipped"
    comment = await _comment_out(db, raw_comment)
    if doc["event_type"] == "comment.status_changed" and doc.get("status"):
        comment = comment.model_copy(update={"status": doc["status"]})
    event = await build_event_context(db, workspace_id=workspace_id, comment=comment)
    notifier = get_notifier(integration["type"])
    if doc["event_type"] == "comment.created":
        await notifier.on_comment_created(comment, integration["config_json"], event)
    elif doc["event_type"] == "comment.status_changed":
        await notifier.on_status_changed(comment, integration["config_json"], event)
    else:
        return "skipped"
    return "sent"


async def _send_claimed(
    db: AsyncIOMotorDatabase[dict[str, Any]], doc: dict[str, Any]
) -> Literal["sent", "skipped"]:
    if doc["event_type"] == "project.updated":
        return await _send_project_claimed(db, doc)
    if doc["event_type"] in ("comment.created", "comment.status_changed"):
        return await _send_comment_claimed(db, doc)
    return "skipped"


async def deliver_integration_dispatch(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, dispatch_id: str
) -> None:
    repo = IntegrationDispatchRepository(db)
    doc = await repo.claim(workspace_id=workspace_id, dispatch_id=dispatch_id)
    if doc is None:
        return
    try:
        async with asyncio.timeout(80):
            state = await _send_claimed(db, doc)
    except Exception as exc:
        attempts = int(doc["attempts"])
        await repo.finish(
            workspace_id=workspace_id,
            dispatch_id=doc["_id"],
            lease=doc["lease"],
            state="failed" if attempts >= 8 else "pending",
            after=(
                None
                if attempts >= 8
                else datetime.now(UTC) + timedelta(seconds=min(3600, 30 * 2 ** (attempts - 1)))
            ),
            error_type=type(exc).__name__,
        )
        logger.warning(
            "Project integration delivery deferred/failed (dispatch=%s, error=%s)",
            dispatch_id,
            type(exc).__name__,
        )
        return
    await repo.finish(
        workspace_id=workspace_id,
        dispatch_id=doc["_id"],
        lease=doc["lease"],
        state=state,
    )


async def sweep_integration_dispatches(db: AsyncIOMotorDatabase[dict[str, Any]]) -> int:
    rows = await IntegrationDispatchRepository(db).due()
    pool = await get_arq_pool()
    queued = 0
    for doc in rows:
        try:
            job = await pool.enqueue_job(
                "deliver_integration_dispatch_job",
                workspace_id=doc["workspace_id"],
                dispatch_id=str(doc["_id"]),
                _job_id=f"integration:{doc['_id']}:{doc['after'].isoformat()}",
            )
            queued += int(job is not None)
        except Exception as exc:
            logger.warning("Project integration sweep row failed (%s)", type(exc).__name__)
    return queued
