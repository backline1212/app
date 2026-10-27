"""Single Arq worker entrypoint (06-Backend-Architecture.md §6.5). Run locally with:

    uv run arq app.workers.main.WorkerSettings

One process registering every background job function, rather than one process per
module - the realistic production shape (most teams run one or a small, fixed number of
worker processes, not one per feature area). Each job function itself is a thin wrapper;
the actual logic lives in the relevant module's service.py as a plain, directly-testable
async function - this file is the only place that knows about Arq's `ctx`/registration/
cron mechanics.
"""

import sentry_sdk
from arq import cron
from arq.connections import RedisSettings
from sentry_sdk.integrations.arq import ArqIntegration

from app.core.config import get_settings
from app.workers.browser_render import render_browser_snapshot_job
from app.workers.heartbeat import report_worker_heartbeat_job
from app.workers.integrations import (
    deliver_integration_dispatch_job,
    dispatch_integration_event_job,
    dispatch_project_updated_event_job,
    sweep_integration_dispatches_job,
)
from app.workers.notifications import (
    deliver_daily_digest_job,
    prepare_daily_digest_job,
    send_daily_digests_job,
    send_guest_reply_email_job,
    send_guest_resolved_email_job,
    send_member_notification_email_job,
    sweep_daily_digests_job,
    sweep_notification_emails_job,
)
from app.workers.project_preview import capture_project_preview_job
from app.workers.recovery import run_recovery_pipeline_job
from app.workers.renewal_reminders import send_renewal_reminders_job
from app.workers.snapshot_delivery import (
    deliver_snapshot_revision_job,
    sweep_snapshot_deliveries_job,
)
from app.workers.storage_gc import resume_project_hard_delete_job
from app.workers.storage_quota import (
    reconcile_storage_reservation_job,
    sweep_storage_reservations_job,
)
from app.workers.workspace_purge import purge_closed_workspaces_job

# Job failures are reported like API errors (TDR-0200); a no-op without a DSN.
if get_settings().sentry_dsn:
    sentry_sdk.init(
        dsn=get_settings().sentry_dsn,
        environment=get_settings().environment,
        integrations=[ArqIntegration()],
        traces_sample_rate=0,
    )


class WorkerSettings:
    functions = [
        run_recovery_pipeline_job,
        deliver_snapshot_revision_job,
        sweep_snapshot_deliveries_job,
        dispatch_integration_event_job,
        dispatch_project_updated_event_job,
        deliver_integration_dispatch_job,
        sweep_integration_dispatches_job,
        send_guest_reply_email_job,
        send_guest_resolved_email_job,
        send_daily_digests_job,
        sweep_daily_digests_job,
        prepare_daily_digest_job,
        deliver_daily_digest_job,
        send_member_notification_email_job,
        sweep_notification_emails_job,
        resume_project_hard_delete_job,
        render_browser_snapshot_job,
        capture_project_preview_job,
        reconcile_storage_reservation_job,
        sweep_storage_reservations_job,
        purge_closed_workspaces_job,
        send_renewal_reminders_job,
    ]
    # Real headless-browser renders (Chromium/WebKit/Firefox via Playwright) are
    # meaningfully heavier than every other job here - cap how many run at once so a
    # burst of "Capture As" clicks across projects can't exhaust the worker
    # container's memory the way an unbounded queue would.
    max_jobs = 3
    # 17.6: the 09:00 UTC daily digest queues durable per-recipient work. The minute
    # sweep recovers interrupted work; new daily windows remain gated to >=09:00 UTC.
    cron_jobs = [
        cron(report_worker_heartbeat_job, second=0, run_at_startup=True),
        cron(send_daily_digests_job, hour=9, minute=0),
        cron(sweep_daily_digests_job, second=5),
        cron(sweep_snapshot_deliveries_job, second=15),
        cron(sweep_integration_dispatches_job, second=20),
        cron(sweep_notification_emails_job, second=30),
        cron(sweep_storage_reservations_job, second=45),
        cron(purge_closed_workspaces_job, hour=3, minute=17),
        cron(send_renewal_reminders_job, hour=10, minute=7),
    ]
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    # A deploy's SIGTERM lets running jobs (an email send, a digest) finish first
    # instead of cancelling them mid-send and retrying, which could send twice.
    job_completion_wait = 20
