# TDR-0097: Protect portal replies and retry the original save

Date: 2026-10-21. Scope: FD-09/10/11/18/21, portal reply UX and persistence.

## Problem

Project comments, board threads and ticket details called ReplyCreate without a
request ID. A lost successful response followed by another Post could duplicate the
reply. Text, visibility, attachments and mentions stayed editable during a pending
save. Closing or changing panels/routes could silently discard a draft. Board
uploads ignored failed PUT status; multi-file failures could lose successful picks.

## Decision

All three member reply forms use one prepared submission hook. First submission
captures the parent, project and a deep copy of the Pydantic ReplyCreate payload
with a required client request ID. A synchronous guard prevents double submit. The
API read has a 30-second timeout; timeout/error keeps the same immutable request for
explicit Retry reply save. Body/layer/attachments/mentions/AI replacement freeze once
submitted until confirmed or explicitly discarded. Copy text has a manual fallback.
Front validation reflects the server's body, attachment and mention limits. Server
authorization, layer inheritance and actor/body/parent-bound replay remain decisive.

Confirmed API replies update the actual project cache by ID. Clearing the composer
and refreshing related views are post-save work; a refresh/cache failure reports
Reply saved with a refresh warning, never an unconfirmed POST. Unmounted/replaced
resources do not repopulate a stale project cache through this hook. Mutation data
is not a persisted queue and is garbage-collected when unobserved/settled.

Dirty, uploading, pending and unconfirmed replies guard context-changing router
navigation, native unload, thread-modal close and ticket deletion entry. Stay keeps
the draft. Discard needs an explicit action; it stays disabled during writes/uploads.
An approved local close that also changes URL does not ask twice. Canvas page/size/
mode changes alone preserve the parent-bound reply and do not interrupt it with a
discard dialog; thread/panel/project context changes remain guarded. Thread forms
are keyed by comment ID. Full access loss/removed thread can still force teardown;
ordinary navigation protection must not keep unauthorized content visible.

Upload selected files sequentially, enforce the remaining attachment count and
20 MiB per-file preflight, retain each confirmed attachment, report partial failure
and allow picking failed files again. Use the existing checked PUT/direct fallback
helper. No new storage type or orphan-cleanup guarantee is introduced.

An AI draft is now a visible suggestion applied explicitly, preserving text typed
while the provider was working. Applying suggestions clears prior mention recipients.
Suggestion actions cannot replace a frozen save. Mention picking honors read-only
and disabled inputs. Existing project/board role loss leaves typed text copyable
while current permission still allows reading the thread. Shared focus trapping
recomputes enabled/visible targets on Tab and defers to a nested dialog, so a pending
confirmation does not trap focus on its disabled Discard button.

## Verification and limits

Repeated affected web lint/typecheck/build passes 3/3 through submission, copy,
upload, navigation and AI refinements, including the final dynamic-focus pass.
Diff checks pass.
Existing chunk advisory remains. No new HTTP schema/generated declaration, backend
source, migration, test suite, provider call, production reply or upload.

Manual acceptance remains pending for unsent draft/Stay/Discard/Escape, local modal
close and router Back/Forward, canvas-only view changes, lost/slow acknowledgement,
one reply under double click/retry, current role/link/project/parent changes, mixed
upload failure and limits, mentions, AI suggestion preview and confirmed-save/failed-
refresh separation. This slice does not add CAS to ticket metadata editing or
protect every metadata draft; ticket-detail role gating and metadata save lifecycle
remain separate identified work. Backend replay support is already in the deployed
API, while newer hash/native changes still wait on Railway's pause (e476c76 dispatch
again rejected before a deployment ID). Browser acceptance follows web rollout.
