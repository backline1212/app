import hashlib
import json
import uuid
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import ValidationError as PydanticValidationError

from app.core.actor_access import resolve_actor_project_access
from app.core.errors import ValidationError
from app.core.session import Actor, actor_identity
from app.modules.storage.quota import reserve_bytes, store_bytes
from app.modules.storage.quota_repository import StorageQuotaRepository
from app.modules.storage.r2_client import generate_presigned_put, head_upload
from app.modules.storage.repository import UploadRepository
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
    "video/webm": "webm",
    "video/mp4": "mp4",
    "audio/webm": "weba",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
}


def is_project_upload(key: str, workspace_id: str, project_id: str) -> bool:
    """Only object namespaces issued for review uploads, including legacy screenshots."""
    prefixes = (
        f"uploads/{workspace_id}/{project_id}/",
        f"screenshots/{workspace_id}/{project_id}/",
    )
    return any(
        key.startswith(prefix)
        and bool(key[len(prefix) :])
        and "/" not in key[len(prefix) :]
        and "\\" not in key[len(prefix) :]
        and key[len(prefix) :] not in (".", "..")
        for prefix in prefixes
    )


def require_project_upload(key: str, workspace_id: str, project_id: str) -> None:
    if not is_project_upload(key, workspace_id, project_id):
        raise ValidationError("Upload does not belong to this project.")


async def validate_upload_reference(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    actor: Actor,
    workspace_id: str,
    project_id: str,
    key: str,
    content_type: str | None = None,
    screenshot: bool = False,
) -> None:
    """New references must be issued to this actor and actually exist as declared."""
    require_project_upload(key, workspace_id, project_id)
    record = await UploadRepository(db).find(workspace_id, project_id, key)
    actor_type, actor_id = actor_identity(actor)
    if record is None or (record["actor_type"], record["actor_id"]) != (actor_type, actor_id):
        raise ValidationError("Attach a file uploaded in your current review session.")
    expected_type = record["content_type"]
    if (content_type is not None and content_type != expected_type) or (
        screenshot and not expected_type.startswith("image/")
    ):
        raise ValidationError("The attachment type does not match its upload.")
    metadata = await head_upload(key)
    if metadata != (expected_type, record["content_length"]):
        raise ValidationError("The file upload is incomplete or changed. Upload it again.")
    await StorageQuotaRepository(db).mark_stored(workspace_id, key, metadata[1])


async def _record_upload(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    actor: Actor,
    key: str,
    workspace_id: str,
    project_id: str,
    content_type: str,
    content_length: int,
) -> None:
    actor_type, actor_id = actor_identity(actor)
    await UploadRepository(db).create(
        key=key,
        workspace_id=workspace_id,
        project_id=project_id,
        actor_type=actor_type,
        actor_id=actor_id,
        content_type=content_type,
        content_length=content_length,
    )


def _upload_key(workspace_id: str, project_id: str, content_type: str) -> str:
    extension = _EXTENSION_BY_CONTENT_TYPE[content_type]
    return f"uploads/{workspace_id}/{project_id}/{uuid.uuid4()}.{extension}"


def _direct_upload_key(
    workspace_id: str,
    project_id: str,
    actor: Actor,
    content_type: str,
    data: bytes,
) -> str:
    """Scope content-based replay to one actor and one project, without shared dedupe."""
    actor_type, actor_id = actor_identity(actor)
    digest = hashlib.sha256(data).hexdigest()
    identity = json.dumps(
        [workspace_id, project_id, actor_type, actor_id, content_type, digest],
        separators=(",", ":"),
    ).encode()
    replay_id = hashlib.sha256(identity).hexdigest()
    extension = _EXTENSION_BY_CONTENT_TYPE[content_type]
    return f"uploads/{workspace_id}/{project_id}/{replay_id}.{extension}"


async def create_upload_url(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    actor: Actor,
    project_id: str,
    content_type: str,
    content_length: int,
) -> UploadOut:
    workspace_id = await resolve_actor_project_access(db, actor, project_id, "comment:create")

    # Keyed by a fresh uuid4, not a comment_id - the upload happens before the comment
    # exists (docs/tdr/0002-snippet-mode-shares-the-share-link-model.md). "uploads/", not
    # "screenshots/" - this same endpoint now backs both a comment's own screenshot and
    # its attachments, so the key shouldn't imply it's only ever a screenshot.
    key = _upload_key(workspace_id, project_id, content_type)

    await reserve_bytes(
        db,
        workspace_id=workspace_id,
        project_id=project_id,
        key=key,
        size=content_length,
        release_missing=False,
    )
    upload_url = await generate_presigned_put(key, content_type, content_length)
    await _record_upload(
        db,
        actor=actor,
        key=key,
        workspace_id=workspace_id,
        project_id=project_id,
        content_type=content_type,
        content_length=content_length,
    )
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
    workspace_id = await resolve_actor_project_access(db, actor, project_id, "comment:create")
    key = _direct_upload_key(workspace_id, project_id, actor, validated.content_type, data)
    await store_bytes(
        db,
        workspace_id=workspace_id,
        project_id=project_id,
        key=key,
        data=data,
        content_type=validated.content_type,
    )
    await _record_upload(
        db,
        actor=actor,
        key=key,
        workspace_id=workspace_id,
        project_id=project_id,
        content_type=validated.content_type,
        content_length=len(data),
    )
    return StoredUploadOut(key=key)
