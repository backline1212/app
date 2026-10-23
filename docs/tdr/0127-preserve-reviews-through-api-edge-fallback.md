# TDR-0127: Preserve review sessions through an API edge fallback

Date: 2026-10-24. Status: source implemented; rollout and browser acceptance pending.

## Problem and decision

The public API domain returned Railway's `x-railway-fallback: true` 404 while
FastAPI was unreachable. Native review previously classified any 404 during
access checks or comment polling as revoked access. It cleared the tab-bound
credential and overlay, requiring a new launch after a temporary service
outage. The guest widget likewise discarded a stored guest session on 404,
although Railway's edge had not made an authorization decision.

The native review transport, extension connection client and guest widget now
map this precise edge response to a retryable `SERVICE_UNAVAILABLE`/503 error.
The existing 401/403/404/409 cleanup remains for responses from Backline's
API. On an infrastructure fallback, the native toolbar retains the session
and reports the request failure; its access check and comment polling retry
when the API returns. The guest widget retains its stored guest session and
draft. A browser that hides the fallback response under CORS also yields a
network error, which does not trigger revocation.

This does not prolong an expired or revoked authorization. It does not
recreate the API service or guarantee a queued comment save; the existing
idempotent retry path remains the only safe replay for an uncertain save.
The extension package and portal download advance to 0.4.12. The 0.4.11
versioned asset stays available for rollback. The Chrome Web Store draft
remains 0.4.9 until it is replaced and accepted.

## Verification boundary

Widget, extension and web lint/typecheck/build passed (9/9 Turbo tasks).
The 51,774-byte source, portal-public and built-web ZIPs match at SHA-256
`437239BF7173B79132651EB128447CEACE8CF97B03F7BEB9EC59049B0F84607D`;
the archive has manifest 0.4.12, the three scripts and popup. Deployment
checks remain. When the API recovers,
accept real access revocation and transient outage/rejoin on a controlled
review, including the guest widget, native access check and comment polling.
No test suite is written or run under the Codex task instruction.
