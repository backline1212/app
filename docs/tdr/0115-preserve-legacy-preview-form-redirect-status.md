# TDR-0115: Preserve form redirect semantics in the legacy review preview

Date: 2026-10-22. Backlog item: BUG-12 (login and form redirect fidelity).

## Plan and decision

The legacy `/proxy/{token}/` preview returns a website form submission's
redirect to the reviewer's browser so the address bar, cookies and subsequent
navigation follow the site. It previously replaced every 301, 302, 303, 307
and 308 with 303. A 307 or 308 is method-preserving: replacing it with 303
turns a POST into GET and drops its body. This can break a login or any form
whose destination expects the submitted method and data.

Relay the upstream redirect status while rewriting only its Location into the
legacy preview path when it stays on the project origin. Keep the existing
namespaced cookie handling. The per-link preview origin already relays status,
so this aligns the legacy path with it. The browser applies normal 301/302/303
semantics; 307/308 retain the request method and body. No stored data, API
schema, generated types or migration changes.

This does not make iframe or proxy login universal: cross-origin SSO, blocked
iframes, WebSockets and streamed responses still need native browser review.

## Acceptance and verification

Run backend Ruff, format check, mypy, workspace-scope audit and diff checks.
Codex adds no test suite under this task's AGENTS.md rule. After the backend
rollout, use an authorized test site with a form that returns 307 and 308 to
confirm the destination receives the POST body through the legacy path; also
check a 303 ends in GET and a session cookie survives. Verify native browser
fallback for an unsupported login. A source check alone cannot establish that
the previously observed example.com failure was caused by this bug.
