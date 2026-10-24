# Launch Readiness (Milestone 12)

> Historical M12 audit. Later source, deployment and acceptance evidence is tracked
> in the [delivery ledger](implementation/06-delivery.md); current open work is in
> the [2026-10-24 inventory](implementation/pending-backlog-2026-10-24.md).
> Statements about tests, CI, provider setup and production readiness below
> describe that earlier milestone and should not be read as current certification.

Per `20-Build-Plan.md` M12's DoD: "every acceptance criterion listed anywhere in this
spec has a corresponding passing automated test or a documented manual verification;
production deploy succeeds with a clean smoke test." This document is that audit, plus
the rollback plan, monitoring/on-call setup, and a record of what still needs real
cloud credentials this environment doesn't have.

## 1. Acceptance Criteria Traceability

### `01-Product-Vision.md` §1.10 Success Metrics

| Metric | Target | Status |
|---|---|---|
| Link-tap to first posted comment (new client, iPhone Safari) | < 30s | **Structural enablers automated** (SDK bundle < 40KB gzipped, gated in CI since M0; widget flow verified in real Chromium - `apps/e2e/tests/journeys/journey-2`). The literal "30 seconds, a real human, an actual iPhone" measurement was never performed - same category of gap as M9's onboarding-time metric below. |
| Screenshot capture success rate (top 20 browser/OS combos) | >= 90% | **Not measured.** Every milestone's real-browser verification used Chromium only. No cross-browser/cross-OS test matrix exists. **Gap** - would need BrowserStack/Sauce Labs or a real device lab, neither provisioned. |
| PM triage throughput (50 comments, 3 pages) | < 10 min | Recorded as verified in `20-Build-Plan.md`'s M6 entry ("measured in a usability pass"). Not independently re-verified this milestone; the nature of that pass (scripted timing vs. a real participant) isn't documented well enough to certify further either way. |
| Agency onboarding: signup -> first client link sent | < 10 min, unaided | **Documented gap** (`20-Build-Plan.md` M9: "the under 10 minutes unaided real participant measurement... wasn't performed"). The structural path itself (signup -> workspace -> project -> share link) is proven end-to-end and fast in `apps/e2e/tests/journeys/journey-1` (~2s against a local stack, not indicative of the human-time metric). |
| Comment -> ClickUp round trip | 100%, preserves screenshot/metadata/backlink | Verified against a **mocked** ClickUp API boundary, 20/20 runs (`backend/tests/test_integrations.py`, recorded in M10). Needs real ClickUp app credentials for a live check - undone, consistent with Google OAuth's own gap. |
| Client-visible/team-only leak rate | 0, server-enforced, tested every release | **Solid, multi-layered coverage**: permission-matrix unit tests (`test_comments.py` since M4), the full manual workspace-scoping audit (M11, `docs/tdr/0010`), and now a real end-to-end proof (`apps/e2e/tests/journeys/journey-3`) - a team member posts a team-only reply through the actual dashboard UI, and a second, independent raw API call using the guest's own session token asserts it's absent from the response the guest actually receives. |

### F1 - Zero Friction (no account, no extension, comment from a link)

Covered end-to-end: `apps/e2e/tests/widget-accessibility.spec.ts` and
`journeys/journey-2` drive the real guest flow (open link -> name prompt only -> click
-> comment, on a mobile viewport) against the real built SDK, no login. No leftover
manual-only gap.

### F3 - Layer Separation (team vs. client, server-enforced, visually unambiguous)

Covered end-to-end (see the Success Metrics row above for the security proof).
Visual-distinction requirement (`15-Design-System.md` §15.7: color + lock icon + text
label, never color alone) implemented in `packages/ui/src/Badge.tsx`'s `LayerBadge` and
checked by the M11/M12 axe-core suite on every screen it appears on.

**Found and fixed this milestone**: the dashboard had no thread/reply UI at all before
M12 - F3's "discuss issues" half of the product had no way to actually happen through
the product itself, only through raw API calls. Added `CommentThreadPanel`
(`apps/web/src/features/board/CommentThreadPanel.tsx`) - reply list with per-message
layer badges, a layer-aware reply composer. See `docs/tdr/0011`.

### F7 - Onboarding Empty State (seeded example project)

**Found and fixed this milestone**: the seeded "Example Project"'s three sample
comments were meant to demonstrate a client note, a team-only *reply* to it, and a
separately-resolved thread (`backend/app/modules/workspaces/onboarding.py`'s own
docstring says so) - but the reply's `parent_id` was hardcoded to `None` regardless, so
it rendered as an unrelated third top-level comment, not a thread, silently defeating
the "teach by doing" intent. Fixed; `backend/tests/test_onboarding.py` now asserts the
parent/reply relationship explicitly so this can't regress unnoticed again.

### `19-Testing-CI.md` §19.3 Critical Playwright Journeys

All 5 committed and passing against a real, live stack (`apps/e2e/tests/journeys/`):

1. Signup -> workspace -> project -> share link. Google OAuth substituted with the
   email/OTP path (same downstream flow; OAuth itself needs real Google app credentials).
2. Guest posts a comment on a mobile viewport; dashboard receives it live over
   WebSocket, no refresh.
3. Team-only reply hidden from the guest's raw API response (see above).
4. A structural page change (real second snapshot, real Arq recovery job, real worker
   process) orphans a comment; the dashboard's `RecoveryBadge` updates live.
5. Comment -> ClickUp round trip: **not re-driven as a live Playwright journey** - needs
   real ClickUp credentials (see the Success Metrics table above). Covered instead by
   `backend/tests/test_integrations.py`'s 20-run mocked-boundary test from M10.

