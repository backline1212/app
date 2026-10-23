# TDR-0131: Keep loaded file review visible through refresh errors

Date: 2026-10-24. Status: source verified; web rollout and browser acceptance pending.

## Problem and decision

PDF/image review polls file metadata and comments. After a successful load, a
temporary failed refresh left React Query's cached data available, but the
screen disabled annotation whenever the file-list query had an error and
replaced the comment list with a generic error panel. Reviewers could lose
visible pins and the selected conversation during a short API outage even
though their file and comments were already loaded.

The review now continues to show previously loaded files, comments and replies
through a temporary refresh error, with clear stale-data guidance and retry
controls. It does not pretend that a new save succeeded: existing idempotent
retry and unconfirmed-save handling remain. An authoritative API 401, 403,
404 or 409 still hides cached file/comment content and disables annotation;
the backend independently authorizes all reads and writes. Auth context
changes also clear protected React Query caches through AuthProvider.

## Verification boundary

Web lint/typecheck/build passed (3/3 Turbo tasks); diff check passed. No test
suite was written or run under the Codex task instruction. Browser acceptance
with a loaded PDF/image, temporary outage/recovery and genuine revocation
remains pending while the API host returns Railway edge fallback 404.
