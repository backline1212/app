from fastapi import APIRouter, Depends, Request

from app.core.config import get_settings
from app.core.db import get_db
from app.core.permissions import require_project_permission
from app.core.rate_limit import actor_rate_limit_key, check_rate_limit
from app.core.redis_client import get_redis
from app.core.session import Actor, Session, get_current_actor, require_workspace_context
from app.modules.snapshot_engine import service as snapshot_service
from app.modules.snapshot_engine.schemas import RevisionHistoryOut, RevisionOut, SnapshotSubmit

router = APIRouter(tags=["snapshots"])


@router.get("/projects/{project_id}/revisions", response_model=list[RevisionHistoryOut])
async def list_project_revisions(
    project_id: str,
    session: Session = Depends(require_project_permission("project:view")),
) -> list[RevisionHistoryOut]:
    return await snapshot_service.list_project_revisions(
        get_db(),
        workspace_id=require_workspace_context(session),
        project_id=project_id,
    )


@router.post("/pages/{page_id}/snapshots", response_model=RevisionOut, status_code=201)
async def submit_snapshot(
    page_id: str, body: SnapshotSubmit, request: Request, actor: Actor = Depends(get_current_actor)
) -> RevisionOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("snapshot-submit", request, actor),
        limit=settings.snapshot_submit_rate_limit_per_minute,
        window_seconds=60,
    )
    return await snapshot_service.submit_snapshot(
        get_db(),
        actor=actor,
        page_id=page_id,
        viewport=body.viewport,
        node_tree=body.node_tree,
        nodes_index=body.nodes_index,
        full_page_hash=body.full_page_hash,
    )
