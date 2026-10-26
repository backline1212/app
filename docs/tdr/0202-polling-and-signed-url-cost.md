# TDR-0202: Cheaper polling reads and reusable signed URLs

Date: 2026-10-27. Source: deploy/infra/cost audit (findings 6 and 8).

## Decisions

- `GET /pages/{id}/comments/version`, polled by every open review tab, reads only the
  fields it hashes (revision, status, layer, recovery status, edited time, attachments,
  parent, created) instead of whole comments with anchors and context. The version
  string is unchanged.
- Guest `last_seen_at` is written at most once an hour (TDR-0201).
- The review page re-checks its guest session every 60 s instead of 15 s; every other
  guest request would fail on a revoked link anyway.
- Signed GET URLs (1-hour expiry) are reused for 30 minutes per object key in each API
  process, so list polls return the same URL, the browser's 5-minute cache applies and
  media keyed by URL doesn't reload. A reused URL always has 30+ minutes left. Bounded
  at 20,000 entries; a deleted object's entry is dropped.

## Not changed

- File bytes still go through `/assets/{id}/content`: pdf.js and the card thumbnail
  (canvas) need same-origin bytes, and a direct R2 fetch would depend on bucket CORS
  that can't be checked from here. The response is fetched once per view
  (`staleTime: Infinity`).
- Railway watch paths, the Playwright browsers in the image and the idle cloud-login
  service are Railway settings for the operator (see the pending list).
