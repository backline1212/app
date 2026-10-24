# TDR-0156: MCP token expiry, sign-in session fix, page-delete race, activity backfill

Date: 2026-10-24.

## Decisions

- **Sign-in could revoke itself (fix to TDR-0151).** `revoke_families_beyond` sorted
  refresh tokens by `created_at`, a field they don't have (`issued_at` is stored), so
  "the five most recent sign-ins" was an arbitrary five and the sign-in just created
  could be revoked: the first request after login returned 401. It now sorts by
  `issued_at` (then `_id`).
- **MCP tokens expire.** `McpTokenCreate.expires_in_days` is 30, 90 (default), 365 or
  null (never); `expires_at` is stored, returned and enforced in `verify_bearer_token`.
  Tokens issued before this have no expiry and keep working. The MCP page offers the
  choice; MCP and API key rows show "expires …"/"expired".
- **Page delete vs. new comment.** Comment creation now writes the page document
  (`last_referenced_at`) inside its transaction, so it write-conflicts with
  `delete_page`'s transaction and one of them retries: a comment can no longer be saved
  onto a page deleted as "empty" at the same moment (Mongo snapshot isolation allowed
  that write skew). A comment on a page that is already gone gets a 404.
- **Activity pagination for older events.** `scripts/migrate_event_projects.py`
  (dry-run by default, `--apply` to write; adds `payload_json.project_id` only) backfills
  the project on events that named only a comment, page or share link, so the
  per-reader project filter runs in the query and pages/totals are exact.

## Verification

Workspace lint/typecheck/build, backend ruff/format/mypy/scoping. Local: migration
dry-run found 10 events, apply resolved 10, re-run found 0; repeated sign-ins stay
signed in with 5 active sessions; a 30-day MCP token lists "expires Nov 23, 2026".
