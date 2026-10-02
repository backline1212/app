import csv
import io
from datetime import UTC, datetime
from typing import Any, cast
from urllib.parse import urlsplit

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
from app.core.events import append_event
from app.core.permissions import ProjectRole
from app.core.project_access import (
    VISIBILITY_PRIVATE,
    WORKSPACE_MANAGER_ROLES,
    access_settings,
    check_project_action,
    effective_project_role,
    project_role_source,
    session_hidden_project_ids,
    session_project_role,
)
from app.core.session import Session
from app.modules.billing.limits import require_within_plan_limit
from app.modules.clients.repository import ClientRepository
from app.modules.pages.repository import PageRepository
from app.modules.projects import events as project_events
from app.modules.projects.repository import ProjectRepository, is_untouched_sample
from app.modules.projects.schemas import (
    ProjectAccessDetailOut,
    ProjectAccessMemberIn,
    ProjectAccessOut,
    ProjectOut,
    ProjectPersonOut,
    ProjectRoleName,
    ProjectSettingsOut,
    ProjectSettingsUpdate,
    ProjectUpdate,
)


def _access_out(doc: dict[str, Any]) -> ProjectAccessOut:
    visibility, default_role, members = access_settings(doc)
    entries = [{"user_id": m["user_id"], "role": m["role"]} for m in members]
    if "access" not in doc and doc.get("created_by"):
        # A legacy project's creator manages it (core/project_access.py); show that.
        entries = [{"user_id": doc["created_by"], "role": "manager"}]
    return ProjectAccessOut.model_validate(
        {"visibility": visibility, "default_role": default_role.value, "members": entries}
    )


def _role_name(role: ProjectRole | None) -> ProjectRoleName | None:
    return cast(ProjectRoleName, role.value) if role is not None else None


def _project_out(doc: dict[str, Any], viewer: Session | None = None) -> ProjectOut:
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
        access=_access_out(doc),
        my_role=_role_name(session_project_role(doc, viewer)) if viewer is not None else None,
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


async def _validated_access_members(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    members: list[ProjectAccessMemberIn],
    *,
    creator_user_id: str,
    added_at: datetime,
    strict: bool = True,
) -> list[dict[str, Any]]:
    """The access entries a new project starts with: the creator as manager, then
    everyone requested who is a member of this workspace. Owners and admins already
    manage every project, so listing them would only go stale when their role changes.
    Not `strict` (copying another project's list), people who have left are skipped
    instead of refused."""
    from app.modules.workspaces.repository import MembershipRepository

    memberships = {
        m["user_id"]: m["role"]
        for m in await MembershipRepository(db).list_for_workspace(workspace_id)
    }
    entries = [
        {
            "user_id": creator_user_id,
            "role": "manager",
            "added_by": creator_user_id,
            "added_at": added_at,
        }
    ]
    seen = {creator_user_id}
    for member in members:
        if member.user_id in seen:
            continue
        workspace_role = memberships.get(member.user_id)
        if workspace_role is None and not strict:
            continue
        if workspace_role is None:
            raise ValidationError(
                "Everyone you add to a project must be a member of this workspace."
            )
        seen.add(member.user_id)
        if workspace_role in WORKSPACE_MANAGER_ROLES:
            continue
        entries.append(
            {
                "user_id": member.user_id,
                "role": member.role,
                "added_by": creator_user_id,
                "added_at": added_at,
            }
        )
    return entries


