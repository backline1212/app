# TDR-0145: Check the web alias in the component smoke command

Date: 2026-10-24 (Asia/Calcutta). Backlog item: SUG-01 / DEP-01.

## Decision

The existing post-deploy command now checks the API and can require a recent
worker SHA, while web release verification still requires a separate manual
request. Add optional `--web-base-url` and `--expected-web-sha` arguments to
the same read-only command. Fetch `/release.json` from the supplied alias with
redirects disabled and a no-cache request. Require HTTP 200, a JSON object
with a full validated SHA, and `Cache-Control: no-store`; when an expected web
SHA is supplied, require exact equality. A web SHA cannot be supplied without
a web URL. This catches the SPA fallback HTML response as well as a stale or
misrouted web build.

The API and worker expected SHAs remain independent because component releases
can run at different Git revisions. The original API-only positional URL and
environment-variable behavior remain usable. This is an operator gate, not
evidence of sign-in, review flow or queue/provider success.

## Acceptance and verification

Run Ruff and the local lint/typecheck/build gate. Run the extended read-only
smoke command against the public API and QA web alias with their observed full
component SHAs and saved OpenAPI contract. Record the exact result in the
delivery ledger. No test suite is added or run under AGENTS.md.
