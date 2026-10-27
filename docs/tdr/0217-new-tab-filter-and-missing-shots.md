# TDR-0217: "New from clients" tab filters; missing screenshots say so

Date: 2026-10-27. Source: team walkthrough of Tickets and the project Board.

## Findings

- The Tickets page's "New from clients" tab (TDR-0208) listed every ticket: the page's
  allow-list of `view` values didn't include `new`, so it was dropped before the request
  while the tab count (from the dashboard) showed 3.
- A screenshot that can't load (an expired signed link in an old tab, an object missing
  from storage) showed the browser's broken-image icon on Board cards and in the side
  panel.

## Decisions

- `new` is an accepted view; the tab shows only unassigned, not-started client feedback.
- `ShotImage` replaces a failed screenshot with "Screenshot unavailable" on Board cards,
  side-panel comment rows and every `MarkedShot` (ticket dialog, side-panel ticket,
  screenshot view).