async def require_can_create_projects(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, workspace_role: str | None
) -> None:
    """Owners and admins can always create projects. Members can unless the workspace
    has turned that off (TDR-0056, Settings → Access)."""
    if workspace_role in WORKSPACE_MANAGER_ROLES:
        return
    from app.modules.workspaces.repository import WorkspaceRepository

    workspace = await WorkspaceRepository(db).find_by_id(workspace_id)
    if workspace is not None and workspace.get("members_can_create_projects", True) is False:
        raise PermissionDeniedError("Only owners and admins can create projects in this workspace.")


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
    visibility: str = "workspace",
    default_role: str = "editor",
    members: list[ProjectAccessMemberIn] | None = None,
    viewer: Session | None = None,
    strict_members: bool = True,
) -> ProjectOut:
    # Deferred import: share_links.service itself imports this module (to check a
    # project exists before creating/listing links for it), so importing it at module
    # scope here would be a circular import. Breaking it this way, rather than
    # duplicating share-link creation logic, keeps "one way to create a share link."
    from app.modules.share_links import service as share_link_service

    if viewer is not None:
        await require_can_create_projects(db, workspace_id, viewer.role)
    await require_within_plan_limit(db, workspace_id, "projects")

    repo = ProjectRepository(db)
    if client_id and not await ClientRepository(db).find(workspace_id, client_id):
        raise ValidationError("Client must belong to this workspace and be active.")
    now = datetime.now(UTC)
    access: dict[str, Any] = {
        "visibility": visibility,
        "default_role": default_role,
        "members": await _validated_access_members(
            db,
            workspace_id,
            members or [],
            creator_user_id=actor_user_id,
            added_at=now,
            strict=strict_members,
        ),
    }
    doc = await repo.create(
        workspace_id=workspace_id,
        name=name,
        target_origin=target_origin,
        created_by=actor_user_id,
        project_type=project_type,
        environment=environment,
        client_id=client_id,
        hero_url=hero_url,
        access=access,
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=project_events.PROJECT_CREATED,
        actor_type="member",
        actor_id=actor_user_id,
        payload={
            "project_id": str(doc["_id"]),
            "name": name,
            "target_origin": target_origin,
            "visibility": visibility,
        },
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

    for entry in access["members"]:
        if entry["user_id"] != actor_user_id:
            await _notify_access_granted(
                db,
                workspace_id=workspace_id,
                project_id=project_id,
                user_id=entry["user_id"],
                role=entry["role"],
                actor_user_id=actor_user_id,
            )
    if visibility == VISIBILITY_PRIVATE:
        await _publish_access_changed(workspace_id, project_id)

    return _project_out(doc, viewer)


async def find_or_create_project_for_origin(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    actor_user_id: str,
    target_origin: str,
    name: str | None = None,
    viewer: Session | None = None,
) -> ProjectOut:
    """Browser-extension "auto-detect current site" flow: reuses the existing
    website project for this origin if one exists, otherwise creates one - unlike
    create_project(), the caller doesn't need to already know whether a project
    exists for this site."""
    existing = await ProjectRepository(db).find_by_origin(workspace_id, target_origin)
    if existing is not None:
        if viewer is not None and session_project_role(existing, viewer) is None:
            # Creating a second project for the same site would split its feedback in
            # two; saying it exists is the useful answer.
            raise PermissionDeniedError(
                "This site already has a private project you aren't on. Ask a project "
                "manager to add you."
            )
        return _project_out(existing, viewer)

    default_name = name or urlsplit(target_origin).hostname or target_origin
    return await create_project(
        db,
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        name=default_name,
        target_origin=target_origin,
        viewer=viewer,
    )


async def list_projects(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    *,
    include_archived: bool = False,
    viewer: Session | None = None,
) -> list[ProjectOut]:
    """Every project the viewer can open. Without a viewer (internal callers only),
    every project in the workspace."""
    hidden = await session_hidden_project_ids(db, viewer) if viewer is not None else []
    docs = await ProjectRepository(db).list_for_workspace(
        workspace_id, include_archived=include_archived, exclude_ids=hidden
    )
    return [_project_out(doc, viewer) for doc in docs]


async def get_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    viewer: Session | None = None,
) -> ProjectOut:
    """With a viewer, also checks they can see the project (a private project they
    aren't on reads as not found) and fills in their role."""
    repo = ProjectRepository(db)
    doc = await repo.find_by_id(project_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    if viewer is not None:
        check_project_action(doc, viewer, "project:view")
    if doc.get("hard_delete_status") == "deleting":
        raise ConflictError("Permanent deletion is in progress for this project.")
    return _project_out(doc, viewer)


async def update_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor_user_id: str,
    name: str | None,
    target_origin: str | None,
    changes: ProjectUpdate | None = None,
    viewer: Session | None = None,
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

    # Deferred import: integrations/service.py imports ProjectRepository from this
    # module's sibling (projects/repository.py), not from here, so this isn't a true
    # cycle - deferred anyway to match the established convention every other
    # cross-module integrations-dispatch call site in this codebase already uses
    # (comments/service.py's _dispatch_integration_event).
    from app.modules.integrations.service import dispatch_project_updated_event

    await dispatch_project_updated_event(db, workspace_id=workspace_id, project_id=project_id)

    updated = await repo.find_by_id(project_id)
    assert updated is not None
    return _project_out(updated, viewer)


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
    viewer: Session | None = None,
) -> ProjectOut:
    project = await get_project(db, project_id=project_id, workspace_id=workspace_id)
    stored = await ProjectRepository(db).find_by_id(project_id)
    if project.archived_at is not None and not (stored and is_untouched_sample(stored)):
        # Restoring makes the project active again, so it counts against the plan the
        # same as creating one - otherwise archive, create, restore walks past the limit.
        await require_within_plan_limit(db, workspace_id, "projects")
    await ProjectRepository(db).update_metadata(workspace_id, project_id, {"archived_at": None})
    await append_event(
        db,
        workspace_id=workspace_id,
        type="project.restored",
        actor_type="member",
        actor_id=actor_user_id,
        payload={"project_id": project_id},
    )
    return await get_project(db, project_id=project_id, workspace_id=workspace_id, viewer=viewer)


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
    viewer: Session | None = None,
) -> ProjectOut:
    # 1. Fetch original project
    original = await get_project(db, project_id=project_id, workspace_id=workspace_id)

    # 2. Create the duplicated project. The copy keeps the source's audience (its
    # visibility, default role and listed people), and whoever duplicates it manages it.
    new_project = await create_project(
        db,
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        name=original.name + " (Copy)",
        target_origin=original.target_origin,
        project_type=original.project_type,
        environment=original.environment,
        client_id=original.client_id,
        visibility=original.access.visibility,
        default_role=original.access.default_role,
        members=[
            ProjectAccessMemberIn(user_id=member.user_id, role=member.role)
            for member in original.access.members
        ],
        viewer=viewer,
        strict_members=False,
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
        enable_cross_browser_render=original.settings.enable_cross_browser_render,
        slack_notifications_enabled=original.settings.slack_notifications_enabled,
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
    return await get_project(
        db, project_id=new_project.id, workspace_id=workspace_id, viewer=viewer
    )


_CSV_FORMULA_LEAD_CHARS = ("=", "+", "-", "@", "\t", "\r")


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
    `project:export` on this project + workspace scope; this function's own
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

    # Batched author-name resolution, same fix as D3 (dashboard/service.py's
    # list_tickets) - one $in query for every distinct assignee across the whole
    # export instead of a sequential find_by_id per assignee per comment.
    all_assignee_ids = {user_id for comment in comments for user_id in comment.assignee_ids}
    users_by_id = await UserRepository(db).find_many_by_ids(list(all_assignee_ids))

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
        assignee_names = [
            users_by_id[user_id]["name"] if user_id in users_by_id else "Former member"
            for user_id in comment.assignee_ids
        ]
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


# ── Project access (TDR-0056) ────────────────────────────────────────────────────


async def _publish_access_changed(workspace_id: str, project_id: str) -> None:
    """Tells every open dashboard in the workspace to refetch what it can see. The
    realtime layer also reads it to refresh its per-connection project filter
    (realtime/manager.py) before passing anything else on."""
    from app.modules.realtime.pubsub import publish

    await publish(
        f"workspace:{workspace_id}:all",
        event_type="project.access_changed",
        workspace_id=workspace_id,
        payload={"project_id": project_id},
    )


async def _notify_access_granted(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    user_id: str,
    role: str,
    actor_user_id: str,
) -> None:
    from app.modules.notifications.service import notify_project_access_granted

    await notify_project_access_granted(
        db,
        workspace_id=workspace_id,
        project_id=project_id,
        recipient_user_id=user_id,
        role=role,
        actor_user_id=actor_user_id,
    )


async def _stored_access_project(
    db: AsyncIOMotorDatabase[dict[str, Any]], project: dict[str, Any]
) -> dict[str, Any]:
    """A legacy project's implied access (open, creator manages) written down, so
    the first explicit change doesn't silently drop the creator's manager role."""
    if isinstance(project.get("access"), dict):
        return project
    from app.modules.workspaces.repository import MembershipRepository

    workspace_id = project["workspace_id"]
    project_id = str(project["_id"])
    members: list[dict[str, Any]] = []
    creator = project.get("created_by")
    if creator:
        membership = await MembershipRepository(db).find(workspace_id=workspace_id, user_id=creator)
        if membership is not None and membership["role"] not in WORKSPACE_MANAGER_ROLES:
            members.append(
                {
                    "user_id": creator,
                    "role": "manager",
                    "added_by": creator,
                    "added_at": project.get("created_at") or datetime.now(UTC),
                }
            )
    await ProjectRepository(db).set_access(
        workspace_id,
        project_id,
        {"visibility": "workspace", "default_role": "editor", "members": members},
        only_if_missing=True,
    )
    stored = await ProjectRepository(db).find_by_id(project_id)
    if stored is None:
        raise NotFoundError("Project not found.")
    return stored


async def _project_doc_in(
    db: AsyncIOMotorDatabase[dict[str, Any]], project_id: str, workspace_id: str
) -> dict[str, Any]:
    doc = await ProjectRepository(db).find_by_id(project_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    return doc


_ROLE_ORDER = {"manager": 0, "editor": 1, "commenter": 2, "viewer": 3, None: 4}


async def get_project_access(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    viewer: Session,
) -> ProjectAccessDetailOut:
    """Everyone in the workspace and what they can do on this project - the Share
    dialog's "People with access" list, readable by anyone who can open the project."""
    from app.modules.auth.repository import UserRepository
    from app.modules.workspaces.repository import MembershipRepository

    doc = await _project_doc_in(db, project_id, workspace_id)
    my_role = check_project_action(doc, viewer, "project:view")
    visibility, default_role, _ = access_settings(doc)
    memberships = await MembershipRepository(db).list_for_workspace(workspace_id)
    users = await UserRepository(db).find_many_by_ids([m["user_id"] for m in memberships])
    people: list[ProjectPersonOut] = []
    for membership in memberships:
        user = users.get(membership["user_id"])
        if user is None:
            continue
        role = effective_project_role(
            doc, user_id=membership["user_id"], workspace_role=membership["role"]
        )
        people.append(
            ProjectPersonOut(
                user_id=membership["user_id"],
                member_id=str(membership["_id"]),
                name=user.get("name") or user["email"],
                email=user["email"],
                avatar_url=user.get("avatar_url"),
                workspace_role=membership["role"],
                title=membership.get("title"),
                project_role=role.value if role else None,
                source=project_role_source(  # type: ignore[arg-type]
                    doc, user_id=membership["user_id"], workspace_role=membership["role"]
                ),
            )
        )
    people.sort(key=lambda p: (_ROLE_ORDER[p.project_role], p.name.lower()))
    return ProjectAccessDetailOut(
        project_id=project_id,
        visibility=visibility,  # type: ignore[arg-type]
        default_role=default_role.value,
        my_role=my_role.value,
        people=people,
    )


async def update_project_access(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor: Session,
    visibility: str | None,
    default_role: str | None,
) -> ProjectAccessDetailOut:
    doc = await _stored_access_project(db, await _project_doc_in(db, project_id, workspace_id))
    patch = {
        key: value
        for key, value in (("visibility", visibility), ("default_role", default_role))
        if value is not None
    }
    if patch:
        await ProjectRepository(db).update_access_settings(workspace_id, project_id, patch)
        await append_event(
            db,
            workspace_id=workspace_id,
            type=project_events.PROJECT_ACCESS_UPDATED,
            actor_type="member",
            actor_id=actor.user_id,
            payload={"project_id": project_id, "name": doc["name"], **patch},
        )
        await _publish_access_changed(workspace_id, project_id)
    return await get_project_access(
        db, project_id=project_id, workspace_id=workspace_id, viewer=actor
    )


async def set_project_member_role(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor: Session,
    user_id: str,
    role: str,
) -> ProjectAccessDetailOut:
    from app.modules.workspaces.repository import MembershipRepository

    membership = await MembershipRepository(db).find(workspace_id=workspace_id, user_id=user_id)
    if membership is None:
        raise ValidationError("That person isn't a member of this workspace.")
    if membership["role"] in WORKSPACE_MANAGER_ROLES:
        raise ValidationError(
            "Owners and admins already manage every project, so they don't need a project role."
        )
    doc = await _stored_access_project(db, await _project_doc_in(db, project_id, workspace_id))
    previous = effective_project_role(doc, user_id=user_id, workspace_role=membership["role"])
    await ProjectRepository(db).upsert_access_member(
        workspace_id,
        project_id,
        {
            "user_id": user_id,
            "role": role,
            "added_by": actor.user_id,
            "added_at": datetime.now(UTC),
        },
    )
    await append_event(
        db,
        workspace_id=workspace_id,
        type=project_events.PROJECT_MEMBER_ROLE_SET,
        actor_type="member",
        actor_id=actor.user_id,
        payload={
            "project_id": project_id,
            "name": doc["name"],
            "user_id": user_id,
            "role": role,
            "previous_role": previous.value if previous else None,
        },
    )
    if previous is None and user_id != actor.user_id:
        await _notify_access_granted(
            db,
            workspace_id=workspace_id,
            project_id=project_id,
            user_id=user_id,
            role=role,
            actor_user_id=actor.user_id,
        )
    await _publish_access_changed(workspace_id, project_id)
    return await get_project_access(
        db, project_id=project_id, workspace_id=workspace_id, viewer=actor
    )


async def remove_project_member(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor: Session,
    user_id: str,
) -> None:
    """Drops someone's explicit entry. On a workspace project they fall back to the
    default role; on a private one they lose access. Anyone may remove themselves;
    removing someone else takes a manager."""
    doc = await _project_doc_in(db, project_id, workspace_id)
    if user_id != actor.user_id:
        check_project_action(doc, actor, "project:manage_access")
    doc = await _stored_access_project(db, doc)
    removed = await ProjectRepository(db).remove_access_member(workspace_id, project_id, user_id)
    if not removed:
        return
    await append_event(
        db,
        workspace_id=workspace_id,
        type=project_events.PROJECT_MEMBER_REMOVED,
        actor_type="member",
        actor_id=actor.user_id,
        payload={"project_id": project_id, "name": doc["name"], "user_id": user_id},
    )
    await _publish_access_changed(workspace_id, project_id)
