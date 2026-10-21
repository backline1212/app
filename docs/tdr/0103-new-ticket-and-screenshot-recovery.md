# TDR-0103: New ticket and screenshot recovery

Date: 2026-10-21. Scope: FD-09/10/18/21, New ticket and Team note.

## Decision

The shared creation form captures its project, body, page, metadata, screenshots
and existing request ID before dispatch. A synchronous guard prevents rapid submit
from replacing a pending mutation. The save has a 30-second deadline; an uncertain
response retains the original immutable request. A confirmed save becomes a
completed, non-submittable state before refreshing views. Refresh errors report
Saved with a warning; a stalled refresh does not prevent Close. Unmounted refresh
callbacks cannot close a newer form. Instances are keyed by workspace/project.

Local X/Escape/Cancel now protect body, metadata, screenshots and uncertain requests
with Stay/Discard. Pending saves/uploads refuse close. Native unload/reload protects
those states. Completed saves do not ask to discard. An unavailable project leaves
the picker usable so an authorized alternative can be selected, while save remains
gated by the active editor project list. Portaled date input honors pending/frozen
and project-access state. Background page refresh cannot change a prepared request.

The screenshot picker preflights remaining capacity before uploading any selected
file. Each confirmed screenshot is kept immediately; no upload is discarded by
silently slicing an oversized selection after upload. Supported type/size checks
report partial failure while retaining successful picks. Blob URL ownership follows
the live screenshot ref through removal, project changes and unmount. Leaving the
form aborts its current client upload and prevents starting subsequent files.

Screenshot uploads reuse the checked presigned PUT/direct-relay fallback used by
replies. That shared helper now bounds its reserve/PUT/fallback/response sequence
to 120 seconds, preserves caller cancellation and rejects empty or >20 MiB files.
A timed-out upload is explicitly unconfirmed; it is not an upload replay guarantee.
This also bounds the existing portal reply attachment calls through that helper.

## Verification boundary

Final affected web lint/typecheck/build pass 3/3 and diff checks pass; the existing
chunk advisory remains. No suite,
shared ticket/note/screenshot write or permission change. Verify unsent local close/
Stay/Discard, confirmed-save/slow-refresh, lost acknowledgement/original retry,
rapid submit, page/project/role changes, 10-file/20 MiB/type limits, partial/CORS/
timeout uploads, cancellation and blob URL cleanup. Actual save/upload acceptance
remains pending unless explicitly recorded in the ledger.

2026-10-22 live follow-up: ad03bb4 web rollout succeeded. New ticket empty-save
gating and unsent body Cancel/Stay/Discard pass in signed-in Chrome. No ticket or
upload was created; the existing total stayed five. Actual write/failure acceptance
is still pending.

SPA route navigation is not newly blocked by this form; its project parents already
own router blockers and need a shared guard design before adding another. Local
close/unload protection must not be described as full route protection. Unused
signed-upload holds, direct-fallback orphan reconciliation, cross-session draft
persistence and server exactly-once attachment upload remain open work. Client
abort/deadlines do not roll back a request that the server already committed.
