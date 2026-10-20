"""Arq job functions for email (17-Notifications-Integrations.md §17.6). Registered by
app/workers/main.py, the single worker entrypoint."""

from html import escape
from typing import Any

from app.core.db import get_db
from app.core.email import send_email
from app.modules.notifications.digest import run_daily_digests
from app.modules.notifications.email_delivery import deliver_email, sweep_emails


async def send_member_notification_email_job(
    ctx: dict[str, Any], *, workspace_id: str, notification_id: str
) -> None:
    await deliver_email(get_db(), workspace_id=workspace_id, notification_id=notification_id)


async def sweep_notification_emails_job(ctx: dict[str, Any]) -> int:
    return await sweep_emails(get_db())


async def send_guest_resolved_email_job(
    ctx: dict[str, Any], guest_email: str, guest_name: str, comment_body: str
) -> None:
    # comment_body/guest_name are arbitrary user-authored text - escape before
    # interpolating into HTML (digest.py's _render_digest_html already does this
    # correctly; this call site was missing it, allowing HTML injection into an
    # outgoing email via a crafted comment/name).
    await send_email(
        to=guest_email,
        subject="Your feedback was addressed",
        html=(
            f"<p>Hi {escape(guest_name)},</p>"
            f"<p>Your comment has been marked resolved:</p>"
            f"<blockquote>{escape(comment_body)}</blockquote>"
        ),
    )


async def send_daily_digests_job(ctx: dict[str, Any]) -> dict[str, int]:
    return await run_daily_digests(get_db())
