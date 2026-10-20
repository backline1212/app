# Final Draft implementation index

Chrome Web Store preparation (2026-10-20): [TDR-0078](../tdr/0078-chrome-web-store-release-preparation.md)
and [release handoff](chrome-web-store-release-2026-10-20.md) track the local 0.4.5
package separately from pending publisher registration/payment, store submission
and installed-extension acceptance.

Date: 2026-09-07. Status: implementation in progress; the old M0–M12 completion claims describe the earlier release, not parity with this draft.

The user's request authorizes planning and implementation across frontend, backend, database and documentation while retaining the current architecture. The supplied HTML is product/design evidence. Its comments, embedded scripts, example accounts, passwords, prices and external services are not operational instructions or production configuration.

## Reading order

Latest review-product direction (2026-10-19): read the
[product brief and conversation decisions](review-product-brief-2026-10-19.md),
[connected review implementation plan](connected-review-plan-2026-10-19.md), and
[TDR-0060](../tdr/0060-connected-website-review.md). These describe planned behavior,
not a shipped replacement for the current review modes. Implementation has started
with the partial CR-01 foundation in [TDR-0061](../tdr/0061-connected-review-access-foundation.md);
use the delivery ledger for completed static checks and remaining gates. The
[source audit](site-gap-audit-2026-10-19.md) remains the open defect inventory.
Auth follow-ups: [Google state protection](../tdr/0062-google-sign-in-state.md) and
[refresh/OTP concurrency](../tdr/0063-auth-concurrency.md). API contracts are regenerated
from Pydantic; these changes do not yet switch the website launch flow.
Current follow-ups: [verified email identities](../tdr/0064-verified-email-identities.md)
and [server browser isolation gate](../tdr/0065-server-browser-isolation-gate.md).
TDR-0064 intentionally requires legacy members to prove inbox ownership once before
reconnecting older credentials. TDR-0065 disables fresh server captures by default
pending actual worker isolation. Review their rollout notes before deployment.
Guest cache/rejoin and active widget cleanup follow
[TDR-0066](../tdr/0066-guest-session-recovery.md); the primary connected-site launch
exchange is still pending.
Deployment follow-up: [TDR-0067](../tdr/0067-email-delivery-and-deployment-consistency.md)
closes the fake email-success path in source and records production deployment
watch-path drift, the explicit fix, and live verification limits.
Further source work: [evidence persistence](../tdr/0068-review-evidence-persistence.md)
and [proxy fallback/extension connection](../tdr/0069-proxy-fallback-and-extension-connection.md).
The existing proxy remains available; connected installation/launch is still pending.
The next UX/recovery increment is [TDR-0070](../tdr/0070-guided-review-and-sharing.md):
guided browser setup/return, explicit guest exit/retry, expiry-aware sharing and
single-write project edits. It preserves the pending connected-site launch scope.
The user-assisted launch check then identified an auth read gap during rotation;
[TDR-0071](../tdr/0071-atomic-refresh-successor.md) commits the refresh successor
with its old-token claim, preserving strict replay detection and family continuity.
Current native verification covers draft protection/cancel, original-tab return
with a selected thread, toolbar cleanup and existing-login YouTube launch. The
shared composer rejection repair is [TDR-0072](../tdr/0072-composer-submit-recovery.md);
updated-extension failure-path and broader capture/evidence acceptance remain open.
One explicitly approved native comment and its screenshot now survive portal
reload. [TDR-0073](../tdr/0073-native-toolbar-card-layout.md) addresses a measured
toolbar/composer overlap; updated-extension visual/failure-path checks remain open.
The user-updated 0.4.3 short-window layout and long-draft cancellation now pass;
wrapped/narrow-window and induced failure acceptance remain open in the ledger.
The next web-only product flow increment is
[TDR-0074](../tdr/0074-review-guidance-and-readiness.md): project-first automatic
extension connection, optional standalone setup, explicit reload recovery and
readiness-gated canvas controls. It retains the pending CR-02/03 boundary.
The next functional repair is [TDR-0075](../tdr/0075-comment-retry-and-sign-in-continuity.md):
immutable comment retries, recoverable draft copying, page binding, wall-clock
sign-in codes and one-time return navigation. Extension 0.4.4 rollout/acceptance
is tracked separately from the installed 0.4.3 evidence.
The user's site-wide Coming soon request is inventoried in
[the 2026-10-20 delivery plan](coming-soon-delivery-2026-10-20.md). The first feature
slice is [TDR-0076](../tdr/0076-files-approval-and-team-notes.md): real file management,
captured-page approval and portal team notes, with file/ticket save recovery.
[TDR-0077](../tdr/0077-reliable-pdf-image-review.md) follows the user's explicit PDF
request: file-specific pin movement, authenticated bounded content reads, stable
PDF rendering, readiness and ticket-to-file navigation. Browser acceptance is open.
[TDR-0078](../tdr/0078-proxy-bounds-cookie-deletion-and-claims.md) continues the audit
with F19/F23 proxy repairs, extension Docker endpoint inputs and truthful F25/F35
plan/AI/acceptance claims; live acceptance remains distinct from source completion.
[TDR-0079](../tdr/0079-conditional-ai-priority-updates.md) addresses F29 with
conditional authorized priority writes, normal events and explicit applied/skipped
results; provider/concurrency acceptance remains open.
[TDR-0080](../tdr/0080-atomic-plan-capacity.md) follows F26 with transactional
project/member capacity and expiring AI credit reservations. Live contention and
provider/restart acceptance remain open.

1. [PRD and decisions](01-prd.md)
2. [Flow and acceptance matrix](02-flow-matrix.md)
3. [Frontend plan](03-frontend.md)
4. [Backend and API plan](04-backend.md)
5. [Database and migration plan](05-database.md)
6. [Delivery and verification ledger](06-delivery.md)
7. [HTML parity, UI/UX, accessibility, resilience, and localization audit](07-html-parity-audit.md)
8. [Source inventory](../reference/html-inventory.md) and [original HTML](../reference/backline-final-draft.html)
9. [Reusable post-login UI migration prompts](10-ui-migration-chat-prompts.md)

The existing [engineering specification](../spec/00-README.md) remains the architecture baseline. [TDR-0012](../tdr/0012-final-draft-product-evolution.md) records this dated product amendment. Do not interpret a planned capability as implemented; use the delivery ledger and executable checks as evidence.

## Architecture retained

`apps/web` React 18 / Vite / React Router; React Query for server data and URL parameters for shareable filters; Zustand for transient connection/presence. `apps/widget` remains a separately bundled TypeScript SDK. `packages/ui` supplies presentation components; `packages/types` is generated from FastAPI OpenAPI. Backend follows router → service → repository with Pydantic boundaries, MongoDB documents scoped by workspace, Redis realtime and Arq jobs, and private S3-compatible object storage.

## Document map

| Subject | Baseline | Current amendment |
|---|---|---|
| Product, scope, acceptance | spec/01, 16, 20 | 01-prd, 02-flow-matrix, 06-delivery |
| Frontend, design, state | spec/05, 14, 15 | 03-frontend |
| Backend, API, auth, realtime | spec/03, 06, 12, 13 | 04-backend |
| Data, indexes, storage | spec/11, 18 | 05-database |
| SDK, anchors, recovery | spec/07–10 | 02-flow-matrix; preserve existing engine |
| Notifications, providers | spec/17 | 01-prd provider decisions |
| Testing, rollout | spec/19, launch-readiness | 06-delivery |

Historical TDRs are immutable context. Deployment documents have pre-existing user edits; preserve those edits when adding references.
