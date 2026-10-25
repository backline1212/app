# Go-live checklist (2026-10-25)

What the operator does to put the current `main` into production and keep it healthy.
Source of truth for open items stays [pending-backlog-2026-10-24.md](pending-backlog-2026-10-24.md);
this page is the short, ordered list.

## 1. Services

| Service | Where | Build / start |
|---|---|---|
| API | Railway | `backend/Dockerfile`, default target (`api`): `uvicorn app.main:app` |
| Worker | Railway | Same Dockerfile, **Docker Build Target = `worker`**: `arq app.workers.main.WorkerSettings`. Runs digests, client/approval emails, sweeps, previews. Without it, emails never leave the outbox. |
| Cloud login (optional) | Railway | `backend/Dockerfile.cloud_login` |
| Web | Vercel | `apps/web` (Vite). `vercel.json` sets SPA rewrites, immutable `/assets/*`, no-cache `index.html` and security headers. |

Deploy API and worker from the same commit, then the web app. Check with
`uv run python scripts/smoke_test.py <api-url> --expected-sha <sha> --expected-worker-sha <sha> --web-base-url <web-url>`.

## 2. Environment

API and worker (same values for both):

- **Required:** `ENVIRONMENT=production`, `MONGO_URI`, `MONGO_DB_NAME`, `REDIS_URL`,
  `JWT_SIGNING_KEY` (long random), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL`, `PUBLIC_API_BASE_URL`,
  `PUBLIC_DASHBOARD_BASE_URL`, `CORS_ALLOW_ORIGINS` (JSON array with the web origin),
  `INTEGRATIONS_ENCRYPTION_KEY` (Fernet key, never the dev default).
- **Email (one of):** `RESEND_API_KEY` + `RESEND_FROM_ADDRESS`, or
  `GOOGLE_APPS_SCRIPT_URL` + `GOOGLE_APPS_SCRIPT_SECRET`. Sign-in codes, invites, client
  reply/resolved emails, approval emails and digests all need it.
- **Must stay unset/false:** `ALLOW_PRIVATE_NETWORK_TARGETS` (startup refuses it
  outside local). `BILLING_SANDBOX_ENABLED` is ignored when `ENVIRONMENT=production`.
- **Optional:** Google sign-in (`GOOGLE_OAUTH_*`), billing (`STRIPE_*`, `RAZORPAY_*`;
  webhooks at `/api/v1/billing/webhooks/stripe` and `.../razorpay`), tracker OAuth
  (`CLICKUP_*`, `JIRA_*`, `ASANA_*`), AI (`GROQ_API_KEYS` JSON array; without it AI
  actions say "AI is not configured"), `SENTRY_DSN`, review preview/custom domains
  (`PROXY_PREVIEW_DOMAIN`, `CUSTOM_DOMAIN_CNAME_TARGET`, `VERCEL_*`).

Web (Vercel): `VITE_API_BASE_URL`, `VITE_SENTRY_DSN` (optional),
`VITE_EXTENSION_STORE_URL` (set once the Chrome Web Store listing is approved; until
then the dashboard offers the ZIP download).

## 3. One-time data steps (dry-run first, then `--apply`)

Run from `backend` against production with the production environment loaded:

1. `python -m scripts.migrate_ticket_numbers` → `--apply` (ticket numbers for old comments).
2. `python -m scripts.migrate_event_projects` → `--apply` (project ids on old activity).
3. Optional, any time after launch: `python -m scripts.gc_unreferenced_uploads` →
   `--apply` (removes uploads no comment used, older than 7 days; returns quota).

## 4. Browser extension

Submit **0.5.12** (`apps/web/public/backline-extension-0.5.12.zip`, details in
[chrome-web-store-handoff-2026-10-25.md](chrome-web-store-handoff-2026-10-25.md)).
It supersedes every earlier package. After approval set `VITE_EXTENSION_STORE_URL`.

## 5. After deploy: quick checks

- Sign in with an email code; create a website project; open the review link as a
  guest in a private window; leave a comment; reply from the dashboard; the client gets
  the reply email (worker + email provider working).
- Upload an image to a file project; approve it as the guest; the uploader sees the
  notification.
- Open Browser extension page: it reports the installed extension version.
- `/health` shows Mongo, Redis and a recent worker heartbeat.
