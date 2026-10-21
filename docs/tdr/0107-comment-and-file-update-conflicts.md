# TDR-0107: Detect concurrent comment, ticket and file edits

Date: 2026-10-22. Backlog item: BUG-04.

## Plan

1. Add an integer revision to member comment/ticket and file responses. Legacy
   records read as revision 0; no destructive backfill or new index is needed.
2. Increment the comment revision on human edits, AI priority writes and file
   reanchors. Check a supplied expected revision in the same scoped Mongo update as
   the change. A missing expected revision remains accepted for older clients during
   mixed rollout, and is recorded as a compatibility limit.
3. Apply the same scoped revision check inside the existing file transaction. A
   rejected rename must not change its linked page title. Return 409 on a mismatch,
   preserving the caller's form content for reload/copy/review.
4. Regenerate OpenAPI TypeScript from Pydantic. Pass the rendered row revision at
   every member comment/ticket/file update entry point. Keep existing PATCH field
   selection so unrelated fields are not sent from text edits.
5. Verify backend Ruff/mypy/scope, generated types, web lint/typecheck/build and
   diff. Push; release API and web in a compatible order when Railway accepts
   deploys. Record actual stale-tab and mixed-version acceptance separately.

The revision covers the full comment or asset. A concurrent change to a different
field can therefore produce a 409 that the user resolves by reloading; this favors
preventing silent overwrites. System recovery updates to anchor health alone do not
change the human edit revision. Legacy callers without an expectation retain their
old update behavior until their client is upgraded; rollout evidence must not claim
universal conflict prevention before then.

## Acceptance

Source checks: generated OpenAPI/types, backend Ruff/mypy/scope, types typecheck,
web lint/typecheck/build and diff pass. No test suite or shared record was mutated.
The browser remains unavailable in Work settings and Railway still serves the
older API commit at this checkpoint, so the cases below are unverified live.

Two editors starting from the same revision: one save succeeds, the other sees 409
and retains its draft. Reload then save succeeds. Compare legacy revision 0, status,
priority, body, assignee, waiting, due date, tags and file rename/archive/restore.
Race around linked page title stays transactional. Verify all comment/ticket UI
entry points and old/new client overlap against the actual deployed API.
