# TDR-0084: Recover PDF/image upload acknowledgements

Date: 2026-10-20. Scope: the remaining file-onboarding retry gap after TDR-0083.

## Decision

Asset upload accepts an optional bounded multipart client_request_id. The portal
keeps one ID per immutable File/project object in memory, covering project onboarding
and Manage files. Server replay checks workspace, project, current upload permission,
creator, byte digest, safe filename and project type, and only returns an active
matching asset. Lookup happens before the capacity check, so retrying the one PDF
after its response was lost returns that PDF instead of rejecting a full project.

New asset/page/audit insertion commits in one project-serialized transaction. A
partial unique workspace/request-string index prevents cross-project replay races;
duplicates are reloaded and authorized without exposing unrelated records. New
uploads recheck live membership/session/project permission after inspection/storage
before committing. Existing no-ID callers remain compatible, and legacy records
remain readable. No replacement/overwrite of the user's existing asset record.

An ID-backed object key includes actor, request and payload digest. Retries write
the same immutable bytes to the same key; a conflicting body writes a distinct key
and cannot overwrite the winner. Storage precedes Mongo, so rejected or interrupted
requests can still leave unreferenced objects. Never delete such objects after an
ambiguous commit. Full storage-byte quota/orphan reconciliation remains F24.

Manage files retains failed batches and their File objects, skips acknowledged
uploads, and offers Retry remaining uploads even when the active count has reached
capacity. Close batch explains that uncertain files may already exist. No file bytes,
queue or business state are stored in localStorage; closing/reselecting starts a new
intent. Browser restart/reselection recovery is not a persisted upload queue.

## Verification

Production read-only dry-run confirms project/client creation indexes present and
only project_assets_workspace_create_request_strings missing, with no duplicates or
definition conflicts and no business data modified. Startup creates the additive index.
Contracts regenerated. Frontend lint/typecheck/build passes 12/12 and affected web
checks pass 3/3 after batch UX changes. Backend Ruff, mypy on affected modules (6
files), workspace scoping (20 repositories) and diff checks pass. Existing chunk
advisory remains. No suite written/run per Codex instructions. No production file,
comment or screenshot was uploaded. Pending manual acceptance: lost responses at
capacity, concurrent identical/conflicting IDs, role/session loss during upload,
batch retry/close and actual PDF/image review after retry.
