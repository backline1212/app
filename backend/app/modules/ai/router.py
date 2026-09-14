from typing import Any

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.session import Session, require_workspace_context
from app.core.permissions import require_permission
from app.core.db import get_db
from app.modules.ai import service
from app.modules.ai.schemas import SummarizeResult, SuggestReplyResult

router = APIRouter(tags=["AI"])

@router.post(
    "/api/workspaces/{workspace_id}/projects/{project_id}/comments/{comment_id}/ai/summarize",
    response_model=SummarizeResult,
)
async def summarize_thread(
    workspace_id: str,
    project_id: str,
    comment_id: str,
    db: AsyncIOMotorDatabase[dict[str, Any]] = Depends(get_db),
    session: Session = Depends(require_permission("comment:view_team")),
) -> SummarizeResult:
    # workspace_id is taken from the caller's own session, never the path param -
    # the path param is untrusted and must not be used to scope the lookup (it
    # previously allowed reading any other workspace's comment threads).
    return await service.summarize_thread(db, require_workspace_context(session), comment_id)

@router.post(
    "/api/workspaces/{workspace_id}/projects/{project_id}/comments/{comment_id}/ai/suggest-reply",
    response_model=SuggestReplyResult,
)
async def suggest_reply(
    workspace_id: str,
    project_id: str,
    comment_id: str,
    db: AsyncIOMotorDatabase[dict[str, Any]] = Depends(get_db),
    session: Session = Depends(require_permission("comment:view_team")),
) -> SuggestReplyResult:
    return await service.suggest_reply(db, require_workspace_context(session), comment_id)
