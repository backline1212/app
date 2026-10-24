from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response

from app.core.config import get_settings
from app.core.db import get_db
from app.core.permissions import require_project_permission
from app.core.rate_limit import actor_rate_limit_key, check_rate_limit
from app.core.redis_client import get_redis
from app.core.session import Actor, Session, get_current_actor
from app.modules.assets import service
from app.modules.assets.schemas import AssetCommentCreate, AssetOut, AssetUpdate, Region
from app.modules.comments.schemas import CommentOut

router = APIRouter(tags=["assets"])


@router.get(
    "/projects/{project_id}/assets/{asset_id}/content",
    response_class=Response,
    responses={
        200: {
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            }
        }
    },
)
async def read_content(
    project_id: str,
    asset_id: str,
    request: Request,
    actor: Actor = Depends(get_current_actor),
) -> Response:
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("asset-content", request, actor),
        limit=60,
        window_seconds=60,
    )
    data, content_type, filename = await service.read_content(get_db(), project_id, asset_id, actor)
    return Response(
        data,
        media_type=content_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename, safe='')}",
        },
    )


@router.patch(
    "/projects/{project_id}/assets/{asset_id}/comments/{comment_id}/region",
    response_model=CommentOut,
)
async def move_comment(
    project_id: str,
    asset_id: str,
    comment_id: str,
    body: Region,
    session: Session = Depends(require_project_permission("comment:reanchor")),
) -> CommentOut:
    return await service.move_comment(get_db(), project_id, asset_id, comment_id, session, body)


@router.get("/projects/{project_id}/assets", response_model=list[AssetOut])
async def list_assets(
    project_id: str,
    include_archived: bool = False,
    actor: Actor = Depends(get_current_actor),
) -> list[AssetOut]:
    return await service.list_assets(get_db(), project_id, actor, include_archived=include_archived)


@router.patch("/projects/{project_id}/assets/{asset_id}", response_model=AssetOut)
async def update_asset(
    project_id: str,
    asset_id: str,
    body: AssetUpdate,
    session: Session = Depends(require_project_permission("asset:upload")),
) -> AssetOut:
    return await service.update_asset(get_db(), project_id, asset_id, session, body)


@router.post("/projects/{project_id}/assets", response_model=AssetOut, status_code=201)
async def upload_asset(
    project_id: str,
    request: Request,
    file: UploadFile = File(...),
    client_request_id: str | None = Form(default=None, min_length=1, max_length=64),
    build_label: str | None = Form(default=None, max_length=80),
    device: str | None = Form(default=None, max_length=80),
    platform: str | None = Form(default=None, max_length=40),
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
        get_db(),
        project_id,
        session,
        file.filename or "Untitled",
        data,
        client_request_id=client_request_id,
        build_label=build_label,
        device=device,
        platform=platform,
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
