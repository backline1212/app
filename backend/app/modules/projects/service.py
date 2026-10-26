import base64
import binascii
import csv
import io
import re
from datetime import UTC, datetime
from typing import Any, cast
from urllib.parse import urlsplit

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.creation_idempotency import request_fingerprint, require_creation_replay
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError, ValidationError
from app.core.events import append_event
from app.core.permissions import PROJECT_ROLE_RANK, ProjectRole
from app.core.project_access import (
    VISIBILITY_PRIVATE,
    VISIBILITY_WORKSPACE,
    WORKSPACE_MANAGER_ROLES,
    access_settings,
    check_project_action,
    effective_project_role,
    project_role_source,
    session_hidden_project_ids,
    session_project_role,
)
from app.core.review_url import project_start_url, review_origin
from app.core.session import Session
from app.modules.billing.limits import require_within_plan_limit, run_plan_change
from app.modules.clients.repository import ClientRepository
from app.modules.clients.schemas import ClientCreate
from app.modules.pages.repository import PageRepository
from app.modules.projects import events as project_events
from app.modules.projects import preview_service
from app.modules.projects.repository import ProjectRepository, is_untouched_sample
from app.modules.projects.schemas import (
    FileApprovalSummary,
    PreviewImageOut,
    ProjectAccessDetailOut,
    ProjectAccessMemberIn,
    ProjectAccessOut,
    ProjectOut,
    ProjectPersonOut,
    ProjectRoleName,
    ProjectSettingsOut,
    ProjectSettingsUpdate,
    ProjectUpdate,
    normalize_origin,
)
from app.modules.workspaces.repository import MembershipRepository


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
        "client_review_mode": "ask",
    }
    settings_merged = {**settings_defaults, **settings_json}

    return ProjectOut(
        metadata_version=int(doc.get("metadata_version", 0)),
        id=str(doc["_id"]),
        workspace_id=doc["workspace_id"],
        name=doc["name"],
        project_type=doc.get("project_type", "website"),
        variant=doc.get("variant"),
        environment=doc.get("environment", "live"),
        client_id=doc.get("client_id"),
        duplicated_from_project_id=doc.get("duplicated_from_project_id"),
        access=_access_out(doc),
        my_role=_role_name(session_project_role(doc, viewer)) if viewer is not None else None,
        target_origin=review_origin(doc["target_origin"]),
        start_url=project_start_url(doc) or None,
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
    session: AsyncIOMotorClientSession | None = None,
) -> list[dict[str, Any]]:
    """The access entries a new project starts with: the creator as manager, then
    everyone requested who is a member of this workspace. Owners and admins already
    manage every project, so listing them would only go stale when their role changes.
    Not `strict` (copying another project's list), people who have left are skipped
    instead of refused."""
    from app.modules.workspaces.repository import MembershipRepository

    memberships = {
        m["user_id"]: m["role"]
        for m in await MembershipRepository(db).list_for_workspace(workspace_id, session=session)
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
    variant: str | None = None,
    visibility: str = "workspace",
    default_role: str = "editor",
    members: list[ProjectAccessMemberIn] | None = None,
    viewer: Session | None = None,
    strict_members: bool = True,
    new_client: ClientCreate | None = None,
    client_request_id: str | None = None,
    resolve_existing_origin: bool = False,
    client_review_mode: str | None = None,
) -> ProjectOut:
    # Deferred import: share_links.service itself imports this module (to check a
    # project exists before creating/listing links for it), so importing it at module
    # scope here would be a circular import. Breaking it this way, rather than
    # duplicating share-link creation logic, keeps "one way to create a share link."
    from app.modules.clients.service import create_client
    from app.modules.share_links import service as share_link_service

    if viewer is not None:
        await require_can_create_projects(db, workspace_id, viewer.role)

    try:
        start_url = normalize_origin(target_origin) if project_type == "website" else None
    except ValueError as exc:
        # Internal duplication/resolve callers can read legacy URLs that predate
        # current request validation. Give them a correctable error, not a 500.
        raise ValidationError(str(exc)) from exc
    target_origin = review_origin(start_url) if start_url else ""

    repo = ProjectRepository(db)
    if client_id and new_client:
        raise ValidationError("Choose an existing client or create a new one.")
    fingerprint = request_fingerprint(
        {
            "name": name,
            "start_url": start_url,
            "project_type": project_type,
            # Only when set, so a classic project's replay fingerprint is unchanged.
            **({"variant": variant} if variant else {}),
            "environment": environment,
            "client_id": client_id,
            "hero_url": hero_url,
            "visibility": visibility,
            "default_role": default_role,
            "members": [m.model_dump(mode="json") for m in members or []],
            "new_client": new_client.model_dump(mode="json") if new_client else None,
            **({"client_review_mode": client_review_mode} if client_review_mode else {}),
        }
    )

    async def create(session: AsyncIOMotorClientSession) -> tuple[dict[str, Any], bool]:
        if resolve_existing_origin:
            existing = await repo.find_by_origin(workspace_id, target_origin, session=session)
            if existing is not None:
                if viewer is not None:
                    check_project_action(existing, viewer, "project:view")
                return existing, False
        if client_request_id:
            existing = await repo.find_by_request(workspace_id, client_request_id, session=session)
            if existing is not None:
                require_creation_replay(existing, actor_id=actor_user_id, fingerprint=fingerprint)
                if viewer is not None:
                    check_project_action(existing, viewer, "project:view")
                return existing, False
        await require_within_plan_limit(db, workspace_id, "projects", session=session)
        if client_id and not await ClientRepository(db).find(
            workspace_id, client_id, session=session
        ):
            raise ValidationError("Client must belong to this workspace and be active.")
        access: dict[str, Any] = {
            "visibility": visibility,
            "default_role": default_role,
            "members": await _validated_access_members(
                db,
                workspace_id,
                members or [],
                creator_user_id=actor_user_id,
                added_at=datetime.now(UTC),
                strict=strict_members,
                session=session,
            ),
        }
        selected_client_id = client_id
        if new_client is not None:
            selected_client_id = (
                await create_client(db, workspace_id, actor_user_id, new_client, session=session)
            ).id
        doc = await repo.create(
            workspace_id=workspace_id,
            name=name,
            target_origin=target_origin,
            created_by=actor_user_id,
            project_type=project_type,
            variant=variant,
            environment=environment,
            client_id=selected_client_id,
            hero_url=hero_url,
            access=access,
            start_url=start_url,
            client_request_id=client_request_id,
            request_fingerprint=fingerprint,
            settings={"client_review_mode": client_review_mode} if client_review_mode else None,
            session=session,
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
            session=session,
        )
        await share_link_service.create_initial_link(
            db,
            project_id=str(doc["_id"]),
            workspace_id=workspace_id,
            actor_user_id=actor_user_id,
            session=session,
        )
        return doc, True

    doc, was_created = await run_plan_change(db, workspace_id, create)
    project_id = str(doc["_id"])
    for entry in doc["access"]["members"] if was_created else []:
        if entry["user_id"] != actor_user_id:
            await _notify_access_granted(
                db,
                workspace_id=workspace_id,
                project_id=project_id,
                user_id=entry["user_id"],
                role=entry["role"],
                actor_user_id=actor_user_id,
            )
    if was_created and visibility == VISIBILITY_PRIVATE:
        await _publish_access_changed(workspace_id, project_id)

    return (await preview_service.with_previews(db, [doc], [_project_out(doc, viewer)]))[0]


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
        resolve_existing_origin=True,
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
    outs = await preview_service.with_previews(
        db, docs, [_project_out(doc, viewer) for doc in docs]
    )
    from app.modules.assets.repository import AssetRepository

    file_projects = [out.id for out in outs if (out.project_type or "website") != "website"]
    summary = await AssetRepository(db).approval_summary(workspace_id, file_projects)
    return [
        out.model_copy(update={"file_approval": FileApprovalSummary(**summary[out.id])})
        if out.id in summary
        else out
        for out in outs
    ]


