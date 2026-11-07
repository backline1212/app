"""Arq job function (06-Backend-Architecture.md §6.5) - registered by app/workers/main.py,
the single worker entrypoint (see that file for why one process, not one per module).
The job itself is a thin wrapper - all the actual Playwright logic lives in
modules/browser_render/service.py as a plain, directly-testable async function."""

from typing import Any

from app.core.db import get_db
from app.modules.browser_render.service import run_render
from app.workers.browser_slots import browser_slot


async def render_browser_snapshot_job(
    ctx: dict[str, Any],
    *,
    workspace_id: str,
    project_id: str,
    page_id: str,
    url: str,
    browser: str,
    width: int,
    height: int,
    orientation: str,
) -> None:
    async with browser_slot():
        await run_render(
            get_db(),
            workspace_id=workspace_id,
            project_id=project_id,
            page_id=page_id,
            url=url,
            browser=browser,
            width=width,
            height=height,
            orientation=orientation,
        )
