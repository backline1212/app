# 19 - Testing & CI/CD

## 19.1 Test Pyramid

| Layer | Tool | Scope |
|---|---|---|
| Unit - backend | pytest | Service-layer logic, permission matrix, anchor confidence scoring, diff engine |
| Unit - frontend | Vitest + React Testing Library | Components (tier 1 `packages/ui` especially - these are shared, bugs here propagate everywhere), hooks |
| Integration - backend | pytest + ephemeral Mongo instance | Repository layer against a real Mongo instance (not mocked - workspace-scoping bugs are exactly the kind that mocks hide) |
| Integration - full stack | Playwright | Critical user journeys end to end against a running backend + frontend |
| Golden dataset - Anchor/Recovery Engine | pytest, fixture-based | See §19.2 |
| Performance | Playwright + Lighthouse CI | SDK bundle size budget, time-to-interactive, dashboard load time |

## 19.2 Golden Dataset Tests for the Recovery Engine

Because "does recovery still work" isn't a normal assertion - it's a statistical claim (`08-Anchor-Engine.md`'s confidence thresholds) - maintain a fixture set of paired snapshots representing known transformation types:
- Identical page (sanity: everything should be `ok`, confidence `1.0`).
- Element moved (reordered sibling) - expect stable-attribute or DOM-path match.
- Element text edited - expect text-fingerprint match, not exact.
- Element removed entirely - expect `orphaned` after full traversal.
- Ambiguous duplicate elements (e.g., two "Learn more" buttons) - expect `low_confidence`, not a silent wrong match.

Each fixture pair has an expected `recovery_status` + confidence range; the verification suite fails if a change to the diff/anchor logic regresses any fixture's expected outcome. This is the automated version of Rule 4 (Deterministic Before Intelligent) - deterministic behavior should be exactly reproducible in tests, not "usually works."

## 19.3 Critical Playwright Journeys

1. Agency signs up (Google OAuth) -> creates workspace -> creates project -> generates share link.
2. Guest opens share link on a mobile viewport -> posts a comment in under the SDK's performance budget -> agency dashboard receives it via WebSocket without a manual refresh.
3. Team member posts a team-only reply -> guest re-opens the same thread -> team-only reply is absent from the guest's view (this is the test that actually proves F3's security requirement, not just a UI check - assert against the raw API response the guest session receives, not just what's rendered).
4. Comment's page is redeployed with a structural change -> recovery pipeline runs -> comment's `recovery_status` updates and is reflected in the dashboard.
5. Comment -> ClickUp task creation round-trip preserves screenshot/metadata/backlink.

## 19.4 Local Verification and Direct Deployment

GitHub Actions is intentionally disabled (TDR-0027). Before merging or pushing to
`main`, contributors run the affected local checks: Ruff formatting/lint, strict mypy,
workspace-scoping lint, generated-contract drift, frontend lint/typecheck/build, and
the relevant isolated test suites when the task permits them. Vercel and Railway deploy
from their direct GitHub integrations; Railway watch paths may legitimately skip a
service when its source was not changed.

Branch protection on `main` should require a pull request and approving review. There
are no hosted status checks to require, so the reviewer is responsible for confirming
that verification evidence is recorded in `docs/implementation/06-delivery.md`.

## 19.5 Performance Test Gates

- SDK bundle size must remain below 40KB gzipped (`07-Review-SDK.md` §7.7); check it during local release verification.
- Lighthouse CI on the dashboard's board view, budget: Time to Interactive < 2.5s on a throttled connection profile.

## 19.6 Test Data Hygiene

Integration/E2E tests run against ephemeral, seeded databases per run (service containers or native binaries locally, or a fresh Atlas preview namespace) - never against staging or production data. Seed fixtures live in `backend/tests/fixtures/` and mirror realistic shapes (using the schemas in `11-Database.md`), not minimal/degenerate stand-ins, since anchor/recovery correctness depends on realistic DOM shapes.
