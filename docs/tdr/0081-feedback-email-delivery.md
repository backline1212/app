# TDR-0081: Real, opted-in feedback email

Date: 2026-10-20. Scope: audit F28, continued product-flow repair.

## Decision

Keep the four existing event preferences controlling in-app feedback notifications.
Relabel them accurately and add `email_notifications`, explicitly off for existing
and new accounts. The separate daily-digest preference retains its behavior. Enabling
feedback email opts the member into email for enabled assignments, replies, mentions
and status events across their workspaces; no historical notification is backfilled.
Pydantic owns the additive preference and packages/types is regenerated.

Eligible new notifications persist their email outbox state in the same document.
Arq's immediate enqueue is a latency optimization. A minute sweep queues due records
in bounded batches, with one job ID per retry deadline. Each delivery claims a
two-minute lease, has an eighty-second total processing deadline and rechecks current
membership, project visibility, verified email and both preferences. Removed access,
opt-out, changed recipient address or twenty-four-hour expiry skips delivery. Attempts
back off and become failed after eight errors. No email state/address/envelope is
exposed in NotificationOut or guest APIs.

Emails contain an event label and authorized portal link, without comment bodies or
attachments. The initial envelope is persisted for retries. Current workspace metadata
builds the first link; subsequent changes to a slug may make that frozen retry link
stale, so link persistence across workspace renaming remains an acceptance case.

Bound Resend delivery through the existing httpx dependency: the pinned Resend SDK
uses requests without a timeout. Ordinary OTP/invitation routing keeps Apps Script
first, then Resend. Notification outbox sends prefer configured Resend and use a stable
Idempotency-Key and unchanged envelope within the twenty-four-hour outbox lifetime.
Apps Script receives the key but its deployed implementation has not been verified
to deduplicate: that path is at least once, not an exactly-once guarantee.

Primary provider contracts checked:
[send email](https://resend.com/docs/api-reference/emails/send-email) and
[idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
The Resend dependency/lock stays unchanged; other callers need no signature changes.

## Rollout and verification

Production read-only inspection via the existing review-persistence index migration
reports revisions_delivery_due and uploads_workspace_project present, no conflicts,
and only notifications_email_due to create. It modifies no review data. Startup
creates that additive non-unique index; no destructive migration/backfill is needed.

Source checks pass: frontend lint/typecheck/build (12/12 Turbo tasks), backend
Ruff across app, mypy on affected modules (20 files), workspace scoping (20
repositories), regenerated contracts and diff checks. Existing chunk advisory
remains. No suite written/run per Codex instructions. No account preference was
changed and no email, notification, comment or provider request was submitted for
acceptance. Receipt, opt-out/access revocation while queued, duplicate claim/restart,
provider outage/timeout, exhaustion, updated-email skip, settings save and exact-ticket
navigation remain pending manual acceptance. Browser use remains unavailable.