async def get_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    viewer: Session | None = None,
    with_preview: bool = False,
) -> ProjectOut:
    """With a viewer, also checks they can see the project (a private project they
    aren't on reads as not found) and fills in their role. `with_preview` signs the
    card screenshot's URL - only worth it for a response the dashboard renders, not
    the many internal callers that check a project exists."""
    repo = ProjectRepository(db)
    doc = await repo.find_by_id(project_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    if viewer is not None:
        check_project_action(doc, viewer, "project:view")
    if doc.get("hard_delete_status") == "deleting":
        raise ConflictError("Permanent deletion is in progress for this project.")
    if with_preview:
        return (await preview_service.with_previews(db, [doc], [_project_out(doc, viewer)]))[0]
    return _project_out(doc, viewer)


async def refresh_project_preview(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    viewer: Session | None = None,
) -> ProjectOut:
    doc = await ProjectRepository(db).find_by_id(project_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    if doc.get("project_type", "website") != "website":
        raise ValidationError("Only website projects have a site preview.")
    if doc.get("archived_at") is not None:
        raise ValidationError("Restore this project to refresh its preview.")
    await preview_service.queue_capture(db, doc, force=True)
    return await get_project(
        db, project_id=project_id, workspace_id=workspace_id, viewer=viewer, with_preview=True
    )


async def offer_preview_image(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    data_url: str,
    asset_id: str | None = None,
) -> PreviewImageOut:
    doc = await ProjectRepository(db).find_by_id(project_id)
    if doc is None or doc["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    match = re.fullmatch(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)", data_url)
    if match is None:
        raise ValidationError("Send a JPEG, PNG or WebP image as a base64 data URL.")
    try:
        picture = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValidationError("The image data could not be read.") from exc
    if asset_id is not None:
        from app.modules.assets.repository import AssetRepository

        asset = await AssetRepository(db).find(workspace_id, project_id, asset_id)
        if asset is None or asset.get("archived_at") or asset.get("superseded_by"):
            raise ValidationError("That file isn't a current file of this project.")
    used = await preview_service.store_member_capture(db, doc, picture, asset_id=asset_id)
    return PreviewImageOut(used=used)


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
    from app.modules.clients.service import create_client
    from app.modules.deploy_sync.service import cancel_for_project_change

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
    expected_version = patch.pop("expected_metadata_version", None)
    request_id = patch.pop("client_request_id", None)
    fingerprint = request_fingerprint(patch)
    for key in ("name", "target_origin", "environment"):
        if key in patch and (patch[key] is None or not str(patch[key]).strip()):
            raise ValidationError(f"{key} cannot be empty.")
    if "name" in patch:
        patch["name"] = patch["name"].strip()
    if "target_origin" in patch:
        patch["start_url"] = normalize_origin(patch["target_origin"])
        patch["target_origin"] = review_origin(patch["start_url"])
    new_client = patch.pop("new_client", None)
    settings_patch = {
        key: value
        for key, value in (patch.pop("settings", None) or {}).items()
        if value is not None
    }

    # One document mutation: invalid metadata/client never leaves settings partly
    # saved. Dot paths preserve unrelated settings during concurrent changes.
    async def update(session: AsyncIOMotorClientSession) -> bool:
        current = await repo.find_by_id(project_id, session=session)
        if current is None or current["workspace_id"] != workspace_id:
            raise NotFoundError("Project not found.")
        if viewer is not None:
            membership = await MembershipRepository(db).find(
                workspace_id=workspace_id, user_id=viewer.user_id, session=session
            )
            if membership is None or membership["role"] != viewer.role:
                raise PermissionDeniedError("Workspace access changed. Reopen the workspace.")
            check_project_action(current, viewer, "project:update")
        previous_request = current.get("last_metadata_request") or {}
        if request_id and previous_request.get("id") == request_id:
            if (
                previous_request.get("actor_id") != actor_user_id
                or previous_request.get("fingerprint") != fingerprint
                or previous_request.get("expected_version") != expected_version
            ):
                raise ConflictError("This save request already names different project changes.")
            return False
        if (
            expected_version is not None
            and int(current.get("metadata_version", 0)) != expected_version
        ):
            raise ConflictError(
                "Project details changed while this form was open. Copy your draft, "
                "then load the latest details before saving again."
            )
        next_state = {**current, **patch}
        if patch.get("client_id") and not await ClientRepository(db).find(
            workspace_id, patch["client_id"], session=session
        ):
            raise ValidationError("Client must belong to this workspace and be active.")
        if (
            current.get("archived_at") is None
            and is_untouched_sample(current)
            and not is_untouched_sample(next_state)
        ):
            await require_within_plan_limit(db, workspace_id, "projects", session=session)
        transaction_patch = {**patch}
        if new_client is not None:
            transaction_patch["client_id"] = (
                await create_client(
                    db,
                    workspace_id,
                    actor_user_id,
                    ClientCreate.model_validate(new_client),
                    session=session,
                )
            ).id
        await repo.update_metadata(
            workspace_id,
            project_id,
            {
                **transaction_patch,
                **{f"settings_json.{key}": value for key, value in settings_patch.items()},
                **(
                    {
                        "last_metadata_request": {
                            "id": request_id,
                            "actor_id": actor_user_id,
                            "fingerprint": fingerprint,
                            "expected_version": expected_version,
                        }
                    }
                    if request_id
                    else {}
                ),
            },
            session=session,
        )
        await cancel_for_project_change(db, current, next_state, session=session)
        await append_event(
            db,
            workspace_id=workspace_id,
            type=project_events.PROJECT_UPDATED,
            actor_type="member",
            actor_id=actor_user_id,
            payload={
                "project_id": project_id,
                **transaction_patch,
                **({"settings": settings_patch} if settings_patch else {}),
            },
            session=session,
        )
        # Keep notification intent in the same transaction as the metadata and
        # activity event. The minute worker sweep can recover even if Redis is down
        # immediately after this request commits.
        from app.modules.integrations.dispatch_repository import IntegrationDispatchRepository
        from app.modules.integrations.factory import NOTIFIER_TYPES
        from app.modules.integrations.repository import IntegrationRepository

        integrations = await IntegrationRepository(db).list_for_workspace_in_transaction(
            workspace_id, session=session
        )
        await IntegrationDispatchRepository(db).create_project_updated(
            workspace_id=workspace_id,
            project_id=project_id,
            project_name=str(transaction_patch.get("name", current["name"])),
            integration_ids=[
                str(item["_id"])
                for item in integrations
                if item["type"] in NOTIFIER_TYPES
                and (not item.get("project_scope") or item["project_scope"] == project_id)
            ],
            session=session,
        )
        return True

    await run_plan_change(db, workspace_id, update)

    updated = await repo.find_by_id(project_id)
    assert updated is not None
    # A changed review URL makes the card's screenshot due again (preview_service).
    return (await preview_service.with_previews(db, [updated], [_project_out(updated, viewer)]))[0]


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
    await get_project(db, project_id=project_id, workspace_id=workspace_id)
    repo = ProjectRepository(db)

    async def restore(session: AsyncIOMotorClientSession) -> None:
        stored = await repo.find_by_id(project_id, session=session)
        if stored is None or stored["workspace_id"] != workspace_id:
            raise NotFoundError("Project not found.")
        if stored.get("archived_at") is not None and not is_untouched_sample(stored):
            await require_within_plan_limit(db, workspace_id, "projects", session=session)
        await repo.update_metadata(workspace_id, project_id, {"archived_at": None}, session=session)

    await run_plan_change(db, workspace_id, restore)
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
    patch = settings.model_dump(exclude_unset=True, exclude_none=True)
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
        target_origin=original.start_url or original.target_origin,
        project_type=original.project_type,
        variant=original.variant,
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
        client_review_mode=original.settings.client_review_mode,
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
    if user_id == actor.user_id and session_project_role(doc, actor) != ProjectRole.MANAGER:
        # Leaving a workspace project falls back to its default role; that must not be a
        # way round a lower role a manager gave you (e.g. viewer -> default editor).
        visibility, default_role, members = access_settings(doc)
        own = next((m for m in members if m["user_id"] == user_id), None)
        if (
            own is not None
            and visibility == VISIBILITY_WORKSPACE
            and PROJECT_ROLE_RANK[default_role] > PROJECT_ROLE_RANK[ProjectRole(own["role"])]
        ):
            raise PermissionDeniedError(
                "Leaving would give you more access than your current role. Ask a "
                "project manager to change it."
            )
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
