# TDR-0105: Durable daily digest windows and recipient delivery

Date: 2026-10-22. Backlog item: BUG-02, after BUG-01/TDR-0104.

## Implementation plan

1. Replace checkpoint-as-claim with a leased workspace preparation window. Its
   immutable start/end/day and membership cursor survive worker restart. Initialize
   a first-ever legacy checkpoint without mailing all historical feedback.
2. Materialize recipient outbox rows in pages of 100, with deterministic scoped
   identities and idempotent insert. Advance the workspace checkpoint only after
   every eligible membership page is durably represented. Resume interrupted
   preparation through a bounded minute sweep; coalesce each UTC scheduled day.
3. Claim each delivery with a separate two-minute lease and an 80-second processing
   deadline. Scan bounded 200-row comment pages inside the immutable time window;
   persist scan progress instead of allocating the whole history. Require current
   recipient, verified email, preference and positively resolved project access.
4. Send a link-only digest: feedback is available for this window, with an authorized
   portal link. Do not retain or email comment bodies/project names. The portal
   contains the complete authorized feedback. This intentionally replaces inline
   snippets to limit queued-email exposure after access/content changes.
5. Freeze one envelope/key for provider retries, recheck eligibility, recipient
   address and current evidence before sending, and persist sent/skipped/failed
   outcomes. Back off errors; retain failed records for follow-up. Resend's existing
   24-hour idempotency behavior applies; Apps Script remains at least once. Never
   promise exactly-once email or retry an old key beyond its supported window.
6. Add worker jobs/sweeps and additive indexes, inspect the dry-run migration,
   verify Ruff/mypy/scoping/diff, push, attempt compatible rollout and keep actual
   provider/crash/concurrency acceptance explicit. No production email/fixture run.

Preparation/send leases use compare-and-set tokens so old workers cannot finish a
new claim. Existing daily-digest preference and 09:00 UTC schedule remain; minute
sweeps recover missed work. Provider acceptance is distinct from final inbox receipt.
New records are tenant-scoped internal persistence, not guest/member HTTP contracts;
no generated API declaration needs hand editing. Existing records remain readable;
no destructive migration, automatic record deletion or retrospective email backfill.

## Acceptance to record

Source verification: Ruff app/scripts, affected formatting, strict mypy app (215
files) and workspace scoping (24 repositories) pass. Production additive-index
dry run had no conflicts; apply created the four new indexes, and a subsequent
dry run reports all present, none missing, no conflicts and no review data changed.
No digest job, test suite or email provider was invoked for verification.

Fresh/legacy initialization, one day under duplicate schedule fires, interrupted
preparation/bulk insert/checkpoint, per-recipient failures and crash after provider
acceptance, expired leases/late completion, skipped/failed versus sent outcomes,
large private-comment prefixes with cursor continuation, boundary timestamps,
membership/email/preference/project changes, unavailable queue/provider and matching
API/worker/index rollout. No live acceptance is inferred from static checks.
