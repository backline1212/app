# TDR-0102: Ticket list permissions and mutation lifecycle

Date: 2026-10-21. Scope: FD-10/11/18/21 ticket triage.

## Decision

List/table status, table priority/date, board/calendar dragging and row deletion
follow the existing project editor/manager role from the workspace project query.
Missing/failed role data and archived projects cannot enable triage. Server
authorization is unchanged. The page offers project-access retry, and new-ticket
entry requires at least one active editable project. Read/open/filter/sort remain
available. The creation form already restricts its project picker to editor access.

Quick-edit submission is synchronous and serialized within this ticket-list hook.
Permission is checked before optimistic changes and again before the write.
Rollback carries its original filtered query key, and cannot repopulate a cache
after an account/workspace context change. Later filter navigation cannot direct
an old rollback into the current results. Refetch failure reports separately and
does not retain the edit lock. Other concurrent writers still need server CAS.

The shared date picker accepts a disabled state, hides its open portal and guards
date callbacks while disabled. Calendar drops now check pending state and source
permission, matching the board; disabled cards cannot start dragging. Empty board
columns no longer advertise a drop action when none of the visible tickets can
be edited.

Delete confirmation independently reads the project role, disables confirmation
while loading or unauthorized, and guards rapid submission. All shared confirmation
dialogs refuse X/Escape/Cancel while their pending operation is active. A confirmed
ticket DELETE immediately becomes a completed state; slow/failed list refresh
cannot offer another delete or prevent closing. Late refresh completion after
unmount cannot close a later ticket dialog. No actual ticket was deleted to verify
this increment.

## Verification boundary

Affected web lint/typecheck/build and diff checks are recorded in the ledger; no
test suite, role change or shared mutation. Manual mixed-role list/table/board/
calendar, role loss with an open date/delete dialog, slow/error/rapid edits,
filter changes during failure, context changes during rollback, deletion response/
refresh separation and keyboard acceptance remain pending. Role data is an observed
query result, not instantaneous revocation. Same-field concurrency and exactly-once
PATCH semantics remain open server work. New-ticket draft/upload lifecycle is
separate from this triage slice.
