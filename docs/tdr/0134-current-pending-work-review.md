# TDR-0134: Reconcile pending work against current source and delivery evidence

Date: 2026-10-24 (Asia/Calcutta).
Status: Documentation review complete; application backlog remains open.

## Decision

The user's request is a comprehensive pending-work list with implementation and
optimization suggestions. Publish a current categorized inventory, preserving
existing IDs and separating source implementation, rollout, live acceptance,
roadmap capabilities and optional improvements. Do not implement unrelated product
features or mark acceptance complete during a documentation audit.

Use later TDRs/source/delivery evidence to qualify older unchecked audit rows.
Specifically, privacy/support routes now exist, file/PDF code is already lazy-loaded,
and Jira/Asana, billing, AI credits, custom outbound webhooks and MCP must not be
reported as wholly absent because an older plan says so. Separate Terms, service-wide
policy certification and live behavior remain decisions/acceptance where applicable.

Read-only public probes confirm the API hostname still returns Railway's
`Application not found` response; do not infer its cause or a successful newer
API/worker rollout. Public SPA HTML success is separate from functional acceptance.

## Consequences and verification

[The 2026-10-24 inventory](../implementation/pending-backlog-2026-10-24.md) carries
all 53 previous tracked items and 15 explicitly labeled recommendations, including
overlaps and implementation boundaries. The previous snapshot remains historical.
The index and delivery ledger point to the current review.

No application behavior, API schema, generated types, deployment, shared data or
provider configuration changes. Workspace lint/typecheck/build (12 tasks, 5 cached),
backend Ruff/mypy (217 files), workspace scoping (25 repositories), and comparison
of current vs saved OpenAPI JSON (132 path entries) passed. No test suite was added
or run under AGENTS.md. Final diff/link verification is recorded in the ledger.
