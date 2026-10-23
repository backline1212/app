# TDR-0132: Isolate guest file-review requests from member cookies

Date: 2026-10-24. Status: web deployed; browser acceptance pending.

## Problem and decision

The portal's guest session and board requests explicitly use
`credentials: "omit"` and `cache: "no-store"`. Guest PDF/image metadata,
comments, mutations and file-content requests used a separate direct fetch
path without those options. Browser defaults currently omit cookies for the
cross-origin production API, but a same-origin deployment or local proxy could
send a signed-in member cookie alongside the guest token. A shared HTTP cache
could also retain guest-scoped responses if server headers changed.

All direct guest asset requests now explicitly omit credentials and bypass the
browser HTTP cache. The `X-Guest-Session` header remains their sole identity;
member requests retain the existing authenticated API client. Backend guest
authorization and project scope remain the enforcement boundary. This is a
transport hardening, not evidence of a live cross-identity leak.

## Verification boundary

Web lint/typecheck/build passed (3/3 Turbo tasks), and diff check passed.
Vercel reported success for `c0e0bec`; the public main bundle contains
`credentials: "omit"` and `cache: "no-store"` alongside the guest-session
header. No test suite was written or run under the Codex task instruction.
Browser acceptance for guest/member coexistence and private file access remains
pending while the API host returns Railway edge fallback 404.
