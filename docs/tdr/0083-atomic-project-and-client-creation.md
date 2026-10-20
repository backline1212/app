# TDR-0083: Recover project/client saves without duplicate creation

Date: 2026-10-20. Scope: audit F30 and the project/file onboarding flow.

## Decision

Project create accepts an optional client_request_id and nested new_client instead
of requiring the browser to commit a client first. Under TDR-0080's workspace
transaction, create the optional client, project, default review link and their audit
records together. A failure rolls back all those records and consumes no project
slot. Resolve-by-origin rechecks after acquiring the workspace write so simultaneous
extension auto-detection reuses the same project. Explicit manual creates can still
create separate projects for the same site.

Project/client creation replays require the same workspace, creator, request body
fingerprint and a live record. Project replays recheck current project visibility.
Existing non-idempotent API callers remain compatible; the portal supplies IDs.
Client creation and its audit record are also transactional for standalone Clients.
The shared canonical JSON hashing implementation moves to core without changing
comment replay's hashing or resource/actor checks.

Project settings can create and assign a client inside their metadata/settings/audit
transaction. The portal retains that client's request ID when an update is retried.
No new client contact fields appear in public review or guest responses. Provider
calls, notifications, integration dispatch and preview work remain outside retryable
Mongo callbacks. Access notifications after a project commit are not a durable
outbox: an interrupted post-commit notification may still need separate repair.

Project and client forms guard concurrent submission, freeze prepared details after
an ambiguous failure and retry the same payload. A definite first rejection unlocks
editing. Read-only details provide manual copying and closing instructs users to
check existing records before starting again. Request IDs live in the current form,
not localStorage business data. Successful project creation is retained by ref
before subsequent file uploads; already acknowledged project metadata is not recreated.
Starting-URL validation also mirrors the scheme detection fixed in TDR-0082.

## Index and verification boundary

New partial unique workspace/request-string indexes cover projects and clients.
The read-only production migration dry-run finds both missing, no duplicates or
definition conflicts, and changes no business data. Startup creates them additively;
legacy null/absent IDs are excluded. No destructive fixture, backfill or manual apply.

Static checks pass: full frontend lint/typecheck/build (12/12 Turbo tasks) and
affected web checks after form refinements, backend Ruff/full mypy (205 files),
affected-module follow-up mypy (25 files), scope audit (20 repositories), generated
contracts and diff checks. Existing chunk advisory remains. No suite written/run
per Codex instructions. Manual acceptance remains open: rollback on client/
link/audit failure, response-loss retry at a full quota, parallel resolve/create,
foreign actor/body ID collisions, client creation through settings, copied draft,
pending/dismiss behavior and partial file onboarding. File uploads are still a
separate storage operation: lost upload acknowledgements are not made idempotent by
this metadata slice. Project-update version conflicts/audit deduplication are also
separate from creation replay. No production client/project/feedback was written.
