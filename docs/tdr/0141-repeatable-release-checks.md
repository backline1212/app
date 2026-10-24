# TDR-0141: Repeatable local and post-deploy release checks

Date: 2026-10-24 (Asia/Calcutta). Backlog item: SUG-01 / DEP-01.

## Decision

Keep release verification operator-driven under TDR-0027. Add a Windows
`scripts/check-release.ps1` command that runs the offline backend lock check,
Ruff, strict mypy, workspace-scope lint, current-vs-saved OpenAPI equality,
monorepo lint/typecheck/build and a patch whitespace check. It does not contact
shared services, run fixtures or write a test suite.

Extend the existing read-only `backend/scripts/smoke_test.py` with optional
`--expected-sha` and `--contract` arguments. It checks `/health` dependency
status, `/api/v1/auth/capabilities` response shape and `/openapi.json` routing.
When supplied, the full expected SHA must equal the health release SHA and the
live OpenAPI JSON must equal the saved contract. The original positional URL and
`SMOKE_TEST_BASE_URL` behavior remain usable. An absent release SHA can still
pass the basic gate for local or non-GitHub deployments, but cannot pass an
exact-revision gate. This only identifies the API; worker and web release
identity, queues, browser flows and rollback still need separate evidence.

## Acceptance and verification

Run the local command from the repository and the smoke command against the
public API with the full confirmed API SHA and checked-in contract. Record the
actual result in the delivery ledger. No new test suite is written or run under
AGENTS.md.
