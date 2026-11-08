# TDR-0239: Faster triage in the ticket dialog

Date: 2026-11-08. Source: navigation audit, "triage → resolve" journey.

The shared ticket dialog (Tickets, Board, search, notifications, activity) only had a
Status menu, and moving to the next ticket meant closing it and finding the next row.

- Resolve / Reopen button next to "Post reply" (editors and managers), clearing
  waiting-on like choosing Resolved in the menu does.
- Opened from the Tickets page: ‹ › and "N of M" step through the list as currently
  filtered and sorted, and "Resolve & next" moves on once the save lands. Stepping
  replaces the history entry, so Back still closes the dialog. An unsent reply asks
  before moving.
- ⌘/Ctrl+Enter posts the reply (the canvas and asset review already did).
- "Copy link" copies `/w/:slug/tickets?comment=<id>`.

Deferred: sending search/notification/activity links to the Tickets view as well. Those
can carry a reply's id, which the Board resolves to its thread and the Tickets lookup
does not yet.
