# TDR-0093: Reply to website threads without leaving the reviewed page

Date: 2026-10-21. Scope: FD-08/09/21, partial L04 review-mode parity.

## Problem

Website pins displayed existing replies but provided no reply input. Reviewers had
to find the same thread in the portal. Native member status controls also appeared
for project roles whose status writes the server would reject.

## Decision

Add text replies to native website review and standalone guest widget threads,
using the existing Pydantic ReplyCreate endpoint and server authorization/events.
The native relay permits only POST replies on comment IDs already obtained in
this project session, with bounded text and request ID and an exact three-field
body. Guests can submit only client-layer replies. The server independently
revalidates current parent/project/role/link access and forces team-parent replies
to stay team-only. No additional credentials or permissions are introduced.

Native project role travels in the existing non-HTTP extension protocol: commenter
and above can reply, editor and above can change status. Missing legacy role waits
for a fresh launch rather than guessing authority. Standalone guest threads reply
as that guest. The embedded dashboard widget still uses a guest transport; do not
silently author a member's reply as that guest. Its existing signed-in portal reply
flow remains the available action. Inline edit/delete/guest-resolve, attachments
and mentions are separate remaining parity work, not implied by this slice.

Each reply has one immutable body/layer/request ID from its first save attempt.
Ambiguous errors retain that original request and read-only text for explicit retry
or copying, and never create a new request automatically. Server idempotency remains
actor/parent/body bound. Both transports bound the reply HTTP wait to 30 seconds;
an abort does not prove the server rolled back. A 20-second waiting notice explains
the pending state. Confirmed API replies update the existing thread without waiting
for polling; content refreshes never replace the draft's form or focus.

Dirty/uncertain replies block changing pins/modes and protect native unload. Outside
clicks preserve the draft. Close/clear/Escape offers explicit Keep writing/Discard;
active saves cannot be discarded. SPA registration waits until drafts finish or are
cleared, including a draft started while registration was in flight. Teardown or
revoked/deleted thread access forces cleanup of draft text/listeners. No localStorage
queue, background replay, new backend schema, database migration or new provider.

## Verification and release

Initial widget/extension lint/typecheck/build passes 6/6. Final source checks follow
the route-race and extension 0.4.7 version refinement: full frontend graph passes
12/12 lint/typecheck/build tasks. Existing web chunk advisory remains. Diff checks
pass. No test suite written/run.
Backend ReplyCreate already exists; no generated HTTP declaration edits are needed.
The extension protocol file is maintained source, distinct from generated OpenAPI.
Unrelated local store/icon preparation is preserved and excluded from this commit.

Manual acceptance remains open: member/guest replies, editor/viewer roles, team
layers, empty/10,000-character validation, polling during writing, Ctrl/Command+Enter,
slow/lost response retry with one row, access/link/parent revocation, copy fallback,
discard/unload, SPA changes and return to selected portal thread. No additional shared
feedback is submitted as part of this source slice. Installed Chrome remains 0.4.3;
the served/installed 0.4.7 release depends on Railway's temporary deployment pause.
