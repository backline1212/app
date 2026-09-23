# 04 - Technology Decisions

## 4.1 Stack Summary

| Layer | Choice | Rationale |
|---|---|---|
| Frontend framework | React 18 + TypeScript, Vite | Fast dev server, wide hiring pool, no framework lock-in needed since this isn't SEO-dependent (dashboard is behind auth) |
| Server state | TanStack React Query v5 | Cache, dedupe, and background refetch for anything from the API; avoids hand-rolled loading/error state everywhere |
| Client/UI state | Zustand | Small, no boilerplate, explicit separation from server state (`14-State-Management.md`) |
| Styling | Tailwind CSS + shared `packages/ui` component library | Design tokens as Tailwind theme config keeps `15-Design-System.md` enforceable in code, not just docs |
| Backend framework | FastAPI (Python 3.12) | Async-native, Pydantic v2 gives Rule 3 (Single Source of Truth) for free via OpenAPI generation |
| Database | MongoDB Atlas | Document model fits the comment/anchor/snapshot nesting well; workspace-scoped sharding path exists if needed later |
| Object storage | Cloudflare R2 | S3-compatible API, no egress fees - screenshots/snapshots are read far more than written, egress cost matters |
| Realtime | FastAPI WebSocket routes + Redis pub/sub | Redis fan-out lets the API scale horizontally without sticky sessions |
| Background jobs | Arq (Redis-backed async task queue) | Stays in the Python/async ecosystem already used for FastAPI + Redis; avoids standing up Celery/RabbitMQ for MVP scale |
| Email | Resend | Good deliverability defaults, simple API, React Email templates |
| Auth | Google OAuth (agency members) + Email OTP (agency members) + signed share-link tokens (guests) | Covers both "fast login" and "no-Google-account" agency users; guests never need an account at all |
| Frontend hosting | Vercel | Edge network for dashboard static assets; preview deployments per PR |
| Backend hosting | Railway | Simple container deploy, good Postgres/Redis/Mongo add-on story, no need for full K8s at this stage |
| CI/CD | Vercel + Railway Git integrations; local verification | Pushes to the configured production branch deploy directly; hosted GitHub Actions is intentionally disabled per TDR-0027 |
| Monorepo tooling | pnpm workspaces + Turborepo | Shared `packages/ui` and `packages/types` without publishing to a registry |

## 4.2 Explicitly Rejected Alternatives (and why)

| Rejected | In favor of | Reason |
|---|---|---|
| Next.js | Vite + React Router | Dashboard needs no SSR/SEO; Next's server-rendering adds deployment complexity with no benefit here |
| Redux / Redux Toolkit | Zustand + React Query | Redux's ceremony is solving a problem (normalized global server-state cache) React Query already solves better |
| PostgreSQL | MongoDB | Comment/anchor/snapshot documents are naturally nested and schema-flexible (anchor strategy will evolve, `08-Anchor-Engine.md`); a relational join-heavy model would fight that |
| Socket.IO | Native WebSockets (FastAPI) + Redis | Avoids a second protocol layer; FastAPI's native WS support plus Redis pub/sub is sufficient for the event set in `12-API-WebSocket.md` |
| Celery + RabbitMQ | Arq + Redis | One less piece of infra to run; Redis is already required for WS fan-out and rate limiting |
| AWS S3 | Cloudflare R2 | Zero egress fees matter directly - screenshots are fetched constantly by the dashboard |
| Self-managed Postgres/Mongo | MongoDB Atlas (managed) | No dedicated DBA; managed backups/failover are worth the cost at this team size |

## 4.3 Versions Pinned At Project Start

```
Python        3.12.x
FastAPI       0.115.x
Pydantic      2.9.x
Motor         3.6.x   (async MongoDB driver)
Node.js       20 LTS
React         18.3.x
TypeScript    5.6.x
React Query   5.x
Vite          5.x
Tailwind CSS  3.4.x
```
Pin exact versions in `pyproject.toml` / `package.json` lockfiles; bump deliberately via a TDR, not silently through `^` ranges drifting on a fresh `pnpm install`.

## 4.4 Environments

| Env | Frontend | Backend | Database | Purpose |
|---|---|---|---|---|
| `local` | Vite dev server | `uvicorn --reload` | MongoDB via Docker Compose (or native binary, see TDR-0001) | Development |
| `preview` | Vercel PR preview | Railway PR environment | Atlas shared preview cluster | Per-PR review |
| `staging` | Vercel `staging` branch | Railway `staging` service | Atlas staging cluster | Pre-release verification |
| `production` | Vercel `main` | Railway `production` service | Atlas production cluster (backed up) | Live |

Full environment variable list and provisioning steps: `18-Storage-Deployment.md`.
