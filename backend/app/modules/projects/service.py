import csv
import io
from typing import Any
from urllib.parse import urlsplit

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.events import append_event
from app.modules.clients.repository import ClientRepository
from app.modules.pages.repository import PageRepository
from app.modules.projects import events as project_events
from app.modules.projects.repository import ProjectRepository
from app.modules.projects.schemas import (
    ProjectOut,
    ProjectSettingsOut,
    ProjectSettingsUpdate,
    ProjectUpdate,
)


def _project_out(doc: dict[str, Any]) -> ProjectOut:
    # M-04: settings_json may be missing in documents from before this feature was
    # added, or may be incomplete (missing new fields or old fields). Merge with
    # sensible defaults so ProjectSettingsOut unpacking never fails.
    settings_json = doc.get("settings_json", {})
    settings_defaults = {
        "proxy_mode": False,
        "snippet_installed": False,
        "capture_device_details": False,
        "reanchor_on_deploy": False,
        "reviewer_can_resolve": False,
        "show_board_to_client": False,
        "client_digest_enabled": False,
    }
    settings_merged = {**settings_defaults, **settings_json}

    return ProjectOut(
        id=str(doc["_id"]),
        workspace_id=doc["workspace_id"],
        name=doc["name"],
        project_type=doc.get("project_type", "website"),
        environment=doc.get("environment", "live"),
        client_id=doc.get("client_id"),
        duplicated_from_project_id=doc.get("duplicated_from_project_id"),
        target_origin=doc["target_origin"],
        hero_url=doc.get("hero_url"),
        # .get(), not [] - projects created before this field existed have none, and
        # backfilling every prior row isn't worth it at this scale (no migration tooling
        # exists yet, per core/indexes.py's own docstring).
        created_by=doc.get("created_by"),
        settings=ProjectSettingsOut(**settings_merged),
        archived_at=doc["archived_at"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


async def create_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    actor_user_id: str,
    name: str,
    target_origin: str,
    project_type: str = "website",
    environment: str = "live",
    client_id: str | None = None,
    hero_url: str | None = None,
) -> ProjectOut:
    # Deferred import: share_links.service itself imports this module (to check a
    # project exists before creating/listing links for it), so importing it at module
    # scope here would be a circular import. Breaking it this way, rather than
    # duplicating share-link creation logic, keeps "one way to create a share link."
    from app.modules.share_links import service as share_link_service

    repo = ProjectRepository(db)
    if client_id and not await ClientRepository(db).find(workspace_id, client_id):
        raise ValidationError("Client must belong to this workspace and be active.")
    doc = await repo.create(
        workspace_id=workspace_id,
        name=name,
        target_origin=target_origin,
        created_by=actor_user_id,
        project_type=project_type,
        environment=environment,
        client_id=client_id,
        hero_url=hero_url,
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=project_events.PROJECT_CREATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"project_id": str(doc["_id"]), "name": name, "target_origin": target_origin},
    )

    # Onboarding tightening (20-Build-Plan.md Milestone 9): "install-free path first"
    # (F7/03-System-Architecture.md §3.3) means a brand-new project is shareable the
    # instant it exists, in proxy mode by default - no separate trip to the Share Links
    # screen before a PM can send something to a client.
    project_id = str(doc["_id"])
    await share_link_service.create_share_link(
        db,
        project_id=project_id,
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        mode="proxy",
        passcode=None,
        expires_at=None,
    )

    return _project_out(doc)


async def find_or_create_project_for_origin(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    actor_user_id: str,
    target_origin: str,
    name: str | None = None,
) -> ProjectOut:
    """Browser-extension "auto-detect current site" flow: reuses the existing
    website project for this origin if one exists, otherwise creates one - unlike
    create_project(), the caller doesn't need to already know whether a project
    exists for this site."""
    existing = await ProjectRepository(db).find_by_origin(workspace_id, target_origin)
    if existing is not None:
        return _project_out(existing)

    default_name = name or urlsplit(target_origin).hostname or target_origin
    return await create_project(
        db,
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        name=default_name,
        target_origin=target_origin,
    )


