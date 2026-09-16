from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import to_object_id


class ProjectRepository:
    """`projects` - 11-Database.md §11.4."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    async def create(
        self,
        *,
        workspace_id: str,
        name: str,
        target_origin: str,
        created_by: str,
        project_type: str = "website",
        environment: str = "live",
        client_id: str | None = None,
        hero_url: str | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "workspace_id": workspace_id,
            "name": name,
            "project_type": project_type,
            "environment": environment,
            "client_id": client_id,
            "target_origin": target_origin,
            "created_by": created_by,
            "hero_url": hero_url,
            "settings_json": {"proxy_mode": False, "snippet_installed": False},
            "archived_at": None,
            "created_at": now,
            "updated_at": now,
        }
        result = await self.db.projects.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_id(self, project_id: str) -> dict[str, Any] | None:
        oid = to_object_id(project_id)
        if oid is None:
            return None
        # workspace-scope-exempt: single-document lookup by its own unique _id; every
        # caller checks doc["workspace_id"] against the caller's workspace immediately
        # after (e.g. get_project in projects/service.py).
        return await self.db.projects.find_one({"_id": oid})

    async def list_for_workspace(
        self, workspace_id: str, *, include_archived: bool = False
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"workspace_id": workspace_id}
        if not include_archived:
            query["archived_at"] = None
        cursor = self.db.projects.find(query).sort("created_at", -1)
        return [doc async for doc in cursor]

    async def find_by_origin(
        self, workspace_id: str, target_origin: str
    ) -> dict[str, Any] | None:
        """Used by the extension's "auto-detect current site" flow (find-or-create by
        origin) - archived projects don't match, so revisiting a site whose project was
        archived creates a fresh one rather than silently resurrecting the old one."""
        return await self.db.projects.find_one(
            {
                "workspace_id": workspace_id,
                "target_origin": target_origin,
                "archived_at": None,
            }
        )

    async def update_metadata(
        self, workspace_id: str, project_id: str, patch: dict[str, Any]
    ) -> None:
        await self.db.projects.update_one(
            {"workspace_id": workspace_id, "_id": to_object_id(project_id)},
            {"$set": {**patch, "updated_at": datetime.now(UTC)}},
        )

    async def update_settings(
        self, workspace_id: str, project_id: str, settings_patch: dict[str, Any]
    ) -> None:
        """M-08: was a raw `db.projects.update_one` call made directly from
        projects/service.py (rule 2.1 violation) - moved here unchanged in shape.
        `settings_patch` keys are bare field names (e.g. "capture_device_details");
        this method owns turning them into "settings_json.<field>" dot-notation."""
        set_ops = {f"settings_json.{k}": v for k, v in settings_patch.items()}
        await self.db.projects.update_one(
            {"workspace_id": workspace_id, "_id": to_object_id(project_id)},
            {"$set": {**set_ops, "updated_at": datetime.now(UTC)}},
        )

    async def update(
        self,
        project_id: str,
        *,
        name: str | None,
        target_origin: str | None,
        hero_url: str | None = None,
    ) -> None:
        patch: dict[str, Any] = {"updated_at": datetime.now(UTC)}
        if name is not None:
            patch["name"] = name
        if target_origin is not None:
            patch["target_origin"] = target_origin
        if hero_url is not None:
            patch["hero_url"] = hero_url
        # workspace-scope-exempt: update_project (projects/service.py) already verified
        # doc["workspace_id"] == workspace_id via find_by_id before calling this.
        await self.db.projects.update_one({"_id": to_object_id(project_id)}, {"$set": patch})

    async def archive(self, project_id: str) -> None:
        # workspace-scope-exempt: archive_project already verified ownership via
        # find_by_id before calling this, same as update() above.
        await self.db.projects.update_one(
            {"_id": to_object_id(project_id)},
            {"$set": {"archived_at": datetime.now(UTC), "updated_at": datetime.now(UTC)}},
        )
