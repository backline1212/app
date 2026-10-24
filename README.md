<p align="center">
  <img src="docs/banner.jpg" alt="Backline — Contextual feedback. Zero friction." width="100%" />
</p>

<p align="center">
  <a href="docs/spec/00-README.md"><img src="https://img.shields.io/badge/spec-v1.0-7c3aed?style=flat-square" alt="Spec v1.0" /></a>
  <a href="DEPLOYMENT.md"><img src="https://img.shields.io/badge/deploy-Railway%20%2F%20Vercel-2563eb?style=flat-square" alt="Deployment" /></a>
  <img src="https://img.shields.io/badge/stack-FastAPI%20%7C%20React%20%7C%20MongoDB-f59e0b?style=flat-square" alt="Stack" />
</p>

---

**Backline** is a collaborative website review platform. Clients open a link, click anywhere on a live or staging site, and leave a contextual comment — no account, no browser extension, no install required. Agencies get a full dashboard, kanban/list workflow, thread replies, and integrations (Slack, ClickUp, Trello) so feedback never falls back to email.

> **Differentiator:** Comments attach to a **Persistent Anchor** — a structural + text + visual fingerprint of the DOM element, not to fragile x/y screen coordinates. When the page changes, the **Recovery Engine** re-locates the element and tells the user honestly when it can't.

---

## 📚 Documentation

| Document | Description |
|---|---|
| [`docs/spec/00-README.md`](docs/spec/00-README.md) | Master engineering specification (source of truth) |
| [`docs/implementation/00-index.md`](docs/implementation/00-index.md) | Final Draft product amendment, flow matrix & implementation plan |
| [`docs/implementation/pending-backlog-2026-10-24.md`](docs/implementation/pending-backlog-2026-10-24.md) | Current open work and optimization inventory |
| [`docs/implementation/06-delivery.md`](docs/implementation/06-delivery.md) | Dated source, rollout and acceptance evidence |
| [`docs/spec/20-Build-Plan.md`](docs/spec/20-Build-Plan.md) | Milestone build order & Definition of Done |
| [`docs/launch-readiness.md`](docs/launch-readiness.md) | Historical M12 acceptance audit and runbook; check the current ledger for later changes |
| [`RUNNING_LOCALLY.md`](RUNNING_LOCALLY.md) | Click-by-click local dev guide (non-developer friendly) |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Production deployment guide |

---

## Current delivery state

The M0–M12 build plan and launch-readiness audit describe an earlier milestone
baseline. They do not certify current production behavior. The [current pending-work
inventory](docs/implementation/pending-backlog-2026-10-24.md) separates source
implementation, deployment, live acceptance and roadmap scope; the [delivery
ledger](docs/implementation/06-delivery.md) records verification for each later
change. On 2026-10-24, the public API recovered and `/health` identified
release `612e60a` with MongoDB and Redis healthy. Worker deployment status
succeeded; queue behavior and end-to-end browser acceptance remain open.

---

## 🏗️ Repository Layout

```
apps/
  web/        Agency dashboard (React + Vite)
  widget/     Review SDK bundle (vanilla TS, injected into reviewed sites)
  e2e/        Playwright accessibility + performance + e2e test suite
  extension/  Browser extension (optional install mode)
backend/      FastAPI application (router → service → repository)
packages/
  ui/         Shared design-system components
  types/      Generated TypeScript types from the backend's OpenAPI schema
docs/
  spec/       The 20-file engineering specification (source of truth)
  tdr/        Technical Decision Records (dated amendments)
  implementation/  Final Draft product flows and delivery tracking
infra/        Local dev service scripts + Docker Compose
scripts/      Repo-level helper scripts
```

---

## 🚀 Quick Start (Local Development)

**Prerequisites:** Node 20, pnpm, Python 3.12, and either Docker or native `mongod` / `redis-server` / `minio` binaries on `PATH`.

> No Docker? See [`docs/tdr/0001-local-toolchain-without-docker.md`](docs/tdr/0001-local-toolchain-without-docker.md). Full click-by-click guide: [`RUNNING_LOCALLY.md`](RUNNING_LOCALLY.md).

