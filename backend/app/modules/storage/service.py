import uuid
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.actor_access import resolve_actor_project_access
from app.core.session import Actor
from app.modules.storage.r2_client import generate_presigned_put
from app.modules.storage.schemas import UploadOut

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


async def create_upload_url(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    actor: Actor,
    project_id: str,
    content_type: str,
    content_length: int,
) -> UploadOut:
    workspace_id = await resolve_actor_project_access(db, actor, project_id)

    extension = _EXTENSION_BY_CONTENT_TYPE[content_type]
    # Keyed by a fresh uuid4, not a comment_id - the upload happens before the comment
    # exists (docs/tdr/0002-snippet-mode-shares-the-share-link-model.md). "uploads/", not
    # "screenshots/" - this same endpoint now backs both a comment's own screenshot and
    # its attachments, so the key shouldn't imply it's only ever a screenshot.
    key = f"uploads/{workspace_id}/{project_id}/{uuid.uuid4()}.{extension}"

    upload_url = await generate_presigned_put(key, content_type, content_length)
    return UploadOut(upload_url=upload_url, key=key)
