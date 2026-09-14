from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.core.actor_access import resolve_actor_project_access
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.events import append_event
from app.core.session import Actor, actor_identity
from app.modules.pages import events as page_events
from app.modules.pages.repository import PageRepository
from app.modules.pages.schemas import PageOut, PageReorder, PageUpdate
from app.modules.pages.url_normalize import normalize_url
from app.modules.projects.repository import ProjectRepository


def _page_out(doc: dict[str, Any], *, comment_count: int = 0) -> PageOut:
    return PageOut(
        id=str(doc["_id"]),
        project_id=doc["project_id"],
        url_normalized=doc["url_normalized"],
        title=doc.get("title"),
        sort_order=doc.get("sort_order", 0),
        comment_count=comment_count,
        first_seen_at=doc["first_seen_at"],
        latest_revision_id=doc.get("latest_revision_id"),
    )


async def register_page(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    actor: Actor,
    project_id: str,
    url: str,
    title: str | None,
) -> PageOut:
    """Idempotent on url_normalized (09-Snapshot-Engine.md, 11-Database.md §11.7) - a
    guest revisiting an already-registered page is a no-op, not a duplicate."""
    workspace_id = await resolve_actor_project_access(db, actor, project_id)
    url_normalized = normalize_url(url)

    repo = PageRepository(db)
    existing = await repo.find_by_normalized_url(workspace_id, project_id, url_normalized)
    if existing is not None:
        return _page_out(existing)

    try:
        doc = await repo.create(
            project_id=project_id,
            workspace_id=workspace_id,
            url_normalized=url_normalized,
            title=title,
        )
    except DuplicateKeyError:
        # Concurrent registration of the same URL (realistic for a widget loading on a
        # busy page) races past the find_by_normalized_url check above - fall back to
        # the doc the other request just created, keeping this genuinely idempotent
        # instead of 500ing.
        existing = await repo.find_by_normalized_url(workspace_id, project_id, url_normalized)
        if existing is not None:
            return _page_out(existing)
        raise
    actor_type, actor_id = actor_identity(actor)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=page_events.PAGE_REGISTERED,
        actor_type=actor_type,
        actor_id=actor_id,
        payload={"project_id": project_id, "url_normalized": url_normalized},
    )
    return _page_out(doc)


async def create_page(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    actor_user_id: str,
    url: str,
    title: str | None,
) -> PageOut:
    """Member-only page creation, separate from widget guest registration."""
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    if project.get("project_type", "website") != "website":
        raise ValidationError("Dashboard pages can only be added to website projects.")
    url_normalized = normalize_url(url)
    repo = PageRepository(db)
    if await repo.find_by_normalized_url(workspace_id, project_id, url_normalized):
        raise ConflictError("That page is already registered for this project.")
    existing = await repo.list_for_project(workspace_id, project_id)
    try:
        doc = await repo.create(
            project_id=project_id,
            workspace_id=workspace_id,
            url_normalized=url_normalized,
            title=title.strip() if title and title.strip() else None,
            sort_order=len(existing),
        )
    except DuplicateKeyError as exc:
        raise ConflictError("That page is already registered for this project.") from exc
    await append_event(
        db,
        workspace_id=workspace_id,
        type=page_events.PAGE_CREATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={
            "page_id": str(doc["_id"]),
            "project_id": project_id,
            "url_normalized": url_normalized,
        },
    )
    return _page_out(doc)


async def list_pages(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, project_id: str, workspace_id: str
) -> list[PageOut]:
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")

    docs = await PageRepository(db).list_for_project(workspace_id, project_id)
    # Sort by sort_order ascending, then first_seen_at descending
    docs.sort(key=lambda x: (x.get("sort_order", 0), -x["first_seen_at"].timestamp()))
    counts = await PageRepository(db).comment_counts(
        workspace_id, [str(doc["_id"]) for doc in docs]
    )
    return [_page_out(doc, comment_count=counts.get(str(doc["_id"]), 0)) for doc in docs]


async def update_page(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    page_id: str,
    changes: PageUpdate,
    actor_user_id: str,
) -> PageOut:
    """Member-only dashboard page management (M-01: was previously reachable by any
    actor including guests via resolve_actor_project_access - rename/reorder is a
    project-management action with no guest row in the permission matrix).

    M-08: `changes` was an untyped `dict[str, Any]` handed straight to the
    repository's $set - the router already built a typed PageUpdate and immediately
    threw the type away with `.model_dump()` before calling this. Taking the typed
    model here instead means this service function is the one place that decides
    which fields are mass-assignable (via `.model_dump(exclude_unset=True)`), not
    whatever dict a future caller happens to construct."""
    repo = PageRepository(db)
    existing = await repo.find_by_id(page_id)
    if not existing or existing["workspace_id"] != workspace_id:
        raise NotFoundError("Page not found.")

    patch = changes.model_dump(exclude_unset=True)
    if not patch:
        return _page_out(existing)
    await repo.update(workspace_id, page_id, patch)

    await append_event(
        db,
        workspace_id=workspace_id,
        type=page_events.PAGE_UPDATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={
            "page_id": page_id,
            "project_id": existing["project_id"],
            "changes": patch,
        },
    )

    updated = await repo.find_by_id(page_id)
    assert updated is not None
    return _page_out(updated)


async def reorder_pages(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    actor_user_id: str,
    body: PageReorder,
) -> list[PageOut]:
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    docs = await PageRepository(db).list_for_project(workspace_id, project_id)
    existing_ids = {str(doc["_id"]) for doc in docs}
    requested_ids = body.page_ids
    if len(requested_ids) != len(set(requested_ids)) or set(requested_ids) != existing_ids:
        raise ValidationError("Page order must include every project page exactly once.")
    await PageRepository(db).reorder(workspace_id, project_id, requested_ids)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=page_events.PAGES_REORDERED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"project_id": project_id, "page_ids": requested_ids},
    )
    return await list_pages(db, project_id=project_id, workspace_id=workspace_id)


async def delete_page(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    page_id: str,
    actor_user_id: str,
) -> None:
    """Delete only an empty page; referenced pages require project-level retention."""
    repo = PageRepository(db)
    existing = await repo.find_by_id(page_id)
    if not existing or existing["workspace_id"] != workspace_id:
        raise NotFoundError("Page not found.")

    counts = await repo.reference_counts(workspace_id, page_id)
    if any(counts.values()):
        raise ConflictError(
            "This page has review history and cannot be deleted. Archive or hard-delete "
            "the project through the retention workflow instead.",
            details={"references": counts},
        )

    await repo.delete(workspace_id, page_id)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=page_events.PAGE_DELETED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={
            "page_id": page_id,
            "project_id": existing["project_id"],
            "url_normalized": existing["url_normalized"],
        },
    )
