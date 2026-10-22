# TDR-0118: Relay HEAD requests in website previews

Date: 2026-10-22. Backlog item: BUG-14 (preview HTTP method coverage).

## Plan and decision

The proxy service understands a bodyless HEAD request, but the legacy proxy
router and preview-origin rewrite had no HEAD route. A reviewed site's asset
probe, document viewer or fetch client could receive Backline's 405/404 even
when its GET request would work. This is a source-derived compatibility gap;
no particular production site's failure has been attributed to it.

Add HEAD on root and path proxy routes, plus the legacy unmatched-path
fallback. Keep these method routes out of the generated public API schema;
the reviewed site's own browser is the caller. Reuse link validation, tenant
and SSRF checks, rate limit, cookie rewrite and redirect rules. Never run the
HTML rewriter for a bodyless HEAD response. Omit Content-Length rather than
advertise the empty transport body as a zero-length GET representation.

No Pydantic contract, stored data or migration changes. Streams, WebSockets,
iframe-blocked login and cross-domain APIs remain native-browser cases.

## Acceptance and verification

Run backend Ruff, format check, mypy, workspace-scope and diff checks. Codex
adds no suite under this task's AGENTS.md rule. After matching backend rollout,
use an authorized test site to check HEAD on root, an asset, a redirect and a
missing path through both preview-origin and legacy link modes; compare
status/type/cache headers with GET while confirming empty body and no false
Content-Length. The observed example.com failure remains undiagnosed.
