# TDR-0144: Observe the recent Arq worker revision in health

Date: 2026-10-24 (Asia/Calcutta). Backlog item: SUG-01 / DEP-01.

## Decision

GitHub deployment status cannot establish that an Arq worker process has
actually run. Register a small Arq cron job at startup and once per minute.
It writes a 95-second Redis heartbeat scoped by the configured environment,
containing only the validated Railway commit SHA, deployment UUID and UTC
observation time. No tenant records, queue payloads or credentials are stored.
The short TTL removes a stopped worker's observation automatically. During a
rolling update, the marker describes the worker that most recently ran the
reporting job, not every worker replica.

Expose the heartbeat as an additive Pydantic `worker` object on `/health`,
with status `recent` or `unknown`, nullable release/deployment identifiers and
reported time. Unknown includes absent, expired or malformed heartbeat data.
MongoDB/Redis still determine HTTP 200 vs 503; worker unknown does not turn
an otherwise functional API into an outage. A recent marker proves only that
Arq ran this reporting job, not that other queued jobs or providers succeed.
Extract the existing API Railway-identifier parsing into a shared helper so
both processes apply the same validation.

Regenerate saved OpenAPI and `packages/types` from the Pydantic response. Extend
the existing read-only smoke command with optional `--expected-worker-sha` so
the API and worker revisions can be checked independently. It requires a
recent heartbeat with the full expected SHA; the existing API-only gate remains
compatible with releases that have no worker observation.

## Acceptance and verification

Check Ruff, strict mypy, workspace scoping, OpenAPI parity and monorepo lint/
typecheck/build. After a matching worker rollout, inspect public `/health`
for a recent matching worker SHA and use the separate worker smoke gate.
Worker-job success, queue age, stale/expired heartbeat handling under an actual
stop and rolling-replica behavior remain separate operational acceptance.
No test suite is written or run under AGENTS.md.
