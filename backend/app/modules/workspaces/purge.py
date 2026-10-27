"""Purge workspaces closed by their only member's account deletion (TDR-0214).

After the 30-day grace period, each closed workspace's projects go through the same
permanent deletion as Project → Delete permanently (comments, pages, files and private
objects), and its client records, integrations, custom domains and join requests are
removed. Kept: the workspace record (marked `purged_at`), audit events and billing
history. Runs daily in the worker; scripts/purge_closed_workspaces.py shows a dry run.
"""

import logging
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.modules.projects import deletion_service
from app.modules.projects.repository import ProjectRepository
from app.modules.projects.schemas import ProjectHardDeleteConfirm

logger = logging.getLogger("backline.workspace_purge")
_WORKSPACE_COLLECTIONS = ("clients", "integrations", "custom_domains", "join_requests")


async def purge_due_workspaces(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, apply: bool
) -> list[dict[str, Any]]:
    report: list[dict[str, Any]] = []
    # workspace-scope-exempt: finds closed workspaces themselves, by their closure fields
    due = db.workspaces.find(
        {"closed_at": {"$ne": None}, "purge_after": {"$lte": datetime.now(UTC)}, "purged_at": None}
    )
    async for workspace in due:
        workspace_id = str(workspace["_id"])
        actor = str(workspace.get("closed_by") or "system")
        projects = await ProjectRepository(db).list_for_workspace(
            workspace_id, include_archived=True
        )
        entry: dict[str, Any] = {
            "workspace_id": workspace_id,
            "name": workspace.get("name"),
            "projects": len(projects),
        }
        if apply:
            # One workspace that can't be purged (a project refusing hard delete, a
            # storage error) is reported and retried tomorrow; it no longer stops the
            # workspaces after it from being purged (TDR-0219).
            try:
                await _purge_workspace(db, workspace, projects, actor)
            except Exception as exc:
                logger.exception("Workspace purge failed for %s", workspace_id)
                entry["error"] = type(exc).__name__
                await db.workspaces.update_one(
                    {"_id": workspace["_id"]},
                    {"$set": {"purge_failed_at": datetime.now(UTC), "purge_error": entry["error"]}},
                )
            else:
                entry["projects_deleted"] = len(projects)
        report.append(entry)
    return report


async def _purge_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace: dict[str, Any],
    projects: list[dict[str, Any]],
    actor: str,
) -> None:
    workspace_id = str(workspace["_id"])
    for project in projects:
        project_id = str(project["_id"])
        if project.get("archived_at") is None:
            await ProjectRepository(db).archive(project_id)
        preview = await deletion_service.preview_hard_delete(
            db, project_id=project_id, workspace_id=workspace_id, actor_user_id=actor
        )
        await deletion_service.confirm_hard_delete(
            db,
            project_id=project_id,
            workspace_id=workspace_id,
            actor_user_id=actor,
            confirmation=ProjectHardDeleteConfirm(
                correlation_id=preview.correlation_id,
                project_name=preview.project_name,
                acknowledge_permanent_deletion=True,
            ),
        )
    for collection in _WORKSPACE_COLLECTIONS:
        # workspace-scope-exempt: deletes only this closed workspace's records
        await db[collection].delete_many({"workspace_id": workspace_id})
    await db.workspaces.update_one(
        {"_id": workspace["_id"]},
        {
            "$set": {"purged_at": datetime.now(UTC)},
            "$unset": {"purge_failed_at": "", "purge_error": ""},
        },
    )
