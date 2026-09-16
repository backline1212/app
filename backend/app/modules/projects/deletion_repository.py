from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id


@dataclass(frozen=True)
class ProjectGraph:
    ids: dict[str, list[str]]
    referenced_object_keys: list[str]
    retained_audit_events: int

    @property
    def counts(self) -> dict[str, int]:
        return {collection: len(ids) for collection, ids in self.ids.items()}


class ProjectDeletionRepository:
    """Workspace-scoped graph enumeration and dependency-ordered deletion."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def snapshot_graph(self, workspace_id: str, project_id: str) -> ProjectGraph:
        pages = await self.db.pages.find(
            {"workspace_id": workspace_id, "project_id": project_id}, {"_id": 1}
        ).to_list(length=None)
        page_ids = [str(doc["_id"]) for doc in pages]

        content_query: dict[str, Any] = {
            "workspace_id": workspace_id,
            "$or": [{"project_id": project_id}],
        }
        if page_ids:
            content_query["$or"].append({"page_id": {"$in": page_ids}})
        comments = await self.db.comments.find(
            content_query,
            {"_id": 1, "screenshot_key": 1, "attachments.key": 1},
        ).to_list(length=None)
        comment_ids = [str(doc["_id"]) for doc in comments]

        page_query = {"workspace_id": workspace_id, "page_id": {"$in": page_ids}}
        revisions = (
            await self.db.revisions.find(page_query, {"_id": 1, "snapshot_key": 1}).to_list(
                length=None
            )
            if page_ids
            else []
        )
        revision_diffs = (
            await self.db.revision_diffs.find(page_query, {"_id": 1}).to_list(length=None)
            if page_ids
            else []
        )
        recovery_logs = (
            await self.db.recovery_logs.find(
                {"workspace_id": workspace_id, "comment_id": {"$in": comment_ids}},
                {"_id": 1},
            ).to_list(length=None)
            if comment_ids
            else []
        )
        share_links = await self.db.share_links.find(
            {"workspace_id": workspace_id, "project_id": project_id}, {"_id": 1}
        ).to_list(length=None)
        share_link_ids = [str(doc["_id"]) for doc in share_links]
        guest_sessions = (
            await self.db.guest_sessions.find(
                {
                    "workspace_id": workspace_id,
                    "share_link_id": {"$in": share_link_ids},
                },
                {"_id": 1},
            ).to_list(length=None)
            if share_link_ids
            else []
        )
        assets = await self.db.project_assets.find(
            {"workspace_id": workspace_id, "project_id": project_id},
            {"_id": 1, "key": 1},
        ).to_list(length=None)
        notifications = await self.db.notifications.find(
            {
                "workspace_id": workspace_id,
                "$or": [
                    {"payload_json.project_id": project_id},
                    {"payload_json.comment_id": {"$in": comment_ids}},
                ],
            },
            {"_id": 1},
        ).to_list(length=None)
        project_integrations = await self.db.integrations.find(
            {"workspace_id": workspace_id, "project_scope": project_id}, {"_id": 1}
        ).to_list(length=None)
        browser_renders = await self.db.browser_renders.find(
            {"workspace_id": workspace_id, "project_id": project_id},
            {"_id": 1, "screenshot_key": 1},
        ).to_list(length=None)

        referenced_keys = {str(doc["snapshot_key"]) for doc in revisions if doc.get("snapshot_key")}
        referenced_keys.update(str(doc["key"]) for doc in assets if doc.get("key"))
        referenced_keys.update(
            str(doc["screenshot_key"]) for doc in browser_renders if doc.get("screenshot_key")
        )
        for comment in comments:
            if comment.get("screenshot_key"):
                referenced_keys.add(str(comment["screenshot_key"]))
            referenced_keys.update(
                str(attachment["key"])
                for attachment in comment.get("attachments", [])
                if attachment.get("key")
            )

        retained_events = await self.db.events.count_documents(
            {"workspace_id": workspace_id, "payload_json.project_id": project_id}
        )
        ids = {
            "pages": sorted(page_ids),
            "project_assets": sorted(str(doc["_id"]) for doc in assets),
            "comments": sorted(comment_ids),
            "revisions": sorted(str(doc["_id"]) for doc in revisions),
            "revision_diffs": sorted(str(doc["_id"]) for doc in revision_diffs),
            "recovery_logs": sorted(str(doc["_id"]) for doc in recovery_logs),
            "share_links": sorted(share_link_ids),
            "guest_sessions": sorted(str(doc["_id"]) for doc in guest_sessions),
            "notifications": sorted(str(doc["_id"]) for doc in notifications),
            "project_integrations": sorted(str(doc["_id"]) for doc in project_integrations),
            "browser_renders": sorted(str(doc["_id"]) for doc in browser_renders),
        }
        return ProjectGraph(
            ids=ids,
            referenced_object_keys=sorted(referenced_keys),
            retained_audit_events=retained_events,
        )

    async def create_plan(
        self,
        *,
        correlation_id: str,
        workspace_id: str,
        project_id: str,
        project_name: str,
        actor_user_id: str,
        graph_signature: str,
        counts: dict[str, int],
        object_keys: list[str],
    ) -> datetime:
        now = datetime.now(UTC)
        expires_at = now + timedelta(hours=1)
        await self.db.deletion_plans.insert_one(
            {
                "correlation_id": correlation_id,
                "workspace_id": workspace_id,
                "project_id": project_id,
                "project_name": project_name,
                "actor_user_id": actor_user_id,
                "graph_signature": graph_signature,
                "counts": counts,
                "object_keys": object_keys,
                "status": "planned",
                "created_at": now,
                "updated_at": now,
                "expires_at": expires_at,
                # Unconfirmed previews are ephemeral. Confirmation removes this field
                # so a long storage outage cannot erase the worker's resume state.
                "purge_after": expires_at,
            }
        )
        return expires_at

    async def find_plan(
        self,
        *,
        workspace_id: str,
        project_id: str,
        correlation_id: str,
        actor_user_id: str,
    ) -> dict[str, Any] | None:
        return await self.db.deletion_plans.find_one(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "correlation_id": correlation_id,
                "actor_user_id": actor_user_id,
            }
        )

    async def find_plan_by_correlation(
        self, workspace_id: str, project_id: str, correlation_id: str
    ) -> dict[str, Any] | None:
        return await self.db.deletion_plans.find_one(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "correlation_id": correlation_id,
            }
        )

    async def set_plan_status(
        self, workspace_id: str, project_id: str, correlation_id: str, status: str
    ) -> None:
        now = datetime.now(UTC)
        update: dict[str, Any] = {"$set": {"status": status, "updated_at": now}}
        if status == "complete":
            update["$set"]["purge_after"] = now + timedelta(days=30)
        elif status != "planned":
            update["$unset"] = {"purge_after": ""}
        await self.db.deletion_plans.update_one(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "correlation_id": correlation_id,
            },
            update,
        )

    async def lock_project(self, workspace_id: str, project_id: str) -> bool:
        result = await self.db.projects.update_one(
            {
                "_id": to_object_id(project_id),
                "workspace_id": workspace_id,
                "archived_at": {"$ne": None},
                "hard_delete_status": {"$ne": "deleting"},
            },
            {
                "$set": {
                    "hard_delete_status": "deleting",
                    "hard_delete_started_at": datetime.now(UTC),
                }
            },
        )
        return result.modified_count == 1

    async def delete_graph(self, workspace_id: str, project_id: str) -> None:
        """Dependency order is deliberate; every operation is retry-safe."""
        graph = await self.snapshot_graph(workspace_id, project_id)
        ids = graph.ids

        async def delete_ids(collection: str) -> None:
            object_ids = [to_object_id(value) for value in ids[collection]]
            object_ids = [value for value in object_ids if value is not None]
            if object_ids:
                await self.db[collection].delete_many(
                    {"workspace_id": workspace_id, "_id": {"$in": object_ids}}
                )

        for collection in (
            "recovery_logs",
            "revision_diffs",
            "revisions",
            "notifications",
            "comments",
            "guest_sessions",
            "share_links",
            "project_assets",
            "browser_renders",
        ):
            await delete_ids(collection)
        if ids["project_integrations"]:
            integration_ids = [to_object_id(value) for value in ids["project_integrations"]]
            await self.db.integrations.delete_many(
                {
                    "workspace_id": workspace_id,
                    "_id": {"$in": [value for value in integration_ids if value]},
                }
            )
        await delete_ids("pages")
        await self.db.projects.delete_one(
            {"_id": to_object_id(project_id), "workspace_id": workspace_id}
        )
