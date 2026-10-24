# TDR-0136: Redact ticket card and list page paths

Date: 2026-10-24 (Asia/Calcutta). Backlog item: BUG-08.

## Decision

The ticket board and dense list render the API's `page_path` directly. This
path can include a query or hash route containing a credential even though the
other portal URL labels use `redactReviewUrl`. Feed the relative path through
the same display-only review URL formatter, using a fixed dummy origin solely
to parse it. Keep the ticket's stored URL, identity, navigation and API value
unchanged. Standalone ticket labels and page-title fallback are preserved.

The existing formatter masks common sensitive query keys and token-like path
segments; it does not detect every secret or redact user-authored page titles
and comment text. This change closes the inconsistent raw-path rendering in
these two views without claiming universal content privacy.

## Acceptance and verification

Verify board/list labels for ordinary paths, credential-bearing query and hash
routes, standalone tickets and page-title fallback in a deployed browser.
Confirm ticket opening still uses the original record. Run web lint,
typecheck, build and diff checks locally. No test suite is added under the
Codex instruction in AGENTS.md. Browser acceptance remains pending while the
API hostname is unavailable.
