"""Emails the owner before a prepaid plan ends (TDR-0222).

Plans don't renew automatically (TDR-0052), so without a reminder a workspace drops to
Free Starter limits on the day its period ends. The owner hears 7 days and 1 day before;
each reminder is recorded on the workspace per period, so a re-run or a renewal that
extends the period never repeats one."""

import logging
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.email import send_email
from app.modules.auth.repository import UserRepository
from app.modules.billing.plans import get_plan_definition
from app.modules.workspaces.repository import MembershipRepository, WorkspaceRepository

logger = logging.getLogger("backline.renewal_reminders")

# Days before the period ends that a reminder goes out, largest first.
REMINDER_DAYS = (7, 1)


def _reminder_stage(period_end: datetime, now: datetime) -> int | None:
    """The tightest reminder the period has reached: 1 within a day, else 7."""
    left = period_end - now
    for days in reversed(REMINDER_DAYS):
        if left <= timedelta(days=days):
            return days
    return None


async def send_renewal_reminders(db: AsyncIOMotorDatabase[dict[str, Any]]) -> int:
    now = datetime.now(UTC)
    repo = WorkspaceRepository(db)
    sent = 0
    for workspace in await repo.paid_periods_ending(now + timedelta(days=max(REMINDER_DAYS))):
        period_end = workspace["current_period_end"]
        if period_end.tzinfo is None:
            period_end = period_end.replace(tzinfo=UTC)
        stage = _reminder_stage(period_end, now)
        if stage is None:
            continue
        workspace_id = str(workspace["_id"])
        key = f"{period_end.date().isoformat()}:{stage}d"
        try:
            if await _remind_owner(db, workspace, period_end, stage, key):
                sent += 1
        except Exception:
            # Unclaimed on failure, so tomorrow's run tries again.
            logger.exception("Renewal reminder failed for workspace %s", workspace_id)
    return sent


async def _remind_owner(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace: dict[str, Any],
    period_end: datetime,
    stage: int,
    key: str,
) -> bool:
    workspace_id = str(workspace["_id"])
    owners = [
        member
        for member in await MembershipRepository(db).list_for_workspace(workspace_id)
        if member.get("role") == "owner"
    ]
    if not owners:
        return False
    owner = await UserRepository(db).find_by_id(owners[0]["user_id"])
    if owner is None or not owner.get("email_verified_at"):
        return False
    if not await WorkspaceRepository(db).claim_renewal_reminder(workspace_id, key):
        return False
    plan_name = get_plan_definition(str(workspace["plan"]))["name"]
    ends = f"{period_end:%B} {period_end.day}"
    when = "tomorrow" if stage == 1 else f"on {ends}"
    billing = (
        f"{get_settings().public_dashboard_base_url.rstrip('/')}" f"/w/{workspace['slug']}/billing"
    )
    try:
        await send_email(
            to=owner["email"],
            subject=f"Your {plan_name} plan for {workspace['name']} ends {when}",
            html=(
                f"<p>The {escape(plan_name)} plan for <strong>{escape(workspace['name'])}"
                f"</strong> is paid through {escape(ends)} and doesn't renew "
                "automatically.</p>"
                "<p>After that the workspace moves to Free Starter: nothing is deleted, "
                "but new projects, extra teammates and AI credits are limited to the "
                "free plan.</p>"
                f'<p><a href="{escape(billing, quote=True)}">Renew in Backline</a></p>'
            ),
            idempotency_key=f"renewal/{workspace_id}/{key}",
        )
    except Exception:
        # Release the claim so the next daily run retries this reminder.
        await WorkspaceRepository(db).release_renewal_reminder(workspace_id, key)
        raise
    return True
