# TDR-0061: Connected review access and retry foundation

Date: 2026-10-19
Status: Implementation started under the user's subsequent authorization;
CR-01 remains incomplete. Live acceptance is outstanding.

## Context

TDR-0060 records the accepted installed-widget direction and the original planning
turn. The user subsequently asked to start implementing it. Before introducing a
new launch exchange, the existing widget, extension and portal must share reliable
authorization and ticket persistence boundaries.

## Decision

Deliver the first subset of CR-01 in the existing architecture. This change does
not switch project launch modes, replace the proxy, or introduce a cloud browser.

- Comment/reply creation validates upload keys against the authorized project's
  `uploads/{workspace}/{project}/` namespace; legacy `screenshots/` keys remain
  readable in that same scope. Serialization withholds out-of-scope signed URLs,
  including on old records. This is namespace isolation, not a completed upload
  registry: verified upload ownership, content type and existence remain F03 work.
- Comment idempotency binds the existing workspace-wide request ID to author,
  page, parent, layer and a canonical request fingerprint. Both early lookup and
  duplicate-key recovery use the same check. Conflicting requests return 409
  without the stored content. Legacy rows without fingerprints remain readable,
  but their request IDs cannot be safely replayed and return 409. No destructive
  backfill or unique-index replacement is needed. Confirm whether a prior submit
  succeeded before sending a new ID after a conflict.
- Duplicate insert races return the authorized stored comment without repeating
  create events/notifications. This is not a durable event outbox: a crash between
  the first insert and event delivery can still lose that event, and remains open.
- Guest own-comment edits/deletes use live link, project and stored-session checks,
  including expiry, archive and member binding. Guest replies cannot reach a hidden
  or deleted parent; new nested replies are rejected because threads have one level.
  Existing whole-thread deletion semantics are unchanged and need a separate decision.
- WebSockets preserve the member session family, authorize before joining, validate
  before each outgoing event, and recheck idle sockets every 15 seconds. Guest link,
  stored session, project/archive and member binding follow the shared guard.
  Member page presence requires project access. No cached ACL authorizes delivery.
- Workspace events remain internal Redis fan-out. Notification socket delivery is
  restricted to its recipient and current project access, including the legacy
  nested project field. REST notification pages and unread counts filter by current
  visible projects before pagination/counting. Missing projects are excluded.
- Member refresh restores the active workspace before releasing queued requests;
  a changed local token revision prevents a late refresh overwriting a newer session.
  Network/server refresh failures do not themselves clear identity. Workspace
  switching can recover after context is lost. Token identity/role/workspace changes
  discard cached queries; access-change events reset queries before refetching.
  Member socket reconnect refreshes expired credentials and ignores obsolete sockets.

No external API schema, generated declaration, dependency or data migration is
required by this slice. Public Pydantic contracts remain unchanged.

## Costs and remaining work

Live authorization adds database reads per socket delivery and idle connection;
notification reads enumerate project access. Measure latency and fan-out at pilot
scale before optimizing, preserving revocation semantics. Previously issued signed
object URLs remain valid until their normal expiry. Already delivered evidence
cannot be recalled from a user's device.

CR-01 still includes verified-email/signup and OAuth state (F01/F02), upload registry
checks (F03), browser-fetch network isolation (F09), cross-tab refresh rotation
(F12), OTP atomicity (F13), extension credential lifecycle (F14), installation origin
ownership (F15), snapshot durability (F22), and guest rejoin/cache teardown (F34).
Cache behavior and auth changes need live acceptance; F33 is not closed by static
checks alone. CR-02..06 and the nine release acceptance groups remain outstanding.

Verification commands and actual results belong to
[the delivery ledger](../implementation/06-delivery.md). Per AGENTS.md's Codex
instruction, no test suites are written or run. Static checks do not establish
website login compatibility or a passed browser/database integration journey.
