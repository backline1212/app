# TDR-0201: Backend security hardening from the production audit

Date: 2026-10-27. Source: read-only backend audit; each finding was re-read in the code
before fixing.

## Decisions

- **Leaving a project can't raise your role.** Removing your own explicit entry on a
  workspace project is refused when the project's default role is higher than the role a
  manager gave you (e.g. viewer → default editor). Managers are unaffected.
- **Sign-in codes.** Code requests are limited per address (6 per 15 minutes) as well as
  per IP; verification is limited per IP (20/minute); and an address gets 15 wrong codes
  an hour across all its codes, so requesting new codes from many IPs no longer resets
  the guessing budget.
- **Removed members and room codes.** Someone an admin removed goes through join
  approval even when the workspace's code joins directly.
- **Dashboard canvas sessions** (member-backed guest sessions) end on "Sign out
  everywhere", password change and email change, like extension and MCP tokens.
- **Payload bounds.** Comment anchor/context strings are truncated (selector 4,000, page
  text 10,000, browser/OS 300, URL 4,000; at most 50 attributes, 10 viewport entries) -
  truncated rather than rejected so feedback is never lost. A request body limit
  middleware caps bodies before they are buffered: 21 MB for file uploads, 9 MB for card
  pictures, 1 MB for logos, 5 MB otherwise; snapshot, proxy and deploy-hook routes keep
  their own limits.
- **Custom domains.** An unverified claim older than 7 days is released when another
  workspace adds the host; verified domains are never touched. No index change.
- **Errors.** A non-guest JWT in `X-Guest-Session` is a 401, not a 500; webhook HMACs are
  compared as bytes, so a non-ASCII signature is rejected instead of raising.
- **Guest views.** A guest's retried comment create (same `client_request_id`) returns
  the guest-safe view, also for file comments.
- **Trackers.** Sending a comment to a project-scoped connection checks the project;
  deleted comments can't be sent.
- **"Edited".** `body_edited_at` records text edits; the thread shows "· edited" only for
  those. `edited_at` keeps meaning "any change" for sync and activity ordering.
- Guest `last_seen_at` is written at most once an hour (it extends a 180-day TTL).

## Not changed

File comments and standalone tickets still don't notify Slack/Teams/webhooks; whether
they should is a product decision, recorded in the pending list.
