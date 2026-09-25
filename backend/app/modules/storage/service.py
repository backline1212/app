import uuid
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import ValidationError as PydanticValidationError

from app.core.actor_access import resolve_actor_project_access
from app.core.errors import ValidationError
from app.core.session import Actor
from app.modules.storage.r2_client import generate_presigned_put, upload_bytes
from app.modules.storage.schemas import StoredUploadOut, UploadOut, UploadRequest

_EXTENSION_BY_CONTENT_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/markdown": "md",
}


def _upload_key(workspace_id: str, project_id: str, content_type: str) -> str:
    extension = _EXTENSION_BY_CONTENT_TYPE[content_type]
    return f"uploads/{workspace_id}/{project_id}/{uuid.uuid4()}.{extension}"


async def create_upload_url(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    actor: Actor,
    project_id: str,
    content_type: str,
    content_length: int,
) -> UploadOut:
    workspace_id = await resolve_actor_project_access(db, actor, project_id)

    # Keyed by a fresh uuid4, not a comment_id - the upload happens before the comment
    # exists (docs/tdr/0002-snippet-mode-shares-the-share-link-model.md). "uploads/", not
    # "screenshots/" - this same endpoint now backs both a comment's own screenshot and
    # its attachments, so the key shouldn't imply it's only ever a screenshot.
    key = _upload_key(workspace_id, project_id, content_type)

    upload_url = await generate_presigned_put(key, content_type, content_length)
    return UploadOut(upload_url=upload_url, key=key)


async def store_upload(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    actor: Actor,
    project_id: str,
    content_type: str,
    data: bytes,
) -> StoredUploadOut:
    """Persist an upload through the API when a browser cannot PUT to R2 directly."""
    try:
        validated = UploadRequest(
            project_id=project_id,
            content_type=content_type,
            content_length=len(data),
        )
    except PydanticValidationError as exc:
        raise ValidationError("Unsupported upload type or size.") from exc
    workspace_id = await resolve_actor_project_access(db, actor, project_id)
    key = _upload_key(workspace_id, project_id, validated.content_type)
    await upload_bytes(key, data, validated.content_type)
    return StoredUploadOut(key=key)
