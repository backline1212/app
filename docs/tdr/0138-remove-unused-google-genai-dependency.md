# TDR-0138: Remove the unused Google Gen AI dependency

Date: 2026-10-24 (Asia/Calcutta). Backlog item: SUG-14.

## Decision

AI calls use Groq over `httpx`; no application or script imports `google-genai`.
Remove its pinned direct dependency and regenerate `uv.lock` without upgrading
other packages. Keep `google-auth` for Google sign-in, `pillow` for asset image
handling, and the Google mypy override required by `google-auth`. Update
nearby dependency comments that described the old lock repair.

The lockfile loses only the direct requirement and package entry for
`google-genai`; its transitive packages remain because other dependencies
need them. No AI API, model, schema, tenant or data behavior changes. Pillow
remains explicitly pinned at 11.3.0; a separate supported dependency update
can review newer versions and security advisories.

## Acceptance and verification

Check `uv lock --check --offline`, backend Ruff, mypy, workspace-scope and
diff. Verify both API and worker container builds after the matching rollout;
the current API outage prevents live AI acceptance. No test suite is added
under AGENTS.md. No runtime dependency sync or production mutation is needed
for this source change.
