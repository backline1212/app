# TDR-0181: Clients get updates per event, not a digest (FEAT-09 decision)

Date: 2026-10-25. Source: FEAT-09 (pending backlog 2026-10-24, "Decide inert
`client_digest_enabled` semantics before enabling it").

## Decision

- Clients are told about their own feedback when something happens to it: a team reply
  to their thread (throttled to one email per thread per 15 minutes) and a thread being
  resolved (TDR-0164). Both go only to the verified address the reviewer gave, contain
  only client-visible content and link back to the review.
- No separate client digest for now. A digest would repeat those emails, and a
  schedule needs per-client preferences and unsubscribe handling first. The member
  digest is unchanged and never includes clients.
- `client_digest_enabled` stays an inert, unexposed project setting so existing records
  stay readable; it must not be shown in the UI until a digest exists.

## Also in this change

- The comment composer hides the "Ctrl ↵ to post" hint on touch screens (it keeps its
  space so the buttons stay right-aligned), in the widget and the dashboard.
