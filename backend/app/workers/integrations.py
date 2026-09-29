"""Arq job function implementing the Webhook Retry Engine (17-Notifications-Integrations.md
§17.7): 3 retries at 5s/30s/5min, then dead-letter. Registered by app/workers/main.py."""

from typing import Any

from arq.worker import Retry

from app.core.db import get_db
from app.core.events import append_event
from app.modules.comments.service import get_comment_out
from app.modules.integrations import events as integration_events
from app.modules.integrations.base import IntegrationDeliveryError
from app.modules.integrations.factory import NOTIFIER_TYPES, get_notifier
from app.modules.integrations.repository import IntegrationRepository
from app.modules.integrations.service import build_event_context, run_project_updated_dispatch
from app.modules.notifications.service import notify_integration_disconnected

# arq's job_try starts at 1 for the first attempt - {1: 5, 2: 30, 3: 300} means the retry
# *after* attempt N is deferred by this many seconds, matching §17.7's 5s/30s/5min exactly.
_RETRY_DELAYS_SECONDS = {1: 5, 2: 30, 3: 300}
_MAX_ATTEMPTS = 4  # 1 initial attempt + 3 retries


async def dispatch_integration_event_job(
    ctx: dict[str, Any], integration_id: str, event_type: str, comment_id: str
) -> None:
    db = get_db()
    integration_doc = await IntegrationRepository(db).find_by_id(integration_id)
    if integration_doc is None:
        return  # disconnected between enqueue and delivery - nothing to do
    if integration_doc["type"] not in NOTIFIER_TYPES:
        return  # trackers only file tickets on request; nothing posts automatically

    comment = await get_comment_out(db, comment_id)
    if comment is None:
        return

    notifier = get_notifier(integration_doc["type"])
    event = await build_event_context(
        db, workspace_id=integration_doc["workspace_id"], comment=comment
    )
    try:
        if event_type == "comment.created":
            await notifier.on_comment_created(comment, integration_doc["config_json"], event)
        elif event_type == "comment.status_changed":
            await notifier.on_status_changed(comment, integration_doc["config_json"], event)
    except IntegrationDeliveryError as exc:
        attempt: int = ctx["job_try"]
        if attempt < _MAX_ATTEMPTS:
            raise Retry(defer=_RETRY_DELAYS_SECONDS[attempt]) from exc

        # Dead-letter: logged to events (surfaced in the Activity feed, per §17.7) and a
        # notification to whoever connected it, so a broken webhook is noticed rather
        # than silently dropping every future notification.
        await append_event(
            db,
            workspace_id=integration_doc["workspace_id"],
            type=integration_events.WEBHOOK_DELIVERY_FAILED,
            actor_type="system",
            actor_id=None,
            payload={
                "integration_id": integration_id,
                "integration_type": integration_doc["type"],
                "event_type": event_type,
                "comment_id": comment_id,
                "error": str(exc),
            },
        )
        await notify_integration_disconnected(
            db,
            workspace_id=integration_doc["workspace_id"],
            integration_id=integration_id,
            integration_type=integration_doc["type"],
            connected_by=integration_doc["connected_by"],
        )


async def dispatch_project_updated_event_job(
    ctx: dict[str, Any], workspace_id: str, project_id: str
) -> None:
    """Runs the "project updated" notifications off the request path - see
    integrations/service.py's dispatch_project_updated_event/run_project_updated_dispatch.
    Deliberately no retry/dead-letter handling here (unlike the job above): this event
    is best-effort by design (a single low-frequency admin action, no per-comment
    payload worth retrying)."""
    del ctx
    await run_project_updated_dispatch(get_db(), workspace_id=workspace_id, project_id=project_id)
