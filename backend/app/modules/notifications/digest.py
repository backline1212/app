"""Durable daily digest preparation and current-access, link-only delivery."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Any, Literal
from urllib.parse import quote

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.arq_pool import get_arq_pool
from app.core.config import get_settings
from app.core.email import send_email
from app.core.project_access import effective_project_role
from app.modules.auth.repository import UserRepository
from app.modules.comments.repository import CommentRepository
from app.modules.notifications.digest_repository import DigestDeliveryRepository
from app.modules.pages.repository import PageRepository
from app.modules.projects.repository import ProjectRepository
from app.modules.workspaces.repository import MembershipRepository, WorkspaceRepository

logger = logging.getLogger("backline.digest")


async def _project_for_page(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    page_id: str,
    cache: dict[str, dict[str, Any] | None],
) -> dict[str, Any] | None:
    if page_id in cache:
        return cache[page_id]
    page = await PageRepository(db).find_in_workspace(workspace_id, page_id)
    project = (
        await ProjectRepository(db).find_in_workspace(workspace_id, page["project_id"])
        if page
        else None
    )
    cache[page_id] = project
    return project


async def prepare_digest_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str
) -> int:
    repo = WorkspaceRepository(db)
    workspace = await repo.claim_digest_preparation(workspace_id)
    if workspace is None:
        return 0
    window = workspace["digest_window"]
    cursor = window.get("member_cursor")
    prepared = 0
    try:
        async with asyncio.timeout(80):
            while True:
                members = await MembershipRepository(db).digest_page(
                    workspace_id, window["until"], cursor
                )
                await DigestDeliveryRepository(db).materialize(
                    workspace_id, window, [member["user_id"] for member in members]
                )
                next_cursor = str(members[-1]["_id"]) if members else cursor
                if not await repo.advance_digest_preparation(
                    workspace_id, window, next_cursor, complete=len(members) < 100
                ):
                    return prepared
                prepared += len(members)
                if len(members) < 100:
                    return prepared
                cursor = next_cursor
    except Exception as exc:
        logger.warning("Digest preparation deferred (%s)", type(exc).__name__)
    return prepared


async def run_digest_for_workspace(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_doc: dict[str, Any]
) -> int:
    """Legacy internal entry point: prepare durable recipient rows, never send inline.

    The return value now counts prepared recipients, not emailed comments.
    """
    return await prepare_digest_workspace(db, workspace_id=str(workspace_doc["_id"]))


async def _recipient(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, user_id: str
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]] | None:
    membership = await MembershipRepository(db).find(workspace_id=workspace_id, user_id=user_id)
    user = await UserRepository(db).find_by_id(user_id)
    workspace = await WorkspaceRepository(db).find_by_id(workspace_id)
    if membership is None or user is None or workspace is None or not user.get("email_verified_at"):
        return None
    if not user.get("preferences", {}).get("daily_digest", True):
        return None
    return user, membership, workspace


async def _visible(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    membership: dict[str, Any],
    comment: dict[str, Any],
    cache: dict[str, dict[str, Any] | None],
) -> bool:
    if comment.get("deleted_at"):
        return False
    project = await _project_for_page(db, workspace_id, comment.get("page_id") or "", cache)
    return bool(
        project is not None
        and not project.get("archived_at")
        and (not comment.get("project_id") or comment["project_id"] == str(project["_id"]))
        and effective_project_role(
            project, user_id=membership["user_id"], workspace_role=membership["role"]
        )
        is not None
    )


async def _evidence_visible(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    doc: dict[str, Any],
    membership: dict[str, Any],
    comment_id: str,
) -> bool:
    rows = await CommentRepository(db).find_many_in_workspace(
        doc["workspace_id"],
        [comment_id],
        fields={"page_id": 1, "project_id": 1, "deleted_at": 1},
    )
    return bool(rows and await _visible(db, doc["workspace_id"], membership, rows[0], {}))


async def _send_claimed(
    db: AsyncIOMotorDatabase[dict[str, Any]], doc: dict[str, Any]
) -> Literal["sent", "skipped", "failed", "pending"]:
    workspace_id, delivery_id, lease = doc["workspace_id"], str(doc["_id"]), doc["lease"]
    repo = DigestDeliveryRepository(db)
    recipient = await _recipient(db, workspace_id, doc["user_id"])
    if recipient is None:
        return "skipped"
    user, membership, workspace = recipient
    evidence = doc.get("candidate_comment_id")
    if not evidence or not await _evidence_visible(db, doc, membership, evidence):
        comments = await CommentRepository(db).digest_page(
            workspace_id, doc["since"], doc["until"], doc.get("scan_cursor")
        )
        evidence = None
        cache: dict[str, dict[str, Any] | None] = {}
        for comment in comments:
            if await _visible(db, workspace_id, membership, comment, cache):
                evidence = str(comment["_id"])
                break
        cursor = evidence or (str(comments[-1]["_id"]) if comments else doc.get("scan_cursor"))
        if not await repo.save_progress(
            workspace_id,
            delivery_id,
            lease,
            {"scan_cursor": cursor, "candidate_comment_id": evidence},
        ):
            return "pending"
        if evidence is None:
            return "pending" if len(comments) == 200 else "skipped"

    envelope = doc.get("envelope")
    if envelope is not None and envelope["to"] != user["email"]:
        return "skipped"
    expires = doc.get("expires_at")
    if expires is not None and (
        expires.replace(tzinfo=UTC) if expires.tzinfo is None else expires
    ) <= datetime.now(UTC):
        return "failed"
    if envelope is None:
        link = (
            get_settings().public_dashboard_base_url.rstrip("/")
            + f"/w/{quote(workspace['slug'], safe='')}/tickets"
        )
        envelope = {
            "to": user["email"],
            "subject": "Backline daily feedback digest",
            "html": (
                "<p>New feedback is available in Backline for the period "
                f"{doc['since'].date().isoformat()} to {doc['until'].date().isoformat()}.</p>"
                f'<p><a href="{escape(link, quote=True)}">Open your authorized feedback</a></p>'
                "<p>Manage daily digest emails in your Backline account settings.</p>"
            ),
        }
        if not await repo.save_progress(
            workspace_id,
            delivery_id,
            lease,
            {"envelope": envelope, "expires_at": datetime.now(UTC) + timedelta(hours=24)},
        ):
            return "pending"
    current = await _recipient(db, workspace_id, doc["user_id"])
    if current is None or current[0]["email"] != envelope["to"]:
        return "skipped"
    if not await _evidence_visible(db, doc, current[1], evidence):
        return "pending"
    await send_email(
        to=envelope["to"],
        subject=envelope["subject"],
        html=envelope["html"],
        idempotency_key=f"digest/{delivery_id}",
    )
    return "sent"


async def deliver_digest(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, delivery_id: str
) -> None:
    repo = DigestDeliveryRepository(db)
    doc = await repo.claim(workspace_id, delivery_id)
    if doc is None:
        return
    try:
        async with asyncio.timeout(80):
            state = await _send_claimed(db, doc)
    except Exception as exc:
        failures = int(doc.get("failures", 0)) + 1
        await repo.finish(
            workspace_id,
            delivery_id,
            lease=doc["lease"],
            state="failed" if failures >= 8 else "pending",
            failures=failures,
            after=datetime.now(UTC) + timedelta(seconds=min(3600, 30 * 2 ** (failures - 1))),
        )
        logger.warning("Digest delivery deferred/failed (%s)", type(exc).__name__)
        return
    await repo.finish(
        workspace_id,
        delivery_id,
        lease=doc["lease"],
        state=state,
        after=datetime.now(UTC) + timedelta(seconds=1) if state == "pending" else None,
    )


async def run_daily_digests(db: AsyncIOMotorDatabase[dict[str, Any]]) -> dict[str, int]:
    """Queue bounded preparation/delivery; provider sends run in separate jobs."""
    workspaces = await WorkspaceRepository(db).due_digest_workspaces()
    deliveries = await DigestDeliveryRepository(db).due()
    queued = {"preparations": 0, "deliveries": 0}
    try:
        async with asyncio.timeout(20):
            pool = await get_arq_pool()
            minute = datetime.now(UTC).strftime("%Y%m%d%H%M")
            for workspace in workspaces:
                workspace_id = str(workspace["_id"])
                job = await pool.enqueue_job(
                    "prepare_daily_digest_job",
                    workspace_id=workspace_id,
                    _job_id=f"digest-prepare/{workspace_id}/{minute}",
                )
                queued["preparations"] += job is not None
            for delivery in deliveries:
                job = await pool.enqueue_job(
                    "deliver_daily_digest_job",
                    workspace_id=delivery["workspace_id"],
                    delivery_id=str(delivery["_id"]),
                    _job_id=f"digest-email/{delivery['_id']}/{delivery['after'].isoformat()}",
                )
                queued["deliveries"] += job is not None
    except Exception as exc:
        logger.warning("Digest sweep deferred (%s)", type(exc).__name__)
    return queued