async def list_projects(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, *, include_archived: bool = False
) -> list[ProjectOut]:
    repo = ProjectRepository(db)
    docs = await repo.list_for_workspace(workspace_id, include_archived=include_archived)
    return [_project_out(doc) for doc in docs]


async def get_project(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, project_id: str, workspace_id: str
) -> ProjectOut:
    repo = ProjectRepository(db)
    doc = await repo.find_by_id(project_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    if doc.get("hard_delete_status") == "deleting":
        raise ConflictError("Permanent deletion is in progress for this project.")
    return _project_out(doc)


async def update_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
    name: str | None,
    target_origin: str | None,
    changes: ProjectUpdate | None = None,
) -> ProjectOut:
    repo = ProjectRepository(db)
    existing = await repo.find_by_id(project_id)
    if existing is None or existing["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")

    patch = (
        changes.model_dump(exclude_unset=True)
        if changes
        else {
            k: v for k, v in {"name": name, "target_origin": target_origin}.items() if v is not None
        }
    )
    for key in ("name", "target_origin", "environment"):
        if key in patch and (patch[key] is None or not str(patch[key]).strip()):
            raise ValidationError(f"{key} cannot be empty.")
    if "name" in patch:
        patch["name"] = patch["name"].strip()
    if patch.get("client_id") and not await ClientRepository(db).find(
        workspace_id, patch["client_id"]
    ):
        raise ValidationError("Client must belong to this workspace and be active.")
    await repo.update_metadata(workspace_id, project_id, patch)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=project_events.PROJECT_UPDATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"project_id": project_id, **patch},
    )

    updated = await repo.find_by_id(project_id)
    assert updated is not None
    return _project_out(updated)


async def archive_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
) -> None:
    repo = ProjectRepository(db)
    existing = await repo.find_by_id(project_id)
    if existing is None or existing["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")

    await repo.archive(project_id)
    await append_event(
        db,
        workspace_id=workspace_id,
        type=project_events.PROJECT_ARCHIVED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={"project_id": project_id, "name": existing["name"]},
    )


async def restore_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
) -> ProjectOut:
    await get_project(db, project_id=project_id, workspace_id=workspace_id)
    await ProjectRepository(db).update_metadata(workspace_id, project_id, {"archived_at": None})
    await append_event(
        db,
        workspace_id=workspace_id,
        type="project.restored",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"project_id": project_id},
    )
    return await get_project(db, project_id=project_id, workspace_id=workspace_id)


async def update_project_settings(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
    settings: ProjectSettingsUpdate,
) -> ProjectSettingsOut:
    """FD-AUD-018: persist the five review-settings flags.

    Uses $set with dot-notation paths so we only overwrite fields that were
    explicitly included in the request; proxy_mode and snippet_installed are
    managed by separate code paths and must not be cleared here.
    """
    existing = await get_project(db, project_id=project_id, workspace_id=workspace_id)
    patch = settings.model_dump(exclude_unset=True)
    if not patch:
        return existing.settings

    await ProjectRepository(db).update_settings(workspace_id, project_id, patch)
    await append_event(
        db,
        workspace_id=workspace_id,
        type="project.settings_updated",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"project_id": project_id, **patch},
    )
    updated = await get_project(db, project_id=project_id, workspace_id=workspace_id)
    return updated.settings


