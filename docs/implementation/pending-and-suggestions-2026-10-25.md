# Pending work and suggestions (2026-10-25, updated 2026-10-27)

The short list of what is left after this round, in order of importance. Detail and history
stay in [pending-backlog-2026-10-24.md](pending-backlog-2026-10-24.md); deployment steps
are in [go-live-checklist-2026-10-25.md](go-live-checklist-2026-10-25.md).

## 1. Owner / operator actions (needed for launch)

| # | Action | Notes |
|---|---|---|
| 1 | Deploy API **and** worker from the same `main` commit, then the web app | Worker uses Docker build target `worker`; without it no email leaves the outbox. Check with `scripts/smoke_test.py`. |
| 2 | Configure an email provider | `RESEND_API_KEY` + `RESEND_FROM_ADDRESS` (or Apps Script). Sign-in codes, invitations, client and digest emails depend on it. Use Resend for the one-click unsubscribe headers (Apps Script can't send them), and set SPF/DKIM/DMARC for the sending domain. |
| 3 | Submit extension **0.5.13** to the Chrome Web Store | `apps/web/public/backline-extension-0.5.13.zip`, SHA-256 `493a7b8d…c6a2`; supersedes every earlier package. Then set `VITE_EXTENSION_STORE_URL`. |
| 4 | Run the data migrations, dry-run first | `python -m scripts.migrate_ticket_numbers`, `python -m scripts.migrate_event_projects`, then each with `--apply`. Optional: `scripts.gc_unreferenced_uploads`. |
| 5 | Decide on **Terms of Service** and a **refund/cancellation policy** | There is a privacy notice and support page but no Terms route. Payment providers (Razorpay in particular) expect Terms, refund and contact pages before live payments. Legal text needs the owner's approval, so it was not drafted. |
| 6 | Review the privacy notice as a whole | `/privacy` now describes screenshot preview, black-outs, `data-backline-private` masking and email unsubscribe (facts only). The owner should still approve the full text. |
| 7 | Set `SENTRY_DSN` / `VITE_SENTRY_DSN` | Optional but recommended before a wider pilot. |
| 8 | Uptime monitor on `/health/worker` | Returns 503 when the worker stops reporting (TDR-0200); `/health` alone can't see a stopped worker. |
| 9 | Check `ENVIRONMENT=production` on **every** Railway service | Since TDR-0200 a Railway service without it refuses to start (it used to run with local defaults). |
| 10 | Railway cost trims (optional) | Pause the idle `cloud-login` service while `SERVER_BROWSER_ENABLED=false`; narrow watch paths to `backend/app/**`, the lockfiles and Dockerfiles; the image installs three Playwright browsers (~1 GB) that only the disabled server browser uses. |
| 11 | Allow production hosts in this environment's network settings | Only needed if live production checks or Railway logs should be read from here (production and `backboard.railway.com` are blocked now). |

## 2. Live acceptance still to do (after deploy)

- Quick checks in the go-live checklist (sign-in, guest comment, client reply email,
  file approval, extension page, `/health`).
- Dashboard CSP (TDR-0188): open the deployed app with DevTools and confirm no
  Content-Security-Policy errors, including Razorpay checkout and Sentry.
- BUG-09: the old example.com preview failure still has no proven root cause; capture
  request/response evidence on production and verify a fix.
- BUG-12 (proxy 307/308) and QA-02/QA-03 passed locally; repeat on production. QA-03
  slow/partial uploads and the extension relay remain.
- Provider-failure behaviour for digests, integrations and email (BUG-02/04/05):
  restarts, retries and duplicate deliveries on real infrastructure.
- Screen-reader pass on the main flows. Automated axe checks are clean, and a
  keyboard-only pass of the main dialogs and popovers is done (two popovers fixed).
- OPT-05: a supported site/browser matrix with real success rates.

## 3. Engineering backlog (open)

| Item | What remains |
|---|---|
| Backend test suite | 33 tests fail identically before and after this round (stale against later designs: digests, upload keys, snapshot hashes, realtime access check, OTP wording, proxy streaming, provider fixtures). They should be updated by a workflow that allows writing tests. |
| OPT-01 pagination | Project, page and project-comment reads still load full lists; add cursor pagination with "Load more". |
| OPT-02 extension sync | Fingerprint polling works; deltas or push with deletion/revocation tombstones would cut traffic. |
| OPT-03/04 performance | Measure large projects (p50/p95, payloads, queue age) and real route bundle loading before more optimization. |
| FLOW-05 | Moving a comment to a different page; preview/verification history. |
| FEAT-08 | Durable undo history (only ticket close and bulk changes have Undo). |
| FEAT-12 | Automated verification run for the MCP fix-and-verify loop. |
| BUG-08 (rest) | Initial browser/Backline URLs, historical snapshots, arbitrary visible text, logs and exports. |
| BUG-10 | Reviewed reassignment workflow for old merged hash-route feedback. |
| Audit backlog (2026-10-27) | File bytes are relayed through the API (`/assets/{id}/content`, up to 20 MB buffered) because pdf.js and canvas thumbnails need same-origin bytes; direct R2 fetch needs bucket CORS checked first. Index creation runs at every boot (~96 calls). Permissive CORS also covers `/proxy/*`. Client reply/resolved emails could move to the durable outbox. |

## 4. Suggestions

- **CSP reporting:** add a `report-to` endpoint for the dashboard policy so production
  violations are seen, not guessed.
- **Client emails:** show the workspace logo when branding is set; today the header is
  the brand name.
- **Screenshots:** an optional full-page capture (black-outs and preview are done).
- **Security:** two-factor sign-in for workspace owners; later SSO/SAML for agencies.
- **Operations:** uptime monitoring and a status page; confirm MongoDB backups and an R2
  lifecycle rule; a load test before a wider launch.
- **Install guides:** links to a short video or doc page per platform, once the
  marketing site exists.

## Shipped 2026-10-27 (production-readiness pass)

backline1212/app#130 AI cost bounds, team notes kept out of client AI, MCP token revocation,
API key copy (TDR-0199) · #131 realtime reconnect, Redis/Mongo timeouts, `/health/worker`,
`ENVIRONMENT` guard, worker Sentry, widget cache (TDR-0200) · #132 security hardening:
project self-removal, sign-in code limits, room-code rejoin, canvas sessions, body limits,
domain claims, guest views, tracker scope, "edited" label (TDR-0201) · #133 cheaper polling,
reusable signed URLs (TDR-0202) · #134 AI error messages, client email retries (TDR-0203) ·
#135 file comments and standalone tickets reach integrations, `.env.example` (TDR-0204) ·
#136 lazy Sentry, honest error screen (TDR-0205).

## Shipped this round (PRs merged to `main`)

backline1212/app#109 test-suite status · #110 dashboard CSP (TDR-0188) · #111 screenshot
preview, scroll and background fixes (TDR-0189) · #112 abandoned upload grants release
quota (TDR-0190) · #113 email layout and invitation sign-in link (TDR-0191) · #114 snippet
install code, private-content masking, canvas/video capture (TDR-0192) · #115 extension
0.5.11 · #116 strict-CSP widget styling (TDR-0193) and this file.

Second batch: #117 old extension ZIPs removed · #118 one-click unsubscribe (TDR-0194;
also redeployed the API after the failed Railway deploy of `a01737a`, now green) · #119
screenshot black-outs (TDR-0195) · #120 platform install guides and share links on phones
· #121 privacy notice update · #122 keyboard access for notifications and the dock menu ·
#123 extension 0.5.12 · this update.
