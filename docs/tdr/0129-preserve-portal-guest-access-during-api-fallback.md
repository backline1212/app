# TDR-0129: Preserve portal guest access during an API edge fallback

Date: 2026-10-24. Status: web deployed; browser acceptance pending.

## Problem and decision

TDR-0126 mapped Railway's `x-railway-fallback: true` 404 in the shared web API
client to service unavailability. Guest-session status and termination, the
guest board, and guest PDF/image metadata and content use direct guest-token
requests instead. Those requests still surfaced the edge response as a real
404. In particular, the review entry page interprets a 404 from its session
status request as expired guest access and removes the stored session. During a
service outage that can force a reviewer to rejoin and lose the continuity of
their open review.

All direct portal guest requests now use the same response-to-error mapping as
the shared client. The precise Railway edge fallback becomes a retryable 503
`SERVICE_UNAVAILABLE`, preserving the guest session, board state and file
review context. Application 401/403/404 decisions keep their existing access
cleanup and rejoin behavior. No guest credentials are added to member requests
or browser storage. A browser network/CORS failure still remains a network
error; it does not prove access was revoked.

## Verification boundary

Web lint, typecheck and build passed (3/3 Turbo tasks). Diff check passed.
Vercel reported success for `bd1c780`; the later public bundle also contains
the shared `SERVICE_UNAVAILABLE` mapping. No test suite was written or run
under the Codex task instruction. The public API host still returned Railway
edge fallback 404 for `/health` on this date. Browser acceptance for transient
fallback versus genuine guest revocation remains pending. The change does not
restore API routing or replay a comment whose save result is uncertain.