```bash
# 1. Start Mongo / Redis / MinIO
./infra/local/start-all.sh          # native binaries, or:
docker compose up -d                # if you have Docker

# 2. Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 3. Background worker (separate terminal — from backend/)
#    Handles: recovery pipeline (M8), integration dispatch,
#    webhook retries, and email digests (M10).
uv run arq app.workers.main.WorkerSettings

# 4. Frontend (separate terminal — from repo root)
pnpm install
pnpm --filter @backline/web dev

# 5. Widget bundle (build at least once)
pnpm --filter @backline/widget build
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:5173 |
| Backend API docs | http://localhost:8000/docs |

```bash
# Stop native local services
./infra/local/stop-all.sh
```

### Trying the widget yourself

```bash
# With the backend + local services running, and a share link token in hand:
cd apps/widget && pnpm build
python3 -m http.server 4173
# Open: http://localhost:4173/test-site/index.html?shareToken=<your-token>
```

---

## 🔑 Credentials & Third-Party Setup

| Service | Required for | Setup |
|---|---|---|
| Google OAuth | Member sign-in via Google | See `.env.example` |
| Resend or Google Apps Script | OTP emails + notification digests | See `.env.example` and deployment guidance |
| ClickUp OAuth | ClickUp integration | Needs real ClickUp app credentials |
| Slack | Slack integration | Paste a webhook URL — no app registration needed |
| Trello | Trello integration | Paste API key + token — no app registration needed |

> In explicit local mode, an unconfigured email provider can log an email preview.
> Production email failure returns an error and never reports a code as delivered.
> Google and ClickUp OAuth require their own configured provider credentials.

---

## 🛠️ Common Commands

```bash
# Frontend — lint, typecheck, build all workspaces
pnpm turbo run lint typecheck build

# Backend — lint and typecheck
cd backend
uv run ruff check .
uv run mypy app/

# Workspace scoping audit (enforces tenant isolation)
cd backend && uv run python scripts/check_workspace_scoping.py
```

### Accessibility / Performance e2e suite (`apps/e2e`)

Requires the real stack running, with the frontend served via `vite preview` (production build — not `vite dev`).

```bash
# Build + preview frontend (separate terminal)
cd apps/web && pnpm build && pnpm preview --port 4173

# Run the suite
cd apps/e2e
BACKEND_LOG_PATH=<path-to-backend-stdout> \
WEB_BASE_URL=http://localhost:4173 \
pnpm test:a11y    # or test:perf, or test:e2e (full suite)
```

### Deploy readiness (`backend/scripts`)

```bash
cd backend

# Post-deploy health gate (/health + /openapi.json)
uv run python scripts/smoke_test.py [base_url]

# 90-second load test (38 k requests, 8 concurrent workers)
uv run python scripts/soak_test.py --backend-log <path> --duration 90 --concurrency 8
```

---

## 🔄 Regenerating API Types

Whenever backend routes or schemas change, regenerate `packages/types` against a running backend:

```bash
cd packages/types && pnpm generate
```

---

## 🔐 Security & Multi-tenancy

- Tenant repository access is checked by `backend/scripts/check_workspace_scoping.py`;
  review new queries and mutations for workspace scope.
- Guest APIs never expose team content or client contact records.
- Rate limiting applied to all guest-writable endpoints.

---

## 📖 Architecture at a Glance

```
Browser (Guest)
  └─ Review Widget (apps/widget) ──────────────────┐
                                                    ▼
Browser (Agency)                           FastAPI Backend (backend/)
  └─ Dashboard (apps/web)  ───── REST/WS ──► Router → Service → Repository
                                                    │
                          ┌─────────────────────────┤
                          │                         │
                       MongoDB                    Redis
                    (comments,                (pub/sub, job
                    anchors, revisions)         queues via Arq)
                          │
                        MinIO / S3-compatible
                    (screenshots, DOM snapshots)
```

See [`docs/spec/03-System-Architecture.md`](docs/spec/03-System-Architecture.md) for the full layered architecture.

---

## 🤝 Contributing

1. Read the [Engineering Principles](docs/spec/02-Engineering-Principles.md) before touching anything.
2. Follow `AGENTS.md` and the current task instructions for verification.
3. Run `pnpm turbo run lint typecheck build` (frontend) and backend Ruff/mypy for affected code; record what actually passed in the delivery ledger.
4. Significant scope or design changes require a dated TDR in `docs/tdr/`.

---

<p align="center">Built with ♥ by the Backline team</p>
