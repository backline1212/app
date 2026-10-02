from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.core.config import get_settings
from app.core.db import get_db
from app.core.permissions import require_project_permission
from app.core.rate_limit import actor_rate_limit_key, check_rate_limit
from app.core.redis_client import get_redis
from app.core.session import Actor, Session, get_current_actor
from app.modules.assets import service
from app.modules.assets.schemas import AssetCommentCreate, AssetOut
from app.modules.comments.schemas import CommentOut

router = APIRouter(tags=["assets"])


@router.get("/projects/{project_id}/assets", response_model=list[AssetOut])
async def list_assets(project_id: str, actor: Actor = Depends(get_current_actor)) -> list[AssetOut]:
    return await service.list_assets(get_db(), project_id, actor)


@router.post("/projects/{project_id}/assets", response_model=AssetOut, status_code=201)
async def upload_asset(
    project_id: str,
    request: Request,
    file: UploadFile = File(...),
    session: Session = Depends(require_project_permission("asset:upload")),
) -> AssetOut:
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("asset-upload", request, session),
        limit=get_settings().upload_rate_limit_per_minute,
        window_seconds=60,
    )
    data = await file.read(service.MAX_ASSET_SIZE + 1)
    return await service.upload_asset(
        get_db(), project_id, session, file.filename or "Untitled", data
    )


@router.post(
    "/projects/{project_id}/assets/{asset_id}/comments", response_model=CommentOut, status_code=201
)
async def create_comment(
    project_id: str,
    asset_id: str,
    body: AssetCommentCreate,
    request: Request,
    actor: Actor = Depends(get_current_actor),
) -> CommentOut:
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("comment-create", request, actor),
        limit=get_settings().comment_create_rate_limit_per_minute,
        window_seconds=60,
    )
    return await service.create_comment(get_db(), project_id, asset_id, actor, body)
