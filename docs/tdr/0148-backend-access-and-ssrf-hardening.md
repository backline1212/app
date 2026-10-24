# TDR-0148: Backend access, SSRF and consistency hardening

Date: 2026-10-24. Source: a code review of every backend module; each item below was
verified in code before changing it.

## Decisions

- **Implementation prompt access.** `POST /comments/{id}/mcp/generate-prompt` accepts a
  ticket number as well as an id, so the route's path check could not establish the
  project. The service now loads the thread with `viewer=session` and enforces the
  project's `comment:view_team` (TDR-0056), like the MCP tools already did.
- **SSRF at connect time.** `ssrf_guard.GuardedNetworkBackend` resolves once, refuses
  any non-global address (now including CGNAT 100.64/10 and IPv4-mapped IPv6) and
  connects to the checked address; TLS keeps the hostname for SNI. Used by the review
  proxy's shared transport, custom webhooks and self-managed GitLab. Closes DNS
  rebinding between `assert_safe_to_fetch` and the connection.
- **Guest isolation.** Guests receive `guest_safe_comment` output (REST list and the
  client WebSocket channel): no assignees, waiting-on, due date, priority, member ids or
  other reviewers' device/diagnostic context. The guest board lists threads only.
  A reply reaches the client channel only while its thread is client-visible. Guests
  can't delete a thread carrying team replies, can't resolve replies or team threads,
  and can't send `mentioned_user_ids`.
- **Credentials.** "Sign out of all sessions" and password change also revoke the
  user's extension tokens. (MCP personal tokens are deliberately long-lived agent
  credentials and are unchanged; revoke them from the MCP page.)
- **Consistency.** Member role change/removal/leave are compare-and-set against the
  owner role; ownership transfer swaps both roles in one transaction. One-time
  session-sync and cloud-login tickets are redeemed with `GETDEL`.
- **Correctness/performance.** Page `comment_count` counts live threads only;
  notification `limit` must be >= 1; the clients list's lookups are workspace-scoped so
  they use the index; presigned URLs reuse one signing client.

Not changed here (recorded for follow-up): realtime per-socket authorization caching,
guest snapshots driving recovery, page-delete write skew, legacy activity pagination.

## Verification

ruff, ruff format, mypy (222 files), workspace-scoping check. Guarded backend refused
`localhost`; blocklist checked for CGNAT, mapped IPv6, link-local and scoped addresses.
Widget guest post with recording and guest PDF reply re-run in Chromium.
