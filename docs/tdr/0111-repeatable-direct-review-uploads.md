# TDR-0111: Repeatable direct review uploads

Date: 2026-10-22. Backlog item: BUG-07, bounded API-relay slice.

## Plan and decision

The same-origin `/uploads/direct` relay can complete an object write and lose its
response. Retrying the same bytes currently creates another random object and
storage reservation. The widget also falls back to this relay after a signed PUT
failure, so the ambiguity occurs in the core screenshot/attachment flow.

For direct uploads, derive the object key from the workspace, project, actor,
declared content type and SHA-256 of the validated bytes. Identical content from
the same actor in the same project then reuses one key across retries, including a
new request after reload. Different actors, projects, types or bytes get different
keys. The server remains the only writer of these deterministic keys. Make the
upload-reference insert idempotent only when all ownership/content fields match;
a different record at that key is a conflict. Preserve legacy random keys and
the signed PUT contract. Project deletion remains the object lifecycle boundary,
so several comments can safely reference one direct-upload object.

This avoids duplicate direct-relay objects after an ambiguous response and does
not require an added index or changed HTTP schema. It does not reclaim unused
signed PUT grants or distinguish an interrupted browser upload from a completed
one. Signed-grant transport and orphan reconciliation remain separate BUG-06/07
work. No automatic deletion is introduced.

## Acceptance and verification

Run affected backend Ruff, format, strict mypy, workspace-scope and diff checks.
Codex adds no test suite under this task's AGENTS.md rule. Live acceptance after
backend rollout: submit the same byte content twice (including a lost first
response) and observe one key/hold; change bytes/type/actor/project and observe
distinct keys; verify comment and screenshot references, access failures, quota,
legacy upload references and project deletion. Avoid shared-data fixture writes.

Source verification on 2026-10-22: full backend Ruff, affected format, full strict
mypy (217 files), affected mypy (2 files), workspace-scope (25 repositories) and
diff checks pass. No suite or shared object write was run. Live acceptance awaits
the backend rollout.
