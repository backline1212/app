"""Arq job function (06-Backend-Architecture.md §6.5) - registered by app/workers/main.py.
A thin wrapper: the Playwright capture lives in modules/projects/preview_service.py."""

from typing import Any

from app.core.db import get_db
from app.modules.projects.preview_service import run_capture


async def capture_project_preview_job(
    ctx: dict[str, Any], *, workspace_id: str, project_id: str, token: str
) -> None:
    await run_capture(get_db(), workspace_id=workspace_id, project_id=project_id, token=token)
