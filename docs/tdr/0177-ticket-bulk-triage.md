# TDR-0177: Bulk triage on the Tickets page

Date: 2026-10-25. Source: product review - after a client review round a team had to
open or edit every ticket one at a time to set status, priority or an owner.

## Decisions

- List and Table layouts get a checkbox per ticket the viewer can edit, plus "select
  all" per table group. A bar shows "N selected" with Set status, Set priority,
  Assign to (one member, or Nobody) and Clear selection.
- Each change is sent as the same per-ticket `PATCH /comments/{id}` the row controls
  use, one ticket after another, with that ticket's revision. Permission, revision,
  notification and integration behaviour is unchanged; no new API.
- Afterwards the page says how many were updated; tickets that were not changed (for
  example changed by someone else, 409) stay selected and are listed with the reason.
- Selection is screen state, not a filter: it is kept while a ticket is open and
  cleared when the filter, tab or page changes. Board and Calendar are unchanged.

## Verification

Workspace lint/typecheck/build. Chromium: selected three tickets in List and set
priority High (all three updated, result shown, selection cleared); Table "select all"
selected all 25; Clear selection emptied it.
