# TDR-0142: Expose a non-secret web build revision

Date: 2026-10-24 (Asia/Calcutta). Backlog item: SUG-01 / DEP-01.

## Decision

The API now identifies its source revision, but a different public web bundle
hash from the local build cannot establish which deployment the alias serves.
Emit a small `release.json` asset from the Vite build with a validated,
lowercase 40-character `VERCEL_GIT_COMMIT_SHA` or `null` when unavailable.
Vercel documents that this variable is available at build time when automatic
system environment variables are exposed: [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).
Set `Cache-Control: no-store` for this one path in `vercel.json` so operators
can compare the alias directly with the intended commit. Do not expose build
environment variables, repository owner, branch, or other configuration.
Declare the marker SHA and existing public web/extension build-time URLs/DSN
as Turbo build environment inputs, so strict environment filtering and cached
builds cannot silently replace the intended configured output with defaults.

The marker is a static build artifact and does not alter the React app, auth,
API contract or review widget. A missing/HTML response means the alias may
point to an older deployment; a `null` SHA means the build did not receive the
Vercel system variable. Neither case proves a specific release. The API,
worker, extension and browser behavior still require separate acceptance.

## Acceptance and verification

Check web lint/typecheck/build and the full Turbo gate, inspect the generated
JSON shape, and after a
matching Vercel release fetch `/release.json` from each intended public alias
with no cache. Compare its full SHA with the GitHub deployment revision and
verify the cache header. Record the outcome in the delivery ledger. No test
suite is written or run under AGENTS.md.

Post-release observation on 2026-10-24: `backline-qa.vercel.app/release.json`
returned HTTP 200 JSON with full SHA
`1aeef63a037a57b3466507b84bf239b43d8de5f8` and `Cache-Control: no-store`,
matching the Vercel deployment commit. The API health SHA remained
`2730fcf351996caef5f1bbbaa86e69794d743557` because this release changed
web source only. The exact-SHA API smoke gate passed for that API SHA, and
worker/browser compatibility remains unverified.
