# TDR-0068: Issued uploads and durable snapshot delivery

Date: 2026-10-19. Status: static checks passed; deployment verification pending.

## Decision

F03: register each newly issued presigned/direct upload with workspace/project,
actor, declared MIME/length and issue time. New screenshots, attachments, replies
and standalone ticket attachments must reference a row issued to that actor in the
same project and an actual private S3 object with matching MIME/length. Screenshots
require an image MIME. Check after an authorized matching replay, so completed
retries don't depend on the old object's continued existence.

Existing records still read under project namespace checks. Pre-rollout files must
be reuploaded before newly attaching; no forced backfill or content migration.
Registry rows participate in project deletion inventory/signature/counts and scoped
cleanup. No destructive deletion flow was run.

F22: upload revision-addressed JSON before changing current state. Commit the ready
revision, page latest pointer and pending delivery marker in one Mongo transaction.
Read current identity through the pointer, with legacy flag fallback. New stored
rows retain `is_current:false` to avoid unique partial-index key reuse inside a
transaction; API current/history flags derive from the pointer. Preserve existing
indexes/records. An unchanged completed hash deduplicates and repairs a missing
pointer/delivery marker without resetting completed delivery. New revisions record
the exact previous revision when available.

Arq queueing is an optimization after commit. A minute sweep finds pending or
expired-lease deliveries, scopes mutations by workspace and retries event/realtime
publication and recovery. Audit events use existing unique correlation IDs; recovery
retains its retry guards. Realtime delivery is at least once. Ten-minute leases and
compare-and-set completion protect newer claims from expired workers. Failed rows
remain retryable after process loss.

## Rollout and limits

The index migration defaults to read-only. Explicit apply adds two nonunique indexes
(due deliveries and workspace/project uploads). Dry run found both missing without
conflicts. Mongo transactions require the existing replica-set deployment. Deploy
API and worker together. Rollback must retain the new pointer-aware repository and
delivery worker or suspend snapshot writes: the old flag-only reader doesn't
represent new current revisions.
The explicit additive apply subsequently created both indexes with no review-data
changes. Backend lint/format (218 files), mypy (201 files), workspace scoping and
full frontend lint/typecheck/build (12 tasks) passed.

This doesn't add byte reservations, file-magic validation or write-once objects
during a presigned PUT lifetime. Failed transactions/concurrent deduplication can
leave orphan objects; authorized project prefix deletion includes them, but timed
orphan cleanup remains open. Personalized snapshot context/isolation is separate.
No bulk legacy recovery or destructive fixtures. No automated test suites; use
lint/typecheck/build. Storage-failure/concurrency acceptance remains open.
