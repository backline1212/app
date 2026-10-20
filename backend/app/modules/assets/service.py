import asyncio
import io
import uuid
import warnings
from datetime import UTC, datetime
from pathlib import PurePath
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase
from PIL import Image, UnidentifiedImageError
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.core.actor_access import resolve_actor_project_access
from app.core.config import get_settings
from app.core.errors import NotFoundError, ValidationError
from app.core.events import append_event
from app.core.session import Actor, GuestSession, Session, actor_identity
from app.modules.assets.repository import AssetRepository
from app.modules.assets.schemas import AssetCommentCreate, AssetOut, AssetUpdate, Region
from app.modules.comments.idempotency import request_fingerprint, require_matching_replay
from app.modules.comments.repository import CommentRepository
from app.modules.comments.schemas import CommentOut
from app.modules.comments.service import _broadcast_comment_event, _comment_out
from app.modules.pages.repository import PageRepository
from app.modules.projects.service import get_project
from app.modules.storage.r2_client import (
    _make_client,
    download_bytes_limited,
    generate_presigned_get,
)

MAX_ASSET_SIZE = 20 * 1024 * 1024


def inspect_asset(data: bytes, project_type: str) -> tuple[str, int, int | None, int | None]:
    if not data or len(data) > MAX_ASSET_SIZE:
        raise ValidationError("Upload a file smaller than 20 MB.")
    if project_type == "pdf":
        if not data.startswith(b"%PDF-"):
            raise ValidationError("Choose a valid PDF document.")
        try:
            reader = PdfReader(io.BytesIO(data), strict=True)
            if reader.is_encrypted:
                raise ValidationError("Upload a PDF without password protection.")
            count = len(reader.pages)
            if count < 1 or count > 200:
                raise ValidationError("PDFs must contain between 1 and 200 pages.")
            return "application/pdf", count, None, None
        except (PdfReadError, ValueError, RecursionError) as exc:
            raise ValidationError("This PDF could not be read.") from exc

    # SVG requires a sanitizer and sandboxed delivery; reject new uploads until both exist.
    header = data[:1024].lower()
    if b"<svg" in header:
        raise ValidationError("SVG uploads are not supported. Export as PNG, JPG, WebP or GIF.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as img:
                if img.format not in ("PNG", "JPEG", "WEBP", "GIF"):
                    raise ValidationError("Choose PNG, JPG, WebP or GIF images.")
                content_type = Image.MIME[img.format]
                width, height = img.size
                img.verify()
                return content_type, 1, width, height
    except (
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise ValidationError("This image is invalid or too large to display safely.") from exc


async def asset_out(doc: dict[str, Any]) -> AssetOut:
    return AssetOut(
        **{**doc, "id": str(doc["_id"]), "url": await generate_presigned_get(doc["key"])}
    )


async def upload_asset(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    project_id: str,
    actor: Session,
    filename: str,
    data: bytes,
) -> AssetOut:
    workspace_id = await resolve_actor_project_access(db, actor, project_id)
    project = await get_project(db, project_id=project_id, workspace_id=workspace_id)
    if project.project_type == "website":
        raise ValidationError("Files belong in an Images or PDF project.")
    limit = 1 if project.project_type == "pdf" else 50
    content_type, page_count, width, height = await asyncio.to_thread(
        inspect_asset, data, project.project_type
    )
    file_id = str(uuid.uuid4())
    key = f"assets/{workspace_id}/{project_id}/{file_id}"
    safe_name = PurePath(filename.replace("\\", "/")).name[:255] or "Untitled"
    await asyncio.to_thread(
        _make_client().put_object,
        Bucket=get_settings().r2_bucket_name,
        Key=key,
        Body=data,
        ContentType=content_type,
    )

    # The count check and the page+asset inserts must be atomic against a concurrent
    # upload to the same project - two uploads racing past a check-then-act count
    # (read len(existing), then insert) can both pass it and leave a project over its
    # file limit (e.g. 2 PDFs where exactly 1 is assumed everywhere else). The R2
    # object above is uploaded before the transaction and stays orphaned if the
    # transaction aborts on the limit check - an acceptable tradeoff (a stray object,
    # not a stray/duplicate DB row), same as this codebase's other best-effort
    # cleanup-on-failure paths.
    async def _create_within_limit(session: AsyncIOMotorClientSession) -> dict[str, Any]:
        await AssetRepository(db).serialize_changes(workspace_id, project_id, session)
        count = await AssetRepository(db).count(workspace_id, project_id, session=session)
        if count >= limit:
            raise ValidationError("This project has reached its file limit.")
        page = await PageRepository(db).create(
            project_id=project_id,
            workspace_id=workspace_id,
            url_normalized=f"backline://assets/{file_id}",
            title=safe_name,
            session=session,
        )
        return await AssetRepository(db).create(
            {
                "workspace_id": workspace_id,
                "project_id": project_id,
                "page_id": str(page["_id"]),
                "filename": safe_name,
                "key": key,
                "content_type": content_type,
                "size": len(data),
                "page_count": page_count,
                "width": width,
                "height": height,
                "created_at": datetime.now(UTC),
            },
            session=session,
        )

    async with await db.client.start_session() as session:
        doc: dict[str, Any] = await session.with_transaction(_create_within_limit)

    await append_event(
        db,
        workspace_id=workspace_id,
        type="asset.created",
        actor_type="member",
        actor_id=actor.user_id,
        payload={"project_id": project_id, "asset_id": str(doc["_id"]), "name": safe_name},
    )
    return await asset_out(doc)


async def list_assets(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    project_id: str,
    actor: Actor,
    *,
    include_archived: bool = False,
) -> list[AssetOut]:
    workspace_id = await resolve_actor_project_access(db, actor, project_id)
    if isinstance(actor, GuestSession):
        include_archived = False
    return [
        await asset_out(doc)
        for doc in await AssetRepository(db).list(
            workspace_id, project_id, include_archived=include_archived
        )
    ]


async def update_asset(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    project_id: str,
    asset_id: str,
    actor: Session,
    body: AssetUpdate,
) -> AssetOut:
    workspace_id = await resolve_actor_project_access(db, actor, project_id, "asset:upload")
    project = await get_project(db, project_id=project_id, workspace_id=workspace_id)
    repo = AssetRepository(db)

    async def _update(session: AsyncIOMotorClientSession) -> dict[str, Any]:
        await repo.serialize_changes(workspace_id, project_id, session)
        doc = await repo.find(workspace_id, project_id, asset_id, session=session)
        if doc is None:
            raise NotFoundError("File not found.")
        patch: dict[str, Any] = {}
        if body.filename is not None:
            patch["filename"] = body.filename
            await PageRepository(db).update(
                workspace_id,
                doc["page_id"],
                {"title": body.filename},
                session=session,
            )
        if body.archived is not None:
            if not body.archived and doc.get("archived_at") is not None:
                limit = 1 if project.project_type == "pdf" else 50
                if await repo.count(workspace_id, project_id, session=session) >= limit:
                    raise ValidationError("Archive an active file before restoring this one.")
            patch["archived_at"] = (
                (doc.get("archived_at") or datetime.now(UTC)) if body.archived else None
            )
        if patch:
            await repo.update(workspace_id, project_id, asset_id, patch, session=session)
        return {**doc, **patch}

    async with await db.client.start_session() as session:
        updated: dict[str, Any] = await session.with_transaction(_update)
    await append_event(
        db,
        workspace_id=workspace_id,
        type="asset.updated",
        actor_type="member",
        actor_id=actor.user_id,
        payload={
            "project_id": project_id,
            "asset_id": asset_id,
            "changes": body.model_dump(exclude_unset=True),
        },
    )
    return await asset_out(updated)


async def read_content(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    project_id: str,
    asset_id: str,
    actor: Actor,
) -> tuple[bytes, str, str]:
    workspace_id = await resolve_actor_project_access(db, actor, project_id)
    asset = await AssetRepository(db).find(workspace_id, project_id, asset_id)
    if asset is None or (isinstance(actor, GuestSession) and asset.get("archived_at")):
        raise NotFoundError("File not found.")
    data = await download_bytes_limited(asset["key"], MAX_ASSET_SIZE)
    return data, asset["content_type"], asset["filename"]


async def move_comment(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    project_id: str,
    asset_id: str,
    comment_id: str,
    actor: Session,
    region: Region,
) -> CommentOut:
    workspace_id = await resolve_actor_project_access(db, actor, project_id, "comment:reanchor")
    repo = AssetRepository(db)
    asset = await repo.find(workspace_id, project_id, asset_id)
    existing = await CommentRepository(db).find_by_id(comment_id)
    if (
        asset is None
        or asset.get("archived_at")
        or existing is None
        or existing["workspace_id"] != workspace_id
        or existing["page_id"] != asset["page_id"]
        or existing.get("parent_id")
        or existing.get("deleted_at")
        or existing.get("anchor", {}).get("kind") != "asset"
        or existing.get("anchor", {}).get("asset_id") != asset_id
    ):
        raise NotFoundError("File comment not found.")
    if region.page_number != existing["anchor"]["region"]["page_number"]:
        raise ValidationError("Move the comment within its original PDF page.")
    anchor = {"kind": "asset", "asset_id": asset_id, "region": region.model_dump()}
    if not await repo.move_comment(workspace_id, asset["page_id"], asset_id, comment_id, anchor):
        raise NotFoundError("File comment no longer exists.")
    await append_event(
        db,
        workspace_id=workspace_id,
        type="comment.reanchored",
        actor_type="member",
        actor_id=actor.user_id,
        payload={"project_id": project_id, "page_id": asset["page_id"], "comment_id": comment_id},
    )
    updated = await CommentRepository(db).find_by_id(comment_id)
    if updated is None:
        raise NotFoundError("File comment no longer exists.")
    comment = await _comment_out(db, updated)
    await _broadcast_comment_event(
        event_type="comment.updated",
        workspace_id=workspace_id,
        project_id=project_id,
        comment=comment,
    )
    return comment


async def create_comment(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    project_id: str,
    asset_id: str,
    actor: Actor,
    body: AssetCommentCreate,
) -> CommentOut:
    workspace_id = await resolve_actor_project_access(db, actor, project_id, "comment:create")
    asset = await AssetRepository(db).find(workspace_id, project_id, asset_id)
    if asset is None or asset.get("archived_at") is not None:
        raise NotFoundError("Asset not found.")
    if body.region.page_number > asset["page_count"]:
        raise ValidationError("The selected page does not exist.")
    if not body.body.strip():
        raise ValidationError("Comment text is required.")
    actor_type, actor_id = actor_identity(actor)
    candidate: dict[str, Any] = {
        "workspace_id": workspace_id,
        "project_id": project_id,
        "page_id": asset["page_id"],
        "parent_id": None,
        "author_type": actor_type,
        "author_member_id": actor.user_id if isinstance(actor, Session) else None,
        "author_guest_id": actor.guest_session_id if isinstance(actor, GuestSession) else None,
        "layer": "client" if isinstance(actor, GuestSession) else body.layer,
        "body": body.body.strip(),
        "status": "todo",
        "priority": "medium",
        "tags": list(dict.fromkeys(body.tags)),
        "assignee_id": None,
        "assignee_ids": [],
        "due_at": None,
        "anchor": {"kind": "asset", "asset_id": asset_id, "region": body.region.model_dump()},
        "recovery_status": "ok",
        "context_json": {"asset_id": asset_id, "page_number": body.region.page_number},
        "attachments": [],
        "screenshot_key": None,
        "capture_status": "ok",
        "created_at": datetime.now(UTC),
        "edited_at": None,
        "deleted_at": None,
        "client_request_id": body.client_request_id,
        "request_fingerprint": request_fingerprint(
            body.model_dump(mode="json", exclude={"client_request_id"})
        ),
    }
    if body.client_request_id:
        existing = await CommentRepository(db).find_by_client_request_id(
            workspace_id, body.client_request_id
        )
        if existing is not None:
            require_matching_replay(existing, candidate)
            return await _comment_out(db, existing)
    candidate["ticket_number"] = await CommentRepository(db).next_ticket_number(workspace_id)
    doc = await CommentRepository(db).create(candidate)
    if doc is not candidate:
        return await _comment_out(db, doc)
    comment = await _comment_out(db, doc)
    await append_event(
        db,
        workspace_id=workspace_id,
        type="comment.created",
        actor_type=actor_type,
        actor_id=actor_id,
        payload={"project_id": project_id, "comment_id": comment.id},
    )
    await _broadcast_comment_event(
        event_type="comment.created",
        workspace_id=workspace_id,
        project_id=project_id,
        comment=comment,
    )
    return comment
