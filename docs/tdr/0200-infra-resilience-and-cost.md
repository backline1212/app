# TDR-0200: Realtime reconnect, bounded dependencies, worker health and cost trims

Date: 2026-10-27. Source: deploy/infra/cost audit.

## Findings

- The realtime subscriber ended for good on any Redis connection error; live updates
  stopped until the next deploy while `/health` stayed 200.
- Redis had no socket timeouts and Mongo used pymongo's 30 s server selection, so an
  unreachable dependency hung requests and `/health`.
- Nothing returned non-2xx when the worker stopped, so emails, digests and sweeps could
  stop unnoticed.
- A hosted service without `ENVIRONMENT` ran with local defaults (dev secrets accepted,
  cookies without Secure, emails only logged).
- Arq cancelled running jobs on SIGTERM (`job_completion_wait=0`), so a deploy could
  interrupt an email send and its retry send it again. The worker never reported errors
  to Sentry; the API traced 10% of health checks and polling.
- `/widget/sdk.js` was served without a cache header to every visitor of a client's site.

## Decisions

- The subscriber resubscribes with backoff (1 s doubling to 30 s) on its own Redis
  client (no read timeout, 30 s health-check ping). `/health` reports `realtime` and is
  503 while it reconnects.
- Shared Redis client: 5 s socket timeout, 3 s connect, 30 s health check, retry on
  timeout. Mongo: 5 s server selection and connect. Each `/health` check is capped at 3 s.
- `GET /health/worker`: 200 while the heartbeat is recent, otherwise 503, for an uptime
  monitor. `/health` itself still ignores the worker, so an API deploy never waits on it.
- Settings refuse `ENVIRONMENT` local/unset when Railway's own variables are present.
- `job_completion_wait = 20`; the worker initialises Sentry with the Arq integration when
  `SENTRY_DSN` is set; API tracing skips GET health, version, list and websocket paths.
- Widget SDK: `Cache-Control: public, max-age=300, stale-while-revalidate=86400`.

## Not changed here

Playwright in the image and the idle cloud-login service (needed once the server browser
is enabled; pausing the service is an operator choice), narrower Railway watch paths,
guest polling load, file relay through the API, signed-URL reuse and index creation at
boot stay in the backlog with the audit's figures.
