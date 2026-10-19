# TDR-0062: Bind Google sign-in to its initiating browser

Date: 2026-10-19
Status: Implemented as part of CR-01; generated contracts and static checks passed; provider
acceptance outstanding. Addresses the code path identified by audit F02.

## Decision

The sign-in and signup buttons call `POST /auth/google/start`. The backend builds
the Google authorization URL from its configured client and exact redirect URI,
creates a random 256-bit state, sets an HttpOnly browser-binding cookie and stores
only a hash-keyed, ten-minute pending attempt in Redis. No Google client secret
is returned to the browser. Missing configuration gives an actionable email-login
alternative; starting attempts uses the existing per-IP login rate limit.

`POST /auth/google/callback` now requires both `code` and `state` in its Pydantic
contract. Before provider exchange, compare state with the browser cookie, then
atomically GETDEL the Redis attempt. A wrong browser cannot consume an attempt by
knowing the public state; concurrent valid callbacks cannot both exchange. Unknown,
expired and replayed attempts fail without issuing credentials. Attempts fail closed
if Redis is unavailable. State cookies use the same environment-specific Secure and
SameSite settings as the existing refresh cookie, narrowed to the Google API path.
Authentication cookies still require deployment/browser cookie-policy acceptance.

The callback page removes provider code/state from the visible address/history,
handles provider denial, and sends state with the code. The frontend no longer
constructs OAuth URLs from an independent Vite client ID. Authorization responses
use `Cache-Control: no-store`. Successful exchange deletes the state cookie; Redis
consumption protects retries even if an error response prevents cookie deletion.

## Recovery and compatibility

One browser cookie supports one active attempt; starting again in another tab
supersedes the earlier browser binding. Show a restart message rather than accepting
an unmatched callback. A provider exchange failure after consumption also requires
starting again. Existing in-flight callbacks without state must restart once after
rollout. Existing signed-in sessions are unaffected by the new callback requirement.

This change protects Backline account login. It does not make a target site's
identity-provider page embeddable, verify old email identities (F01), add a connected
widget launch exchange, or prove SSO compatibility. Those remain separate CR-01/03
requirements. No account migration or paid provider is introduced.

Regenerate `packages/types/openapi.json` with the backend exporter, then
`packages/types/src/openapi.ts` with `generate:local`; never edit generated
declarations manually. Record final checks in the delivery ledger. Live manual
acceptance must cover Google success/denial, wrong-browser state, expiry, replay,
parallel attempts and configured cookie/redirect behavior. No test suite is written
or run under this task's Codex instructions.
