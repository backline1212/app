"""Arq job functions for email (17-Notifications-Integrations.md §17.6). Registered by
app/workers/main.py, the single worker entrypoint."""

from html import escape
from typing import Any

from arq import Retry

from app.core.db import get_db
from app.core.email import send_email
from app.core.errors import ExternalServiceError
from app.modules.notifications.digest import (
    deliver_digest,
    prepare_digest_workspace,
    run_daily_digests,
)
from app.modules.notifications.email_delivery import deliver_email, sweep_emails


async def send_member_notification_email_job(
    ctx: dict[str, Any], *, workspace_id: str, notification_id: str
) -> None:
    await deliver_email(get_db(), workspace_id=workspace_id, notification_id=notification_id)


async def sweep_notification_emails_job(ctx: dict[str, Any]) -> int:
    return await sweep_emails(get_db())


def _client_email(
    *,
    guest_name: str,
    brand_name: str | None,
    lead: str,
    quote: str,
    extra: str = "",
    review_url: str | None = None,
    project_name: str | None = None,
) -> str:
    """Client-facing update email. Every interpolated value is user-authored (names,
    comment text, project names) or configuration, so all of it is escaped."""
    sender = escape(brand_name or "the team")
    parts = [
        f"<p>Hi {escape(guest_name)},</p>",
        f"<p>{lead}</p>",
        f'<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #ccc;'
        f'color:#444">{escape(quote)}</blockquote>',
    ]
    if extra:
        parts.append(extra)
    if review_url:
        parts.append(
            f'<p><a href="{escape(review_url, quote=True)}">Open the review'
            f"{' for ' + escape(project_name) if project_name else ''}</a></p>"
        )
    parts.append(
        f'<p style="color:#777;font-size:12px">You\'re getting this because you left '
        f"feedback for {sender} with this email address.</p>"
    )
    return "".join(parts)


CLIENT_EMAIL_TRIES = 4


async def _send_client_email(ctx: dict[str, Any], **kwargs: Any) -> None:
    """A provider outage retries with backoff (1, 2, 3 minutes) instead of losing the
    email; the idempotency key keeps a retry from sending it twice (TDR-0203)."""
    try:
        await send_email(**kwargs)
    except ExternalServiceError as exc:
        tries = int(ctx.get("job_try") or 1)
        if tries >= CLIENT_EMAIL_TRIES:
            raise
        raise Retry(defer=60 * tries) from exc


async def send_guest_resolved_email_job(
    ctx: dict[str, Any],
    guest_email: str,
    guest_name: str,
    comment_body: str,
    brand_name: str | None = None,
    project_name: str | None = None,
    review_url: str | None = None,
    idempotency_key: str | None = None,
) -> None:
    # The trailing keyword arguments are optional so jobs queued by an older API
    # release still run.
    await _send_client_email(
        ctx,
        idempotency_key=idempotency_key,
        to=guest_email,
        brand=brand_name,
        subject=f"Your feedback was addressed{' - ' + project_name if project_name else ''}",
        html=_client_email(
            guest_name=guest_name,
            brand_name=brand_name,
            lead="Your comment has been marked resolved:",
            quote=comment_body,
            review_url=review_url,
            project_name=project_name,
        ),
    )


async def send_guest_reply_email_job(
    ctx: dict[str, Any],
    *,
    guest_email: str,
    guest_name: str,
    comment_body: str,
    reply_author: str,
    reply_body: str,
    brand_name: str | None = None,
    project_name: str | None = None,
    review_url: str | None = None,
    idempotency_key: str | None = None,
) -> None:
    await _send_client_email(
        ctx,
        idempotency_key=idempotency_key,
        to=guest_email,
        brand=brand_name,
        subject=f"New reply to your feedback{' - ' + project_name if project_name else ''}",
        html=_client_email(
            guest_name=guest_name,
            brand_name=brand_name,
            lead=f"{escape(reply_author)} replied to your comment:",
            quote=comment_body,
            extra=(
                f'<p style="white-space:pre-wrap">{escape(reply_body)}</p>'
                "<p>Reply from the review to keep the conversation in one place.</p>"
            ),
            review_url=review_url,
            project_name=project_name,
        ),
    )


async def send_daily_digests_job(ctx: dict[str, Any]) -> dict[str, int]:
    return await run_daily_digests(get_db())


async def sweep_daily_digests_job(ctx: dict[str, Any]) -> dict[str, int]:
    return await run_daily_digests(get_db())


async def prepare_daily_digest_job(ctx: dict[str, Any], *, workspace_id: str) -> int:
    return await prepare_digest_workspace(get_db(), workspace_id=workspace_id)


async def deliver_daily_digest_job(
    ctx: dict[str, Any], *, workspace_id: str, delivery_id: str
) -> None:
    await deliver_digest(get_db(), workspace_id=workspace_id, delivery_id=delivery_id)
