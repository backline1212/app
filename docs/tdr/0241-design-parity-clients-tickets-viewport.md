# TDR-0241: Clients rows, ticket pages and the viewport controls follow the design

Date: 2026-11-28

## Context

Design review asked for the Clients rows, "Assigned to me", "All tickets" (every layout)
and the project review bar's viewport controls to match the Final Draft HTML.

## Decision

Clients

- A list of rows (contact initials, client and contact, up to two project chips, open,
  resolved, reviewers, last activity, Share, a menu) replaces the table.
- The client count, search box, "Show archived", the archived list, and the Archive and
  Restore actions are removed. The API endpoints stay. Clients already archived stay
  archived and cannot be restored from the dashboard.
- Share opens the share dialog for the client's first project.
- Global search opens `?client=<id>`, which scrolls to and marks that row.

Tickets

- The header carries "Back to projects", a per-page description and "N of M tickets ·
  K overdue". One bar holds the tabs, sort, group and layout.
- The search box, status and priority selects and Export CSV are removed. A filter that
  arrives in a link still applies and shows as a removable chip.
- "Assigned to me" keeps its other tabs scoped to the signed-in person (`mine=1`) and has
  no "Show work for" picker; "All tickets" keeps it. "New from clients" shows as a tab
  only while that view is open.
- Default sort is Due date.
- Row selection and delete appear on hover or focus, while a selection exists, and always
  on touch screens.
- The calendar starts on Monday, tints entries by status, and shows "No due date" only
  when needed.

Viewport controls

- The menu lists the design's devices, a width box sets a custom width, and the separate
  custom width and height form is removed. Names saved in older links still resolve.

## Consequences

- Amends TDR-0229 (ticket search, status and priority controls).
- No API or data change.
