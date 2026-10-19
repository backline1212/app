# Final Draft implementation index

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
