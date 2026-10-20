# TDR-0089: Protect project edits from stale forms and lost responses

Date: 2026-10-20. Scope: audit F30, FD-04/07 project settings and rename recovery.

## Decision

Expose additive metadata_version (legacy zero). Versioned updates submit an expected
version and request ID together. Under the existing workspace transaction, reload
the project, check current project permission, reject a stale version, and save
metadata/settings/client assignment, audit and a replay marker atomically. The marker
binds ID, actor, expected version and body fingerprint. Check it before validating
new client assignment so an already-applied retry returns without another mutation,
audit event or integration dispatch. If another versioned save replaces the marker,
an older retry conflicts instead of overwriting newer state. This is a bounded last
request marker, not an unbounded response journal.

Metadata, direct settings and archive mutations increment the version. Preview,
deployment bookkeeping and file activity do not invalidate an unrelated metadata
form. Legacy API requests without either concurrency field remain compatible; they
are not promised compare-and-set behavior. No migration/index rewrite is required.
Integration dispatch remains post-commit and does not gain a durable outbox here.

ProjectForm captures the version belonging to its initial values, not a background
refetch's newer version. It freezes the original request for uncertain saves. On
conflict, show all draft details for clipboard/manual copy, then explicitly load
the latest values and version before making another request. Loading latest replaces
the form; it does not silently merge a teammate's changes. A failed reload retains
the draft and error. Rename uses the same stable version/request, guards duplicate
submit/pending close and freezes input after an uncertain response. Its conflict
recovery explicitly reloads the saved name. No source changes alter other members'
records or send shared notifications for verification.

## Verification and pending acceptance

Pydantic contracts regenerate packages/types. Backend Ruff and affected mypy passed
before final replay/client validation refinement. Full backend/frontend checks and
rollout are in progress. No suite written/run per this task's Codex instruction.
Browser use is unavailable. Pending: concurrent forms/renames/settings, lost response
replay, replaced marker, different actor/body ID reuse, nested-client rollback,
permission loss, reload failure and copy/close/Escape flow. Legacy callers and
post-commit integration durability remain explicit boundaries.

Final source checks pass: full frontend 12/12, affected final web 3/3 after copy
refinement, backend Ruff/full mypy (213 files), final affected mypy (9 files), scope
audit (23 repositories), contract generation and diff checks. Current workspace
membership/role is reread inside the metadata transaction. Deployment/contract
rollout remains distinct from actual concurrent/browser acceptance.
