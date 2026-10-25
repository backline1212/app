# TDR-0167: API response compression; fingerprint polling in file review

Date: 2026-10-25. Source: performance measurement (backlog OPT-03) with a locally seeded
2,000-comment page.

## Findings

| Endpoint (2,000 comments) | Time | Body before | Body after |
|---|---|---|---|
| `GET /projects/{id}/comments` | ~0.2 s | 5.4 MB | 53 KB gzip |
| `GET /pages/{id}/comments` | ~0.28 s | 5.4 MB | gzip |
| tickets (50), dashboard, search | 0.12-0.16 s | small | - |

The API sent no compressed responses at all, and file review re-downloaded the whole
comment list every 10 seconds per viewer.

## Decisions

- `SelectiveGZipMiddleware` (outermost) gzips `/api/*` JSON and `/widget/*` (the SDK
  script) above 1 KB, level 6. It skips file/screenshot/download bodies and ZIPs
  (already compressed), any request accepting `text/event-stream`, the MCP server
  (`/mcp`), proxied/preview website responses and websockets.
- File review polls `GET /pages/{page_id}/comments/version` (TDR-0152) every 10 s and
  refetches the list only when the fingerprint changes; guests (no realtime socket)
  benefit most.
- Pagination of project comment lists (OPT-01) stays open: at 2,000 comments the
  response is fast enough once compressed; revisit with real usage data.

## Verification

Backend ruff/format/mypy; workspace lint/typecheck/build. curl: 5,419,518 B → 53,480 B
with `Accept-Encoding: gzip`; PNG content and health unaffected. Chromium: a comment
pinned in a second browser appeared in the first within 12 s with one list download.
