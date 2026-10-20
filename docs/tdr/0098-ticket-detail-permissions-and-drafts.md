# TDR-0098: Ticket detail permissions and unsaved edits

Date: 2026-10-21. Scope: FD-10/11/18 ticket detail UX.

## Decision

Ticket details use the existing project-role query: commenters may reply; editors
and managers may edit or delete. Until permission data arrives, mutation controls
are disabled. Lower roles retain readable/copyable text and an explanation. The
server remains authoritative on every write. A revoked editing role also removes
an open delete confirmation. No permission or API contract is expanded.

Ticket body and metadata now join reply text in the existing close/navigation/
unload draft guard. Explicit discard resets the metadata draft to its confirmed
baseline. Active saves prevent leaving. Pending saves freeze controls, including
guarding callbacks from a date picker already portaled outside the fieldset. A
synchronous submit guard prevents another save before React renders pending state.

Save captures a typed copy of changed fields only. Editing a body no longer sends
stale, untouched assignees, status, priority, due date or waiting-on fields. Confirmed
responses establish the new baseline; a refresh failure reports a saved warning
separately. Failed writes retain the draft and advise checking the latest ticket.
Body editing respects the server's 10,000-character limit.

## Verification and remaining boundaries

Final affected web lint/typecheck/build pass 3/3; diff checks pass. The existing
chunk advisory remains. No test suite, shared ticket/reply/delete/upload, role
change or migration.
Live acceptance is blocked because browser use is disabled in Work settings; the
attempt to enter an unsent QA reply was rejected before typing. TDR-0097's draft
Stay/Discard acceptance therefore remains pending despite successful web rollout.

Check viewer/commenter/editor controls, role changes with a picker/delete dialog
open, metadata-only dirty close/Back/unload, Stay/Discard, pending save and failure,
changed-field PATCH contents and confirmed save with refresh failure. Same-field
concurrent edits still need backend compare-and-set support. CommentUpdate has no
request ID or version contract; no exactly-once metadata retry, automatic replay,
instantaneous permission revocation or universal background-draft synchronization
is claimed by this frontend slice.
