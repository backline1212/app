# TDR-0100: File review save and upload recovery

Date: 2026-10-21. Scope: F21/30/31, FD-09/12/18 image/PDF review.

## Decision

File-review comment and reply submissions capture their existing immutable payload
and request ID before calling the mutation. Synchronous guards prevent a second
submit from replacing the tracked mutation while the first request is pending.
Text respects the server's 10,000-character limit. Retry retains the same captured
request. Confirmed replies/comments update the page cache by the returned row's
page and ID. Refresh/navigation/cache errors after a confirmed save report a saved
warning separately; they cannot turn that save into a failed POST or a new request.
Unmounted reviews do not repopulate caches. Guest sessions key separate review
instances, retaining their existing cache/session boundaries.

Asset JSON reads/writes now have a 30-second request deadline, file-content reads
60 seconds, and a file upload 120 seconds including response-body receipt. Parent
cancellation is preserved and each timer/listener is cleaned up. The member API
client's recovery wait now honors that signal (TDR-0099). A write timeout explicitly
means unconfirmed, not rolled back; upload retry preserves the existing File/project
request ID and batch completion tracking. No automatic write replay is added.

The file manager acquires its busy flag synchronously before mutation dispatch.
Confirmed name/archive/restore changes update its actual query cache; subsequent
refresh work cannot change the save result. Upload settlement releases busy even
when refresh fails, and shows a separate refresh warning. Empty files are rejected
alongside the existing size/type/count checks. Leaving the manager stops subsequent
files in the batch from starting, without claiming cancellation of an in-flight
server write.

Closing the file manager with a renamed file or unconfirmed batch now asks to stay
or explicitly discard local details. Pending operations refuse close. Native
reload/unload protects those states. Starting a second rename or archive action
cannot silently replace an unsaved filename draft. Authorization remains server-
enforced; this slice adds no guest file-management capability or storage changes.

## Verification boundary

Final affected web lint/typecheck/build pass 3/3 and diff checks pass; the existing
chunk advisory remains. A later wording refinement is tracked in the delivery ledger.
No test suite or shared upload, comment, delete, role change or provider call.
Browser access resumed during this slice, and the existing portal reply draft's
close/Stay/Discard flow passed without posting. Actual PDF decoding/render/pins, guest/member writes,
upload replay, slow/lost responses, partial batches, close/Stay/Discard and refresh
failure acceptance remain pending; no file project was created. Timer execution can be delayed by browser
suspension. PDF parsing/rendering is separate from the network deadline.

Same-field concurrent file metadata updates and exactly-once metadata PATCH still
need a server contract. File-manager route navigation within the SPA has no new
router blocker in this slice: it is nested inside routes that already own blockers;
do not claim full router protection from the local-close/unload guards. Broader
attachment uploads outside the asset API and automatic orphan reconciliation are
also outside this increment. Source checks do not close F31's live acceptance gate.
