# TDR-0086: Show Google sign-in readiness before redirect

Date: 2026-10-20. Scope: source audit F18 and FD-25 login/signup continuity.

## Decision

Expose a public, no-store authentication capability response containing only a
Google availability boolean. Both credentials must be nonempty and the server's
single callback must be an allowed dashboard origin with `/auth/callback`, HTTPS
outside local development, and no embedded credentials, query or fragment. The
start endpoint uses the same readiness check. It keeps browser-bound, expiring,
single-use OAuth state; no client-supplied callback or credentials are exposed.

Login and signup query this contract with React Query. Google stays disabled during
checking, missing configuration or a failed capability read. Explain the current
state, allow an explicit retry and keep email forms available. The server still
validates readiness on each start, so a cached availability value cannot bypass a
configuration change. Configuration readiness does not prove Google Console setup,
provider uptime, browser cookie support or a completed Google sign-in.

## Verification

Contracts regenerated from Pydantic. Backend auth Ruff/mypy (7 files) and affected
web lint/typecheck/build (3/3) pass. No test suite written/run per this task's Codex
instructions. Existing large-chunk advisory remains. Deployment/public contract
verification is pending. Browser use is unavailable; configured/unconfigured,
failed capability retry, actual provider redirect/callback and email fallback
acceptance remain open. No account, OTP, provider request or shared feedback was
created for this slice.
