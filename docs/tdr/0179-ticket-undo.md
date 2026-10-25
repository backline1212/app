# TDR-0179: Undo for closing tickets and bulk changes

Date: 2026-10-25. Source: FEAT-08 (pending backlog 2026-10-24) - a mis-click on
"Resolved" moved a ticket to the bottom of the list with no way back except finding it
again, and bulk triage (TDR-0177) made larger mistakes possible.

## Decisions

- Scope is deliberately narrow (not a persisted, global history): Undo puts back the
  values the user's own change replaced, through the same per-ticket update with the
  saved revision, so a change someone else made in between is refused (409), not
  overwritten.
- Tickets page (row status, board drag): marking a ticket Resolved or Won't fix shows
  "#N marked resolved" with Undo, which restores the previous status. Other status
  changes stay where they are in the list and don't toast.
- Bulk triage: the result note offers Undo, which restores each changed ticket's
  previous status, priority or assignees and reports any that could not be put back.
- After a change the list keeps the saved revision immediately, so Undo works before
  the list refresh arrives.

## Verification

Workspace lint/typecheck/build. Chromium: resolved #29 from the table, the toast's Undo
put it back to Not started; bulk-set #29/#28 to Low, Undo restored High on both.
