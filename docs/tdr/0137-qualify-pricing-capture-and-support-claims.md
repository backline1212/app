# TDR-0137: Qualify capture and support claims in plan descriptions

Date: 2026-10-24 (Asia/Calcutta). Backlog item: SUG-13.

## Decision

The pricing comparison says a screenshot is present on every comment and
browser/device details are always included. Current capture flows explicitly
allow failed or omitted screenshots, and a project can disable optional
browser/device metadata. Describe screenshot capture as available when it
succeeds and metadata as optional. Rename the comparison group to include
review context rather than implying all rows are video/replay features.

The enterprise card and comparison also promise a dedicated four-hour support
SLA. The current project record has no verified support contract, staffed
schedule or response-time measurement. Replace the time promise with support
arrangements by agreement pending owner certification. This changes public
copy only; prices, limits, entitlements and existing customer agreements are
unchanged. Team priority-email and other support wording still require an
operational review before certification. Invoice, tax, receipt and plan-change
policy decisions remain open under SUG-13.

## Acceptance and verification

Verify the pricing API and page show qualified rows and enterprise support
copy after the matching API rollout. Confirm failed screenshot feedback and
metadata-off projects are not contradicted. Run backend Ruff, mypy, workspace-
scope and diff checks locally. No new test suite under AGENTS.md. Do not claim
live pricing acceptance from source checks while the API host is unavailable.
