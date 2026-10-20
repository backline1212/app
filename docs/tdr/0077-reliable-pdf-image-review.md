# TDR-0077: Make PDF/image preview and pin movement usable

Date: 2026-10-20. Status: implemented; verification/rollout in progress.

## Context

The user explicitly requested working PDF/image commenting and repairs from the
site gap-audit file. F31 is addressed by TDR-0076 replay changes. Further source
inspection found that file pin move/resize called the website reanchor endpoint,
whose schema discards the submitted region and replaces the asset anchor with an
empty website anchor. PDF rendering fetched signed object URLs directly and created
a new loading task whenever periodic file metadata reads rotated those URLs.

## Decision

- Add a member-only file-region mutation with the existing comment:reanchor project
  permission. Verify workspace/project/asset/page/root-comment association, reject
  archived/deleted records and cross-PDF-page moves, preserve kind/asset/region and
  publish normal update/audit events. The legacy website reanchor endpoint now
  rejects asset anchors so older clients cannot silently corrupt them.
- Add an authenticated, rate-limited private file-content endpoint. Resolve current
  member/guest project access on each request, hide archived files from guests,
  read at most the validated 20 MiB limit and always close the storage body. Return
  no-store/nosniff response headers and an escaped display filename. Keep private
  S3 storage; do not add bearer credentials to URLs or public object access.
- Load file bytes through React Query using asset/actor identity and cancellation;
  do not refetch immutable file content when signed metadata URLs rotate. Render
  PDF pages from one loaded document and bound canvas pixels/edge dimensions.
  Provide loading/error/retry controls, clean up object URLs/tasks, and gate pin
  creation/placement on actual preview readiness. No CORS-dependent direct storage
  fetch is required for the image/PDF preview; signed download links remain.
- Preserve nonempty comment/reply drafts across file/page/location changes and
  pending saves. Link a requested ticket to its actual asset/PDF page when opened
  from Backline, rather than defaulting to the first file. Show an archived-file
  recovery message; never silently replace a drafted file with another active file.
- Correct the PDF creation description: current comments belong to the uploaded
  document; complete replacement/build version mapping is not claimed to survive
  arbitrary re-exports. Original archived files/feedback remain retained.

No destructive migration, public bucket, new extension permission or server browser
execution is introduced. API contracts are additive and generated from FastAPI.

## Verification

Run affected backend Ruff/mypy/scoping and frontend lint/typecheck/build. Do not
write/run suites for this Codex task. Browser upload/render/page-pin/move/reply,
refresh, access loss, guest separation and narrow-screen acceptance remain open
while browser use is disabled in Work settings. Static checks cannot establish
successful production PDF rendering or storage/provider readiness.
