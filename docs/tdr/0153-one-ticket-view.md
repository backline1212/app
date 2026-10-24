# TDR-0153: One ticket view

Date: 2026-10-24. Source: product review - a ticket opened from the Tickets page and the
same ticket opened from the board, search, activity or a notification looked and
behaved differently (a draft-and-save form vs. a live thread with mentions, files and AI).

## Decisions

- The board's thread dialog is now the only ticket view. The Tickets page loads the
  ticket's project comments and opens the same dialog; `TicketDetail` is a thin loader.
- The view gained what only the Tickets form had: "Ticket #N" title, project chip,
  "Open in review" link, editable ticket text (editors and managers, the same
  `comment:update_status` permission the API already enforces), Delete ticket, and a
  clear message on a concurrent-edit conflict (409). Fields keep saving as they change
  and now also refresh the Tickets list and dashboard counts.
- Replies say Client/Team, show "edited", and mark team-only replies on client tickets.
- Search matches ticket numbers ("#14" or "14") and shows each result's number.
  `SearchResultOut.ticket_number` is additive.

## Verification

Workspace lint/typecheck/build, backend ruff/mypy. Chromium: Tickets page opened
"Ticket #11" in the shared view; text edit saved; search "#1" found ticket #1.