### `19-Testing-CI.md` §19.5 Performance Budgets

- SDK bundle < 40KB gzipped: enforced in CI (`ci.yml`'s bundle-size step, M0). Currently
  ~5.3KB gzipped.
- Board view Time-to-Interactive < 2.5s on a throttled profile: `apps/e2e/tests/
  performance.spec.ts`, via `playwright-lighthouse` against the **production build**
  (`vite preview`, not `vite dev` - see `docs/tdr/0010` for why that distinction matters).

### Security / `06-Backend-Architecture.md` §6.4

Full manual workspace-scoping audit plus the AST-based CI lint rule (M11,
`docs/tdr/0010`). No critical/high findings from `pip-audit`/`pnpm audit`, checked
again this milestone (`pnpm audit --audit-level=high`: clean).

### Accessibility / `15-Design-System.md` §15.7

Every dashboard screen, the widget's shadow-DOM UI, and (new this milestone) the
`CommentThreadPanel` all pass an automated WCAG AA axe-core scan
(`apps/e2e/tests/accessibility.spec.ts`, `widget-accessibility.spec.ts`,
`journeys/journey-3`). Found and fixed two more real contrast failures this milestone
(the `layer-client`/`layer-team` badge colors, ~2.4:1 and ~4.5:1 against their own
badge backgrounds) on top of M11's findings.

## 2. Production Provisioning (`18-Storage-Deployment.md` §18.4)

`backend/Dockerfile` (Railway's deploy target, §18.6) added this milestone - it didn't
exist before, despite `docker-compose.yml` (the local Docker-available path) already
being in place since M0. The minimal feature-flag system (§18.7: `feature_flags`
collection, `use_feature_flag`/`useFeatureFlag`) is added - see `docs/tdr/0011`.

**Not done - genuinely can't be, from this environment**: actual Vercel/Railway/Atlas/R2
account provisioning, DNS, and a real production deploy. No cloud credentials exist in
this session, the same category of gap as Google/ClickUp OAuth throughout the build.
The Dockerfile, `docker-compose.yml`, CI `deploy` job, and smoke-test script are all
real and ready to run the moment those accounts exist; none of it has been exercised
against real infrastructure.

## 3. Monitoring & On-Call

See `docs/tdr/0011` for the tool choice and reasoning. Summary: Sentry SDK wired into
both backend (FastAPI) and frontend (React), gated on `SENTRY_DSN` being set (a no-op
otherwise, same pattern as every other credential-gated integration in this codebase).
Uptime checks are external-service config (e.g. a `GET /health` check on a service like
UptimeRobot/Better Uptime) - documented below, not provisioned, since it's an external
account this session has no access to.

**On-call runbook** (who does what when `/health` starts failing or Sentry pages):
1. Check Railway's deploy log for the backend service - a failed migration or crash-loop
   is the most common cause given this app's shape (no long-running stateful workers
   besides the Arq queue, which fails independently and doesn't take `/health` down).
2. Check Atlas and the Redis addon's own status pages - `/health` already checks both
   (`{"status": "ok", "mongo": "ok"|"unreachable", "redis": "ok"|"unreachable"}`), so a
   dependency outage is visible there before it's visible anywhere else.
3. If the last deploy is the suspect, roll back (§4 below) before debugging further -
   restoring service comes before root-causing it.
4. Arq worker failures (visible in Railway's worker service logs, not `/health`) degrade
   gracefully: recovery/integration/digest jobs queue up and catch up once the worker
   recovers, they don't block any user-facing request path.

## 4. Rollback Plan

- **Frontend (Vercel)**: every deploy is immutable and addressable - Vercel's dashboard
  (or `vercel rollback`) repoints the `production` alias at the previous deployment
  instantly. No data migration risk on this side ever (static assets only).
- **Backend (Railway)**: Railway keeps prior deploy images; redeploying the last known
  good image via the dashboard (or `railway rollback` if using the CLI) is the fastest
  path. Because this codebase has no destructive in-place migrations (Mongo is
  schema-less; new fields are additive, per `02-Engineering-Principles.md`'s
  incremental-delivery principle, P8), rolling the backend back independently of the
  database is safe - an older backend version simply ignores fields it doesn't know
  about yet.
- **Database (Atlas)**: daily backups (§18.4) are the recovery path for actual data
  corruption, not routine rollback - a bad deploy alone should never need one, by the
  additive-migration point above.
- **Feature flags** (`docs/tdr/0011`): the fastest rollback for a single bad *feature*
  (not a bad deploy) is flipping its flag off - no deploy required, seconds not minutes.
- **Smoke test gate**: per `18-Storage-Deployment.md` §18.8, a deploy isn't considered
  healthy until a post-deploy smoke test (`backend/scripts/smoke_test.py`, this
  milestone) passes against `/health` and a read-only API endpoint - a failing smoke
  test is the trigger for the rollback steps above, not a judgment call.

## 5. Staging Soak Test

No real staging environment exists to soak-test (§2). As a local substitute,
`backend/scripts/soak_test.py` (this milestone) drives realistic sustained traffic
(guest sessions, page registration, snapshots, comments, each from a distinct fake IP -
otherwise every cycle competes for one guest's rate-limit budget) against the real
local stack. A 90s / 8-concurrent-workers run: **38,165 requests, 0 failures, backend
RSS flat (100.4MB -> 99.8MB, no growth), Arq queue backlog settled at 16 (well within
what the worker keeps up with)**. See `docs/tdr/0011` for more detail, and the honest
caveat: 90 seconds against a local machine is not a real multi-hour staging soak.
