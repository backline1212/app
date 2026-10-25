"""Opted-in feedback email, with durable leases and current-access checks."""

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
from app.core.project_access import can_view_project
from app.modules.auth.repository import UserRepository
from app.modules.notifications import events
from app.modules.notifications.preferences import FEEDBACK_PREFERENCES
from app.modules.notifications.repository import NotificationRepository
from app.modules.workspaces.repository import MembershipRepository, WorkspaceRepository

logger = logging.getLogger("backline.notification_email")
_SUBJECTS = {
    events.COMMENT_ASSIGNED: "You were assigned feedback",
    events.COMMENT_REPLY: "New reply to your feedback",
    events.COMMENT_MENTION: "You were mentioned in feedback",
    events.COMMENT_STATUS_CHANGED: "Your feedback status changed",
    events.FILE_APPROVED: "A file you uploaded was approved",
}


async def _recipient_and_link(
    db: AsyncIOMotorDatabase[dict[str, Any]], doc: dict[str, Any]
) -> tuple[str, str] | None:
    workspace_id, user_id = doc["workspace_id"], doc["user_id"]
    preference = FEEDBACK_PREFERENCES.get(doc["type"])
    if not preference:
        return None
    user = await UserRepository(db).find_by_id(user_id)
    if user is None or not user.get("email_verified_at"):
        return None
    prefs = user.get("preferences", {})
    if not prefs.get("email_notifications", False) or not prefs.get(preference, True):
        return None
    membership = await MembershipRepository(db).find(workspace_id=workspace_id, user_id=user_id)
    if membership is None:
        return None
    payload = doc["payload_json"]
    project_id, comment_id = payload.get("project_id"), payload.get("comment_id")
    asset_id = payload.get("asset_id") if doc["type"] == events.FILE_APPROVED else None
    if not isinstance(project_id, str) or not isinstance(comment_id or asset_id, str):
        return None
    if not await can_view_project(
        db,
        workspace_id=workspace_id,
        project_id=project_id,
        user_id=user_id,
        workspace_role=membership["role"],
    ):
        return None
    workspace = await WorkspaceRepository(db).find_by_id(workspace_id)
    if workspace is None:
        return None
    # Rebuild from current, authorized metadata instead of trusting a stored route
    # or copying private comment text/attachments into a third-party inbox.
    base = get_settings().public_dashboard_base_url.rstrip("/")
    project_route = f"/w/{quote(workspace['slug'], safe='')}/p/{quote(project_id, safe='')}"
    route = (
        f"{project_route}?asset={quote(asset_id, safe='')}"
        if isinstance(asset_id, str)
        else f"{project_route}/board?comment={quote(str(comment_id), safe='')}"
    )
    return user["email"], base + route


async def _send_claimed(
    db: AsyncIOMotorDatabase[dict[str, Any]], doc: dict[str, Any]
) -> Literal["sent", "skipped"]:
    workspace_id, notification_id = doc["workspace_id"], str(doc["_id"])
    repo = NotificationRepository(db)
    lease = doc["email_lease"]
    expires_at = doc["email_expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    recipient = await _recipient_and_link(db, doc) if expires_at > datetime.now(UTC) else None
    if recipient is None:
        return "skipped"
    email, link = recipient
    subject = _SUBJECTS[doc["type"]]
    envelope = doc.get("email_envelope")
    if envelope is not None and envelope["to"] != email:
        # Never replay an envelope to an old address after an account change.
        return "skipped"
    if envelope is None:
        envelope = {
            "to": email,
            "subject": f"Backline: {subject}",
            "html": (
                f"<p>{escape(subject)}.</p>"
                f'<p><a href="{escape(link, quote=True)}">Open feedback in Backline</a></p>'
                "<p>Manage feedback emails in your Backline account notification settings.</p>"
            ),
        }
        if not await repo.prepare_email(
            workspace_id, notification_id, lease=lease, envelope=envelope
        ):
            return "skipped"
    # Stable bytes/key for Resend retries within the outbox's 24-hour lifetime.
    # Apps Script delivery is at least once; acceptance/crash can duplicate it.
    await send_email(
        to=envelope["to"],
        subject=envelope["subject"],
        html=envelope["html"],
        idempotency_key=f"feedback/{workspace_id}/{notification_id}",
    )
    return "sent"


async def deliver_email(
    db: AsyncIOMotorDatabase[dict[str, Any]], *, workspace_id: str, notification_id: str
) -> None:
    repo = NotificationRepository(db)
    doc = await repo.claim_email(workspace_id, notification_id)
    if doc is None:
        return
    lease = doc["email_lease"]
    try:
        # Includes access lookups and preparation, staying below the two-minute lease.
        async with asyncio.timeout(80):
            state = await _send_claimed(db, doc)
    except Exception as exc:
        attempts = int(doc.get("email_attempts", 1))
        await repo.finish_email(
            workspace_id,
            notification_id,
            lease=lease,
            state="failed" if attempts >= 8 else "pending",
            retry_after=(
                None
                if attempts >= 8
                else datetime.now(UTC) + timedelta(seconds=min(3600, 30 * 2 ** (attempts - 1)))
            ),
        )
        logger.warning("Feedback email deferred/failed (%s)", type(exc).__name__)
        return
    await repo.finish_email(workspace_id, notification_id, lease=lease, state=state)


async def sweep_emails(db: AsyncIOMotorDatabase[dict[str, Any]]) -> int:
    due = await NotificationRepository(db).due_email_deliveries()
    pool = await get_arq_pool()
    queued = 0
    for doc in due:
        try:
            # Do not perform fifty slow provider calls inside one cron job. Queue
            # each lease attempt once; a new retry deadline gives it a fresh job ID.
            job = await pool.enqueue_job(
                "send_member_notification_email_job",
                workspace_id=doc["workspace_id"],
                notification_id=str(doc["_id"]),
                _job_id=f"feedback:{doc['_id']}:{doc['email_after'].isoformat()}",
            )
            queued += int(job is not None)
        except Exception as exc:
            logger.warning("Feedback email sweep row failed (%s)", type(exc).__name__)
    return queued
