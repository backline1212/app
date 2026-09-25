from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.core.config import get_settings
from app.core.db import get_db
from app.core.errors import ValidationError
from app.core.rate_limit import actor_rate_limit_key, check_rate_limit
from app.core.redis_client import get_redis
from app.core.session import Actor, get_current_actor
from app.modules.storage import service as storage_service
from app.modules.storage.schemas import (
    MAX_UPLOAD_SIZE_BYTES,
    StoredUploadOut,
    UploadOut,
    UploadRequest,
)

router = APIRouter(tags=["storage"])


@router.post("/uploads", response_model=UploadOut, status_code=201)
async def create_upload(
    body: UploadRequest, request: Request, actor: Actor = Depends(get_current_actor)
) -> UploadOut:
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("upload", request, actor),
        limit=settings.upload_rate_limit_per_minute,
        window_seconds=60,
    )
    return await storage_service.create_upload_url(
        get_db(),
        actor=actor,
        project_id=body.project_id,
        content_type=body.content_type,
        content_length=body.content_length,
    )


@router.post("/uploads/direct", response_model=StoredUploadOut, status_code=201)
async def create_direct_upload(
    request: Request,
    project_id: str = Form(...),
    file: UploadFile = File(...),
    actor: Actor = Depends(get_current_actor),
) -> StoredUploadOut:
    """Same-origin fallback when the normal presigned R2 PUT is browser-blocked."""
    settings = get_settings()
    await check_rate_limit(
        get_redis(),
        key=actor_rate_limit_key("upload", request, actor),
        limit=settings.upload_rate_limit_per_minute,
        window_seconds=60,
    )
    data = await file.read(MAX_UPLOAD_SIZE_BYTES + 1)
    if len(data) > MAX_UPLOAD_SIZE_BYTES:
        raise ValidationError("That upload is too large.")
    return await storage_service.store_upload(
        get_db(),
        actor=actor,
        project_id=project_id,
        content_type=file.content_type or "application/octet-stream",
        data=data,
    )
