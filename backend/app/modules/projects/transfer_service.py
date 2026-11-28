"""Moving a project, archived or not, to another workspace (TDR-0243).

Order matters: lock the project, copy its files to the destination's paths, re-home every
record in one transaction, then delete the old files. Until the transaction commits the
project is still wholly in the old workspace; after it, wholly in the new one."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from dataclasses import dataclass
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from app.core.arq_pool import get_arq_pool
from app.core.config import get_settings
from app.core.errors import (
    ConflictError,
    ExternalServiceError,
    NotFoundError,
    PermissionDeniedError,
    PlanLimitExceededError,
    ValidationError,
)
from app.core.events import append_event
from app.core.session import Session
from app.modules.auth.repository import UserRepository
from app.modules.billing.limits import require_within_plan_limit, run_plan_change
from app.modules.billing.plans import effective_plan_id, get_plan_definition
from app.modules.billing.repository import BillingRepository
from app.modules.projects import events as project_events
from app.modules.projects import transfer_choices
from app.modules.projects.repository import ProjectRepository, is_untouched_sample
from app.modules.projects.schemas import (
    ProjectTransfer,
    ProjectTransferOut,
    ProjectTransferPreview,
    ProjectTransferUnassigned,
)
from app.modules.projects.transfer_activity import restricted_audience
from app.modules.projects.transfer_repository import MoveResult, ProjectTransferRepository
from app.modules.storage.gc import run_object_gc
from app.modules.storage.quota_repository import StorageQuotaRepository
from app.modules.storage.r2_client import copy_object, delete_object, list_object_keys
from app.modules.storage.repository import ObjectGcRepository
from app.modules.workspaces.repository import MembershipRepository, WorkspaceRepository
from app.modules.workspaces.service import announce_new_members

logger = logging.getLogger(__name__)

# Moving a project takes it away from one team and hands it to another, so it asks for the
# role that may also delete a project, on both sides.
TRANSFER_ROLES = frozenset({"owner", "admin"})
# Stored-file namespaces that carry the workspace in their path. Snapshots don't: they are
# keyed by project only and stay where they are.
_WORKSPACE_PREFIXES = ("screenshots", "uploads", "assets", "renders", "previews")
_COPIES_AT_ONCE = 8
# Well inside TRANSFER_LOCK_TTL, so a long copy never looks abandoned.
_LOCK_RENEWAL_SECONDS = 60
_CHANGED = "This project changed during the move. Nothing was moved; try again."


def _prefixes(source_id: str, target_id: str, project_id: str) -> list[tuple[str, str]]:
    return [
        (f"{kind}/{source_id}/{project_id}/", f"{kind}/{target_id}/{project_id}/")
        for kind in _WORKSPACE_PREFIXES
    ]


async def _require_storage_room(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    size: int,
    *,
    session: AsyncIOMotorClientSession | None = None,
) -> None:
    if not get_settings().storage_quota_enforcement_enabled or size <= 0:
        return
    workspace = await BillingRepository(db).find_workspace(workspace_id, session=session)
    assert workspace is not None
    if (
        not workspace.get("storage_inventory_ready")
        or workspace.get("storage_inventory_bucket") != get_settings().r2_bucket_name
    ):
        raise ExternalServiceError("Storage accounting is being prepared. Try again shortly.")
    plan = get_plan_definition(effective_plan_id(workspace))
    limit = int(plan["storage_gb"]) * 1_000_000_000
    used = await StorageQuotaRepository(db).usage(workspace_id, session=session)
    if used + size > limit:
        raise PlanLimitExceededError(
            "The destination workspace does not have enough storage left for this project.",
            details={
                "resource": "storage",
                "current": used,
                "requested": size,
                "limit": limit,
                "plan_id": plan["id"],
            },
        )


async def _copy_files(moves: list[tuple[str, str]]) -> None:
    gate = asyncio.Semaphore(_COPIES_AT_ONCE)

    async def copy(old: str, new: str) -> None:
        async with gate:
            await copy_object(old, new)

    # Every copy finishes, even after one fails, so the clean-up below sees them all.
    results = await asyncio.gather(*(copy(old, new) for old, new in moves), return_exceptions=True)
    failed = next((result for result in results if isinstance(result, BaseException)), None)
    if failed is not None:
        raise ExternalServiceError(
            "The project's files could not be copied. Nothing was moved; try again."
        ) from failed


async def _discard_copies(keys: list[str]) -> None:
    for key in keys:
        try:
            await delete_object(key)
        except Exception:
            logger.exception("Could not remove an unused copy after a failed project move")


async def _keep_lock(
    repo: ProjectTransferRepository, workspace_id: str, project_id: str, transfer_id: str
) -> None:
    while True:
        await asyncio.sleep(_LOCK_RENEWAL_SECONDS)
        try:
            await repo.renew(workspace_id, project_id, transfer_id)
        except Exception:
            logger.exception("Could not renew the move lock on project %s", project_id)


async def _stop(task: asyncio.Task[None]) -> None:
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


async def _list_files(prefixes: list[tuple[str, str]]) -> list[str]:
    try:
        return await list_object_keys([old for old, _ in prefixes])
    except Exception as exc:
        raise ExternalServiceError(
            "The project's files could not be listed. Nothing was moved; try again."
        ) from exc


async def _require_still_allowed(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    source_id: str,
    target_id: str,
    user_id: str,
    session: AsyncIOMotorClientSession,
) -> None:
    """Roles and the destination can change while files are being copied."""
    for workspace_id in (source_id, target_id):
        membership = await MembershipRepository(db).find(
            workspace_id=workspace_id, user_id=user_id, session=session
        )
        if membership is None or membership["role"] not in TRANSFER_ROLES:
            raise PermissionDeniedError("Your access changed during the move. Nothing was moved.")
    target = await BillingRepository(db).find_workspace(target_id, session=session)
    if target is None or target.get("closed_at") is not None:
        raise NotFoundError("Workspace not found.")


async def _delete_old_files(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    transfer_id: str,
) -> bool:
    """True when some old files are still waiting to be deleted; a worker job retries."""
    try:
        counts = await run_object_gc(
            db, workspace_id=workspace_id, project_id=project_id, correlation_id=transfer_id
        )
        if not any(counts.get(state, 0) for state in ("pending", "deleting", "failed")):
            return False
    except Exception:
        logger.exception("Old files of moved project %s were not all deleted", project_id)
    try:
        pool = await get_arq_pool()
        await pool.enqueue_job(
            "resume_project_transfer_cleanup_job",
            workspace_id=workspace_id,
            project_id=project_id,
            correlation_id=transfer_id,
            _defer_by=30,
            _job_id=f"project-transfer:{transfer_id}",
        )
    except Exception:
        # The delete records are durable; losing the queue entry loses no data.
        logger.exception("Could not queue file clean-up for transfer %s", transfer_id)
    return True


async def _load_for_move(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor: Session,
    target_id: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """The project and the destination workspace, after checking this person may move
    the one into the other."""
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        raise NotFoundError("Project not found.")
    if target_id == workspace_id:
        raise ValidationError("This project is already in that workspace.")
    membership = await MembershipRepository(db).find(workspace_id=target_id, user_id=actor.user_id)
    target = await WorkspaceRepository(db).find_by_id(target_id) if membership else None
    # One answer for "no such workspace" and "not yours", so ids can't be probed.
    if membership is None or target is None or target.get("closed_at") is not None:
        raise NotFoundError("Workspace not found.")
    if membership["role"] not in TRANSFER_ROLES:
        raise PermissionDeniedError(
            "You need to be an owner or admin of the destination workspace."
        )
    if is_untouched_sample(project):
        raise ValidationError("The example project can't be moved.")
    if project.get("hard_delete_status") == "deleting":
        raise ConflictError("Permanent deletion is in progress for this project.")
    return project, target


async def preview_transfer(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor: Session,
    target_id: str,
) -> ProjectTransferPreview:
    project, _ = await _load_for_move(
        db, project_id=project_id, workspace_id=workspace_id, actor=actor, target_id=target_id
    )
    return await transfer_choices.preview(
        db, source_id=workspace_id, target_id=target_id, project=project
    )


@dataclass(frozen=True)
class _Moved:
    graph: MoveResult
    client: transfer_choices.BroughtClient
    added_emails: list[str]


async def transfer_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    project_id: str,
    workspace_id: str,
    actor: Session,
    request: ProjectTransfer,
) -> ProjectTransferOut:
    target_id = request.target_workspace_id
    project, target = await _load_for_move(
        db, project_id=project_id, workspace_id=workspace_id, actor=actor, target_id=target_id
    )
    if request.project_name != project["name"].strip():
        raise ValidationError("The typed name does not match this project.")
    repo = ProjectTransferRepository(db)
    if await repo.has_unfinished_cleanup([workspace_id, target_id], project_id):
        raise ConflictError(
            "Old files from an earlier change to this project are still being removed. "
            "Try again in a few minutes."
        )
    transfer_id = str(uuid.uuid4())
    locked = await repo.lock(workspace_id, project, transfer_id)
    if locked is False:
        raise ConflictError("This project is already being moved, or just changed. Try again.")
    archived_at = None if locked is None else locked
    assert not isinstance(archived_at, bool)

    prefixes = _prefixes(workspace_id, target_id, project_id)
    new_keys: list[str] = []
    heartbeat = asyncio.create_task(_keep_lock(repo, workspace_id, project_id, transfer_id))
    try:
        if archived_at is None:
            # Fail before copying anything if the destination has no room for it.
            await require_within_plan_limit(db, target_id, "projects")
        sizes = await repo.stored_bytes(workspace_id, project_id)
        await _require_storage_room(db, target_id, sum(sizes.values()))
        await transfer_choices.require_room_for(
            db,
            source_id=workspace_id,
            target_id=target_id,
            project=project,
            user_ids=request.add_member_ids,
        )
        old_keys = await _list_files(prefixes)
        uploading = "A file is still uploading to this project. Try again in a few minutes."
        if await repo.has_open_upload(workspace_id, project_id, set(old_keys)):
            raise ConflictError(uploading)
        moves = [(key, _new_key(key, prefixes)) for key in old_keys]
        new_keys = [new for _, new in moves]
        await repo.forget_cleanups(target_id, new_keys)
        await _copy_files(moves)
        # Work already under way when the project was locked can still add or remove files.
        if set(await _list_files(prefixes)) != set(old_keys):
            raise ConflictError(_CHANGED)

        async def commit(session: AsyncIOMotorClientSession) -> _Moved:
            current = await db.projects.find_one(
                {
                    "_id": project["_id"],
                    "workspace_id": workspace_id,
                    "transfer.id": transfer_id,
                    "hard_delete_status": {"$ne": "deleting"},
                },
                session=session,
            )
            if current is None:
                raise ConflictError(_CHANGED)
            await _require_still_allowed(
                db,
                source_id=workspace_id,
                target_id=target_id,
                user_id=actor.user_id,
                session=session,
            )
            listed = set(old_keys)
            if await repo.has_open_upload(workspace_id, project_id, listed, session=session):
                raise ConflictError(uploading)
            contents = await repo.contents(workspace_id, project_id, session=session)
            if await repo.has_issue_being_filed(
                workspace_id, contents.comment_ids, session=session
            ):
                raise ConflictError(
                    "A ticket is being sent to a tracker. Try again in a few minutes."
                )
            if archived_at is None:
                await require_within_plan_limit(db, target_id, "projects", session=session)
            ledger = await repo.stored_bytes(workspace_id, project_id, session=session)
            arriving = [(project_id, new, ledger[old]) for old, new in moves if old in ledger]
            # Page snapshots are keyed by project alone: they stay put and change owner.
            snapshots = f"snapshots/{project_id}/"
            staying = {key: size for key, size in ledger.items() if key.startswith(snapshots)}
            await _require_storage_room(
                db,
                target_id,
                sum(size for _, _, size in arriving) + sum(staying.values()),
                session=session,
            )
            quota = StorageQuotaRepository(db)
            await quota.import_existing_many(target_id, arriving, session=session)
            await repo.hand_over_usage(
                workspace_id, target_id, project_id, snapshots, session=session
            )
            # Reservations whose upload never arrived have nothing to move or delete.
            await quota.release_missing_objects(
                workspace_id,
                [key for key in ledger if key not in listed and key not in staying],
                session=session,
            )
            client = await transfer_choices.bring_client(
                db,
                source_id=workspace_id,
                target_id=target_id,
                project=current,
                choice=request.client,
                match=request.client_match,
                actor_user_id=actor.user_id,
                session=session,
            )
            # Before the records move, so the new members keep their assignments.
            added_emails, extra_access = await transfer_choices.add_people(
                db,
                source_id=workspace_id,
                target_id=target_id,
                project=current,
                user_ids=request.add_member_ids,
                actor_user_id=actor.user_id,
                session=session,
            )
            graph = await repo.move_graph(
                source_id=workspace_id,
                target_id=target_id,
                project=current,
                prefixes=prefixes,
                archived_at=archived_at,
                actor_user_id=actor.user_id,
                client_id=client.client_id,
                extra_access=extra_access,
                keep_issue_links=request.keep_issue_links,
                copy_activity=request.copy_activity,
                session=session,
            )
            await repo.forget_cleanups(workspace_id, old_keys, session=session)
            await ObjectGcRepository(db).prepare(
                workspace_id=workspace_id,
                project_id=project_id,
                correlation_id=transfer_id,
                keys=old_keys,
                session=session,
            )
            await repo.mark_transfer_cleanups(workspace_id, transfer_id, session=session)
            audience = restricted_audience(current)
            for owner, event, other in (
                (workspace_id, project_events.PROJECT_TRANSFERRED_OUT, target_id),
                (target_id, project_events.PROJECT_TRANSFERRED_IN, workspace_id),
            ):
                await append_event(
                    db,
                    workspace_id=owner,
                    type=event,
                    actor_type="member",
                    actor_id=actor.user_id,
                    payload={
                        "project_id": project_id,
                        "name": current["name"],
                        "other_workspace_id": other,
                        # The old workspace's entry stays as private as the project was.
                        **(
                            {"restricted_to": audience}
                            if owner == workspace_id and audience is not None
                            else {}
                        ),
                    },
                    session=session,
                )
            return _Moved(graph, client, added_emails)

        # Stopped first, so a renewal can't collide with the transaction's own write.
        await _stop(heartbeat)
        if not await repo.renew(workspace_id, project_id, transfer_id):
            raise ConflictError(_CHANGED)
        # Runs under the destination's plan lock, so two arrivals can't both take the last
        # project slot or the last of the storage.
        moved = await run_plan_change(db, target_id, commit)
    except Exception:
        # Copies are removed only while this move demonstrably still holds the project:
        # after a commit, or once another move has taken over, those paths are in use.
        # A cancelled request skips this and leaves the lock to expire.
        if await repo.renew(workspace_id, project_id, transfer_id):
            await _discard_copies(new_keys)
            await repo.release(workspace_id, project_id, transfer_id, archived_at)
        raise
    finally:
        heartbeat.cancel()

    pending = await _delete_old_files(
        db, workspace_id=workspace_id, project_id=project_id, transfer_id=transfer_id
    )
    emails_failed = 0
    if moved.added_emails:
        emails_failed = await announce_new_members(
            db,
            workspace_id=target_id,
            inviter_user_id=actor.user_id,
            emails=moved.added_emails,
        )
    unassigned = moved.graph.unassigned
    users = await UserRepository(db).find_many_by_ids(list(unassigned))
    return ProjectTransferOut(
        project_id=project_id,
        workspace_id=target_id,
        workspace_slug=target["slug"],
        workspace_name=target["name"],
        archived=archived_at is not None,
        tickets_renumbered=moved.graph.renumbered,
        files_moved=len(new_keys),
        cleanup_pending=pending,
        client_outcome=moved.client.outcome,
        client_name=moved.client.name,
        client_left_source=moved.client.left_source,
        members_added=len(moved.added_emails),
        invite_emails_failed=emails_failed,
        unassigned=sorted(
            (
                ProjectTransferUnassigned(
                    name=(users.get(user) or {}).get("name")
                    or (users.get(user) or {}).get("email")
                    or "A former member",
                    ticket_numbers=sorted(numbers),
                )
                for user, numbers in unassigned.items()
            ),
            key=lambda person: person.name.casefold(),
        ),
        issue_links_kept=moved.graph.issue_links_kept,
        activity_copied=moved.graph.activity_copied,
    )


def _new_key(key: str, prefixes: list[tuple[str, str]]) -> str:
    for old, new in prefixes:
        if key.startswith(old):
            return new + key[len(old) :]
    raise ValueError("A listed file is outside the project's storage.")
