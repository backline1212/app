# TDR-0242: Waiting on you, project filters, pasted screenshots, sign out per device

Date: 2026-11-28

## Context

Design review of the Projects page, the new-ticket form and Account security.

## Decision

- "Waiting on you" shows three threads, owed replies and unclaimed client feedback
  together, highest priority first and newest first within a priority. The ticket API
  gains `sort=urgent` for this. Each thread links its project, its page and its ticket
  number. The header counts what is waiting and links to all open threads. The
  "New from client" badge is gone.
- The projects toolbar is status filters (All, Active, In review, Blocked, Resolved) with
  the sort and layout buttons. The project count, name filter and client dropdown are
  removed. A client or search filter from a link still applies and shows as a chip.
  A project with no comments is not counted as Resolved.
- The new-ticket form accepts pasted images. In a text box, clipboard text takes
  precedence over a picture of it.
- Account, Security signs out one device or every other device, using the existing
  per-session endpoint. Rows show last activity; IP and sign-in date moved to a tooltip.

## Consequences

- Adds one `sort` value to the ticket API. No data change.
- "Sign out every other device" ends listed sessions only. It does not revoke extension
  or MCP tokens (the API's `sessions/all` does, but it also ends this device).
