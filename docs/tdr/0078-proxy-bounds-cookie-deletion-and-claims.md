# TDR-0078: Repair proxy bounds, cookie deletion and deployment/product claims

Date: 2026-10-20. Status: implemented; verification/rollout pending.

## Context

The user requested all gaps from the site audit while continuing PDF delivery.
F23 buffers an incoming form before enforcing its cap and buffers unlimited decoded
upstream responses. F19 loses expiry/deletion headers when the final cookie jar
no longer contains the deleted cookie. F17 lacks Docker extension build overrides.
F25/F35 compare working compatibility routes with paid-only or historical placeholder
claims and overstate the bounded BugHunt analysis.

## Decision

- Enforce the existing 2 MiB form cap during ASGI streaming reads. Read upstream
  responses incrementally with a 16 MiB limit on both wire and decoded bytes and
  a 30-second request deadline. Prefer identity encoding; support bounded gzip and
  zlib deflate decoding. Reject unsupported encoding, incomplete/concatenated
  compressed bodies, oversized responses and SSE with explicit native-review
  guidance. Redirect/HEAD/204/304 responses need headers, not body buffering.
  Always close streamed responses. Existing SSRF/origin/auth policies remain.
- Relay namespaced raw cookie creation/rotation/expiry/Max-Age headers from every
  legacy redirect hop as well as surviving jar cookies; raw operations come last
  so a deletion cannot be replaced by a surviving seed. Keep per-link browser paths
  and environment-appropriate Secure/SameSite/Partitioned policy. Cookie authority
  remains on the reviewed site's namespaced cookies, never Backline credentials.
- Accept PUBLIC_API_BASE_URL and PUBLIC_DASHBOARD_BASE_URL Docker build arguments
  in the extension stage and map them to the existing extension build settings.
  Defaults preserve the current production stack. Custom deployments must pass
  matching build arguments; runtime environment cannot rewrite an already-built ZIP.
- Preserve existing all-plan integration/MCP compatibility access instead of adding
  an unexpected paywall. The plan comparison now reflects that decision; project,
  member and AI limits remain separate. Cloud login remains unshipped/default-off.
- State BugHunt's actual coverage (up to 40 recent open roots, 400 characters each),
  retain real provider/credit behavior, and reconcile FD-22/23 acceptance rows with
  actual AI/payment-provider paths. F29 mutation concurrency/events, F24 storage
  quota and F26 capacity reservation remain open rather than hidden by copy changes.

No schema, migration, website credential sharing, browser isolation weakening or
public bucket is introduced. Native browser compatibility limits remain explicit.

## Verification

Run affected backend Ruff/mypy and web lint/typecheck/build. No test suite under
this Codex task's instructions. Record real gzip/deflate/identity/oversize/stream
and cookie logout/rotation acceptance separately; do not mark them verified from
source checks. Custom extension Docker-address builds also need separate acceptance.
