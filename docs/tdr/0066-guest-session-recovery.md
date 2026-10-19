# TDR-0066: Validate recovered guests and end stale review UI

Date: 2026-10-19
Status: Implemented in source for CR-01/F34; final static checks passed.
Live guest/SPA/revocation acceptance remains open. Not a new launch protocol.

## Decision

Add `GET /guest-sessions/current`, authenticated only by the guest header. Reuse
the shared live actor/project guard for JWT expiry, stored guest/link identity,
revocation/expiry, project archive and member-bound policy. Return project/link IDs,
display name, member-bound flag and a trusted review-return URL; no team data,
contact records, target-site credentials or renewed bearer. Rate-limit by actor
and mark the response no-store. The public review descriptor adds its share-link
ID and review-return URL so clients can verify an exact link match on recovery.

Portal and widget storage readers validate the stored shape and tolerate unavailable
sessionStorage. Before resuming a stored/handoff guest, query its live status and
verify the link match. Invalid/expired/revoked cache entries are cleared. Network,
server and rate-limit errors do not silently erase identity or create a different
guest. Widget invalid-session recovery links back to Backline's normal join gate,
including passcode/name policy. A member-bound session is never downgraded to a
guest; its return URL opens the member portal.

The portal checks active guest sessions every 15 seconds while active and on normal
query focus/refetch. On authoritative 401/403/404 it hides protected guest views,
clears that stored identity, cancels/removes query keys carrying the old guest token,
and refreshes the public link policy before rejoin. Link navigation resets guest
state so a previous project's content cannot follow a new review URL. Image/PDF
and guest-board views share this lifecycle through ReviewEntryPage.

The installed widget stops reconnecting after an authorization-related socket close
and detects locally expired JWTs before retrying a handshake. Local decoding is
only UI expiry detection; the server verifies signatures and policy. Socket access
loss or an authenticated API 401 closes the concrete widget client, aborts its
requests, removes the guest cache, detaches main mode/click/scroll/status listeners,
stops route polling/region capture and clears displayed pins/threads/composers.
Late API results cannot refill the closed client. Show a small review-ended notice
with explicit Return to Backline and Dismiss actions; the website remains usable.
Initialization errors are also visible, not console-only failures.

Shared capture helpers keep a minimal request/upload transport interface. Concrete
client shutdown belongs to installed-widget lifetime, preserving the extension's
message-based transport. New SDK protocol types use generated type-only references.

## Limits and rollout

This does not replace the legacy URL bearer handoff (F20/CR-03), automatically renew
guest tokens or transfer authorship to a freshly joined guest. Rejoin follows the
existing share-link policy and may create a new guest identity; old comments remain
readable as allowed. Inaccessible links/projects cannot be reopened by this UI.
Browser background throttling/offline operation prevents a wall-clock guarantee
for local cleanup; the server independently withholds revoked realtime data and
rejects HTTP access. Already delivered/downloaded evidence cannot be recalled.
Previously issued direct S3 URLs/in-flight uploads expire under their existing
policy; closing the widget does not revoke them, and no new ticket can be saved
through its closed API client.

Deploy backend, rebuilt SDK and frontend together for the additive status/resolve
contracts. Existing guests remain stored and are checked rather than bulk deleted.
No data/index migration or external service purchase is required by this increment.
No automated suites per the Codex repository instruction. Manual acceptance still
needs corrupt/disabled storage, expired/revoked links, member-role loss, popup/iframe
and SPA changes, network loss without identity loss, late saves, image/PDF guests,
extension transport regression and ordinary rejoin/passcode flows.
