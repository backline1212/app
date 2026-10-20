# TDR-0080: Atomic project, member and AI capacity

Date: 2026-10-20. Scope: audit F26, continuing the authorized site-wide repair.

## Decision

Capacity-increasing writes use a Mongo transaction that first increments the
workspace's additive `plan_write_version`, then reads the effective plan and actual
usage in that transaction. The shared workspace write makes simultaneous creates
conflict and retry before counting again. No cached usage counter or destructive
backfill is introduced. Callbacks contain database work only; events, email,
provider work and preview/signing stay outside the retryable transaction.

Project creation, restoration and conversion of the free untouched sample into a
real active project use this boundary. Restoring an already active project does
not require another slot. Invites, direct room-code joins and approval-based joins
check actual membership inside the same boundary; approving a request and adding
its seat commit together. Duplicate direct joins reuse the existing membership.
Invites retain a preflight before global account creation; a losing capacity race
may leave an unused invited account, but cannot add an extra membership.

AI reserves a ledger row before calling the provider. Reserved and completed rows
count toward the request-start UTC calendar month. All usage views use the same
active-row filter. Completed legacy rows without a status remain readable/countable.
Failures, unusable summaries/suggestions and cancellation release the reservation;
a crashed process's reservation expires after ten minutes without deleting history.
Provider work is limited to sixty seconds, including credential fallback. Completion
requires a still-valid reservation. Pending usage is described in the UI, and
unconfigured AI is explicitly unavailable. No plan grants or payment changes.

## Verification and remaining acceptance

Backend Ruff across app, strict mypy (201 files), workspace scoping (20 repositories),
web lint/typecheck/build and diff checks pass. Existing web chunk-size advisory
remains. No suite written/run per Codex instructions. This does not establish live
transaction contention, provider failures/cancellation, month rollover or worker
restart behavior. No production project/member/AI request was created to verify it.
F24 storage-byte reservations and F30 creation replay remain separate work.
