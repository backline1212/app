# TDR-0076: Deliver file management, page approval and team notes

Date: 2026-10-20. Status: implemented; verification and rollout in progress.

## Context

The user requested the full site's Coming soon work alongside current login/comment
repairs. Manage files, Approve and Private were disabled controls despite existing
asset storage, revisions and team tickets. Image/PDF comments and standalone tickets
also lacked immutable replay behavior and some pending/draft protections.

## Decision

- Implement active/archived file management with upload, display-name edit,
  recoverable archive and restore. Keep the stored object, page and feedback;
  archiving removes an item from active review, not a privacy revocation or deletion.
  Guests cannot request archived file lists. Existing records without archived_at
  remain active. Serialize uploads/restores with a project-scoped transaction write
  before capacity checks (one active PDF or fifty images). Rename page titles in the
  same transaction; edits require existing asset:upload project permissions.
- Approve only a captured website page version, through member-only read/update
  endpoints. Record actor/time/version, expose stale status when the captured
  version changes, and offer reopen. Compare both latest revision and prior approval
  timestamp atomically so a stale dialog cannot approve/revoke a newer decision.
  Approval does not close tickets, freeze feedback or promise a site is bug-free.
  Guest PageOut/registration contracts do not expose internal approval metadata.
- Replace the disabled Private control with Team note. Open the existing team-only
  ticket flow with current project/page selected, explain guest invisibility, retain
  editor access and keep private text inside Backline. This is a portal note, not
  private DOM content injected into an untrusted website. Add immutable request IDs
  and exact-payload replay for new tickets and file comments using existing strict
  actor/resource/fingerprint guards; duplicate replay skips create notifications.
- Guard pending changes/uploads and preserve drafts across file/page selection.
  Provide copy/retry/close recovery for ambiguous saves. Honor member role capabilities
  in asset review and expose Manage files there as well as project menus.
- Keep the larger roadmap inventory in
  [coming-soon-delivery-2026-10-20.md](../implementation/coming-soon-delivery-2026-10-20.md).
  Do not relabel unbuilt native mobile execution, diagnostics, media recording,
  deploy coordination or domain infrastructure as complete.

Contracts are additive Pydantic models regenerated into packages/types. No destructive
migration, credential permission expansion or change to extension protocol/permissions.
Production mutation acceptance remains distinct from static and read-only checks.

## Verification

Run frontend lint/typecheck/build, backend Ruff/mypy and workspace-scope audit.
No suite is written/run for this Codex task. Verify supported browser entry/cancel,
empty/loading/error states and actual deployed assets. Record pending write, failure,
concurrency, role and guest acceptance in the delivery ledger; do not infer it from
the presence of a button or a successful build.
