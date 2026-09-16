from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase


class BrowserRenderRepository:
    """`browser_renders` - one document per (page, browser, viewport, orientation)
    combination, acting as both the render cache and the job-status record a client
    polls while a render is in flight. Never workspace-exempt like pages.find_by_id:
    every read here is already scoped by project_id/page_id, which the caller resolved
    against the actor's workspace first (see service.py's _resolve_page_and_access)."""

    def __init__(self, db: AsyncIOMotorDatabase[dict[str, Any]]) -> None:
        self.db = db

    @staticmethod
    def cache_key(
        *, page_id: str, browser: str, width: int, height: int, orientation: str
    ) -> dict[str, Any]:
        return {
            "page_id": page_id,
            "browser": browser,
            "viewport.width": width,
            "viewport.height": height,
            "orientation": orientation,
        }

    async def find(
        self, *, page_id: str, browser: str, width: int, height: int, orientation: str
    ) -> dict[str, Any] | None:
        key = self.cache_key(
            page_id=page_id, browser=browser, width=width, height=height, orientation=orientation
        )
        return await self.db.browser_renders.find_one(key)

    async def mark_queued(
        self,
        *,
        workspace_id: str,
        project_id: str,
        page_id: str,
        browser: str,
        width: int,
        height: int,
        orientation: str,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        key = self.cache_key(
            page_id=page_id, browser=browser, width=width, height=height, orientation=orientation
        )
        await self.db.browser_renders.update_one(
            key,
            {
                "$set": {
                    **key,
                    "workspace_id": workspace_id,
                    "project_id": project_id,
                    "status": "queued",
                    "queued_at": now,
                    "error": None,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        doc = await self.find(
            page_id=page_id, browser=browser, width=width, height=height, orientation=orientation
        )
        assert doc is not None  # just written above
        return doc

    async def mark_rendering(self, *, doc_id: Any) -> None:
        # workspace-scope-exempt: doc_id is the render record's own _id, obtained by
        # run_render (service.py) from an earlier find() call it already scoped to a
        # workspace/project-verified page_id.
        await self.db.browser_renders.update_one({"_id": doc_id}, {"$set": {"status": "rendering"}})

    async def mark_ready(self, *, doc_id: Any, screenshot_key: str) -> None:
        # workspace-scope-exempt: same reasoning as mark_rendering above.
        await self.db.browser_renders.update_one(
            {"_id": doc_id},
            {
                "$set": {
                    "status": "ready",
                    "screenshot_key": screenshot_key,
                    "rendered_at": datetime.now(UTC),
                    "error": None,
                }
            },
        )

    async def mark_failed(self, *, doc_id: Any, error: str) -> None:
        # workspace-scope-exempt: same reasoning as mark_rendering above.
        await self.db.browser_renders.update_one(
            {"_id": doc_id}, {"$set": {"status": "failed", "error": error}}
        )
