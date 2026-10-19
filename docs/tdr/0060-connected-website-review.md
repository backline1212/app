# TDR-0060: Connected website review with Backline as the feedback workspace

Date: 2026-10-19
Status: Product direction accepted in conversation; implementation plan recorded;
application changes and verification outstanding.

## Context

The source audit (TDR-0059) identified proxy authentication/loading limits and
independent security and persistence defects. The user explored cloud browsers,
extensions, a broad QA lab and future AI/MCP, then accepted a website-installed
widget as the primary approach. They requested a reliable, simple portal workflow
and a saved conversation summary and implementation plan before implementation.

## Decision

For newly connected customer-controlled website projects, make the portal the
central project/ticket/evidence workspace and open live review in the website's
own top-level tab. Use one Start review / Open on site flow with an installed
widget. Existing extension feedback and widget feedback share ticket identity,
authorization, evidence and realtime. Retain extension support without making it
a prerequisite for connected-website guests.

Distinguish Backline access from website authentication, and saved evidence from
live reproduction. Never copy website credentials to reproduce a ticket. Carry a
ticket launch intent across login, then authorize review access independently.
Use a public installation identifier plus an authorized launch exchange for new
installs; do not embed a permanent share-link credential in public site source.
Guest authorization continues to use the existing share-link policy model.

The proposed contracts, rollout defaults and acceptance criteria are in the
[implementation plan](../implementation/connected-review-plan-2026-10-19.md).
The [product brief](../implementation/review-product-brief-2026-10-19.md) preserves
the user's intent and normal user journey. These records authorize documentation
work in this turn, not production changes, purchases or a platform rewrite.

## Relationship to earlier decisions

- TDR-0002's share-link guest policy remains; its installation method of embedding
  a long-lived share token is replaced for new connected installs when this plan
  ships. Existing installations remain readable and get explicit migration.
- TDR-0048's real-origin browser principle remains. The primary route becomes an
  installed widget for controlled sites, with the extension as an alternate.
- TDR-0042's cookie-export cloud-login path is not the new review architecture.
  A later browser lab would keep interaction in its own isolated browser session.
- TDR-0057's member access enforcement must be preserved; new member launches must
  not silently become guests or depend on the old iframe-only canvas session.

## Consequences

Backline cannot universally embed authenticated websites inside its dashboard.
The product will state this through predictable navigation, not unreliable silent
fallbacks. A website install cannot emulate Safari or guarantee pixel-perfect
screenshots. Exact viewport/browser/device tools remain capability-gated.

Keep React/Vite, the separate TypeScript widget, FastAPI module boundaries,
MongoDB, Redis/Arq and private S3-compatible storage. Use additive contracts and
dry-run-first migrations. No generated API declarations were edited in this turn.