async def duplicate_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
) -> ProjectOut:
    # 1. Fetch original project
    original = await get_project(db, project_id=project_id, workspace_id=workspace_id)

    # 2. Create the duplicated project
    new_project = await create_project(
        db,
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        name=original.name + " (Copy)",
        target_origin=original.target_origin,
        project_type=original.project_type,
        environment=original.environment,
        client_id=original.client_id,
    )

    # 3. Copy project settings. proxy_mode/snippet_installed are deliberately excluded -
    # the new project gets its own fresh proxy share link from create_project() above,
    # so copying the source's proxy state here would be stale/incorrect.
    settings_patch = ProjectSettingsUpdate(
        capture_device_details=original.settings.capture_device_details,
        reanchor_on_deploy=original.settings.reanchor_on_deploy,
        reviewer_can_resolve=original.settings.reviewer_can_resolve,
        show_board_to_client=original.settings.show_board_to_client,
        client_digest_enabled=original.settings.client_digest_enabled,
    )
    await update_project_settings(
        db,
        project_id=new_project.id,
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        settings=settings_patch,
    )

    # 4. Copy website page metadata only. Revisions, recovery history, comments,
    # share-link tokens and private asset objects remain attached to the source.
    # Image/PDF projects therefore start with an empty file list because their
    # pages are asset-backed and are not meaningful without the intentionally
    # excluded object.
    source_pages = await PageRepository(db).list_for_project(workspace_id, project_id)
    copied_page_ids: list[str] = []
    if original.project_type == "website":
        for page in source_pages:
            copied = await PageRepository(db).create(
                project_id=new_project.id,
                workspace_id=workspace_id,
                url_normalized=page["url_normalized"],
                title=page.get("title"),
                sort_order=page.get("sort_order", 0),
            )
            copied_page_ids.append(str(copied["_id"]))

    await ProjectRepository(db).update_metadata(
        workspace_id,
        new_project.id,
        {"duplicated_from_project_id": project_id},
    )

    await append_event(
        db,
        workspace_id=workspace_id,
        type="project.duplicated",
        actor_type="member",
        actor_id=actor_user_id,
        payload={
            "project_id": new_project.id,
            "source_project_id": project_id,
            "new_project_id": new_project.id,
            "copied_page_ids": copied_page_ids,
            "copied_pages": len(copied_page_ids),
            "copied_comments": 0,
            "copied_revisions": 0,
            "copied_assets": 0,
        },
    )
    return await get_project(db, project_id=new_project.id, workspace_id=workspace_id)


_CSV_FORMULA_LEAD_CHARS = ("=", "+", "-", "@")


def _csv_safe_cell(value: str) -> str:
    """Neutralizes spreadsheet formula injection (OWASP CSV injection): a cell whose
    text starts with =, +, -, or @ is interpreted as a formula by Excel/Sheets when
    the exported file is later opened. Prefixing with a single quote keeps the
    visible text intact but stops it from being evaluated - the M-09 acceptance test
    this satisfies is literally "CSV formula payloads remain inert." Comment bodies,
    author names, and assignee display names are all attacker-reachable (a guest
    reviewer authors the first two; any workspace member controls their own display
    name and can be assigned to a comment), so all three columns need this, not just
    one."""
    text = str(value)
    if text and text[0] in _CSV_FORMULA_LEAD_CHARS:
        return "'" + text
    return text


async def export_project_comments(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
) -> str:
    """M-08: this previously returned a header-only stub - no comments were ever
    fetched. The caller (`GET /projects/{id}/export`) already enforces
    `project:manage` (member-only) + workspace scope; this function's own
    get_project call re-confirms the project belongs to this workspace before
    exporting anything from it."""
    await get_project(db, project_id=project_id, workspace_id=workspace_id)

    # Deferred import: comments.service transitively imports notifications.service,
    # which imports workspaces.repository - no cycle back to projects.service today,
    # but this mirrors create_project's existing share_link_service import above
    # rather than risk one as this module's import graph grows.
    from app.modules.auth.repository import UserRepository
    from app.modules.comments.service import list_comments_for_project

    comments = await list_comments_for_project(db, project_id=project_id, workspace_id=workspace_id)

    name_cache: dict[str, str] = {}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "layer",
            "status",
            "priority",
            "author_name",
            "body",
            "assignees",
            "due_at",
            "created_at",
        ]
    )
    for comment in comments:
        assignee_names = []
        for user_id in comment.assignee_ids:
            if user_id not in name_cache:
                user = await UserRepository(db).find_by_id(user_id)
                name_cache[user_id] = user["name"] if user else "Former member"
            assignee_names.append(name_cache[user_id])
        writer.writerow(
            [
                comment.id,
                comment.layer,
                comment.status,
                comment.priority,
                _csv_safe_cell(comment.author_name),
                _csv_safe_cell(comment.body),
                _csv_safe_cell("; ".join(assignee_names)),
                comment.due_at.isoformat() if comment.due_at else "",
                comment.created_at.isoformat(),
            ]
        )
    return output.getvalue()
