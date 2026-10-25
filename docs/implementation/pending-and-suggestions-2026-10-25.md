# Pending work and suggestions (2026-10-25, end of round)

The short list of what is left after this round, in order of importance. Detail and history
stay in [pending-backlog-2026-10-24.md](pending-backlog-2026-10-24.md); deployment steps
are in [go-live-checklist-2026-10-25.md](go-live-checklist-2026-10-25.md).

## 1. Owner / operator actions (needed for launch)

| # | Action | Notes |
|---|---|---|
| 1 | Deploy API **and** worker from the same `main` commit, then the web app | Worker uses Docker build target `worker`; without it no email leaves the outbox. Check with `scripts/smoke_test.py`. |
| 2 | Configure an email provider | `RESEND_API_KEY` + `RESEND_FROM_ADDRESS` (or Apps Script). Sign-in codes, invitations, client and digest emails depend on it. |
| 3 | Submit extension **0.5.12** to the Chrome Web Store | `apps/web/public/backline-extension-0.5.12.zip`, SHA-256 `5108563d…d15a`; supersedes every earlier package. Then set `VITE_EXTENSION_STORE_URL`. |
| 4 | Run the data migrations, dry-run first | `python -m scripts.migrate_ticket_numbers`, `python -m scripts.migrate_event_projects`, then each with `--apply`. Optional: `scripts.gc_unreferenced_uploads`. |
| 5 | Decide on **Terms of Service** and a **refund/cancellation policy** | There is a privacy notice and support page but no Terms route. Payment providers (Razorpay in particular) expect Terms, refund and contact pages before live payments. Legal text needs the owner's approval, so it was not drafted. |
| 6 | Review the privacy notice | Mention that sites can mark content `data-backline-private` (now masked in screenshots) and that reviewers can preview or skip screenshots. |
| 7 | Set `SENTRY_DSN` / `VITE_SENTRY_DSN` | Optional but recommended before a wider pilot. |
| 8 | Allow production hosts in this environment's network settings | Only needed if live production checks should be run from here (production hosts are blocked now). |

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
- Manual accessibility pass (keyboard-only and screen reader) on the main flows;
  automated axe checks are clean.
- OPT-05: a supported site/browser matrix with real success rates.

## 3. Engineering backlog (open)

| Item | What remains |
|---|---|
| Extension next package | TDR-0193 (styled widget under strict site CSP) is not in 0.5.11. Package it with the next extension change. |
| Backend test suite | 33 tests fail identically before and after this round (stale against later designs: digests, upload keys, snapshot hashes, realtime access check, OTP wording, proxy streaming, provider fixtures). They should be updated by a workflow that allows writing tests. |
| OPT-01 pagination | Project, page and project-comment reads still load full lists; add cursor pagination with "Load more". |
| OPT-02 extension sync | Fingerprint polling works; deltas or push with deletion/revocation tombstones would cut traffic. |
| OPT-03/04 performance | Measure large projects (p50/p95, payloads, queue age) and real route bundle loading before more optimization. |
| FLOW-05 | Moving a comment to a different page; preview/verification history. |
| FEAT-08 | Durable undo history (only ticket close and bulk changes have Undo). |
| FEAT-12 | Automated verification run for the MCP fix-and-verify loop. |
| BUG-08 (rest) | Initial browser/Backline URLs, historical snapshots, arbitrary visible text, logs and exports. |
| BUG-10 | Reviewed reassignment workflow for old merged hash-route feedback. |

## 4. Suggestions

- **CSP reporting:** add a `report-to` endpoint for the dashboard policy so production
  violations are seen, not guessed.
- **Email deliverability:** add `List-Unsubscribe` / one-click unsubscribe headers to
  digest and notification emails (Gmail/Yahoo bulk-sender rules), and SPF/DKIM/DMARC for
  the sending domain.
- **Client emails:** show the workspace logo when branding is set; today the header is
  the brand name.
- **Snippet install:** short guides for common platforms (WordPress, Webflow, Next.js,
  Shopify) linked from the Install code dialog.
- **Screenshots:** an optional full-page capture, and a "mark private" picker so a
  reviewer can blur an area before posting.
- **Security:** two-factor sign-in for workspace owners; later SSO/SAML for agencies.
- **Operations:** uptime monitoring and a status page; confirm MongoDB backups and an R2
  lifecycle rule; a load test before a wider launch.
- **Housekeeping:** prune old extension ZIPs from `apps/web/public` (only the current one
  is linked) once the store listing is live.

## Shipped this round (PRs merged to `main`)

backline1212/app#109 test-suite status · #110 dashboard CSP (TDR-0188) · #111 screenshot
preview, scroll and background fixes (TDR-0189) · #112 abandoned upload grants release
quota (TDR-0190) · #113 email layout and invitation sign-in link (TDR-0191) · #114 snippet
install code, private-content masking, canvas/video capture (TDR-0192) · #115 extension
0.5.11 · final PR: strict-CSP widget styling (TDR-0193) and this file.
