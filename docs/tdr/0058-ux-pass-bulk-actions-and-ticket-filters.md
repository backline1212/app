# TDR-0058: UX pass - bulk actions, ticket filters and decluttered screens

Date: 2026-10-02
Status: Implemented; verified by typecheck, lint and build (no browser pass - see Verification)

## Context

A product-design review of the dashboard, focused on Tickets and Projects, found that
the screens offered a lot of functions but a weak flow between them:

- **No bulk actions.** Tickets and projects could only be changed one at a time. A
  triage pass (close ten tickets, reassign a sprint's work, archive last quarter's
  projects) took one dialog per item.
- **Tickets couldn't be narrowed from the page.** There was no search box and no way
  to filter by project, status, priority or tag except by clicking a value inside a
  row or a status in the sidebar. A `?search=` link worked but showed no chip.
- **Per-row trash icons.** Every ticket row and table row had a hover trash button,
  next to the status and due-date controls - easy to hit by mistake, and duplicated
  in the ticket detail.
- **Ticket detail hierarchy.** One long form: the screenshot and the conversation sat
  below Save, and "Delete ticket" sat beside "Save changes". "Changes saved." stayed on
  screen after every save. Replies had no timestamps.
- **Project cards repeated themselves.** The hover overlay had Duplicate, Share and
  "Who has access" buttons (the last two opened the same dialog, and all three are in
  the ⋯ menu), and the card showed the URL three times (browser bar, overlay, body).
- **Noise on the Projects page.** A live clock in the header; "Web App · Soon" and
  "Mobile App · Soon" filter tabs that always filtered to nothing; a sidebar group,
  "PROJECTS", holding one link (Archived).
- **Naming.** The sidebar called the status links "Comments by status" though each one
  opens the Tickets list.
- **New project form order.** For a website, the form asked for the client, then the
  name, then access, and only then the URL - the one thing the person has in hand. The
  step indicator said "Step 2 of 3" in a two-step flow.
- **Project settings.** Two read-only rows ("Automatic anchor recovery - Always on",
  "Client email digest - Not available") described things nobody can change, in
  internal language ("legacy per-project toggle", "no approved recipient contract").

## Decisions

**Selection.** `lib/use-selection.ts` holds the selection for one list.
- It covers only the rows on screen. Anything that changes which rows are listed
  (filters, sort, page, layout, the Active/Archived switch) clears it, so an action can
  never reach a row the person can no longer see. Opening a ticket's detail does not.
- Shift-click selects or clears the range since the last click. Escape clears the
  selection unless a dialog is open.
- Tickets: List and Table layouts (Board and Calendar have their own drag interactions
  and no row to hold a checkbox). Projects: every layout; on cards the checkbox shows on
  hover or focus, and stays visible once anything is selected.

**Bulk actions reuse the per-item endpoints.** `lib/run-bulk.ts` runs the existing
request for each selected item, four at a time. There is no new bulk API.
- Each item keeps its endpoint's permission check, audit/activity entry, notification
  and realtime event, exactly as if changed by hand.
- One refused item fails alone. The toast says how many succeeded and the first reason
  for any failure; failed items stay selected so they can be retried or opened.
- A page holds at most 50 tickets, so a batch is at most 50 requests.
- A backend bulk endpoint would need its own permission, audit and event fan-out for
  every action. That is worth doing if selections ever span pages; it is not needed
  for one page.

**Bulk bar.** A floating bar at the bottom of the viewport (`components/BulkBar.tsx`)
appears once anything is selected: the count, the actions, and a clear button.
- Tickets: Status, Priority, Assign (replaces assignees with one person, or Unassign),
  Delete. Closing tickets in bulk also clears "waiting on", as the detail does. Delete
  confirms with a list of what goes.
- Projects (Active): Archive, with a confirmation and an **Undo** action on the toast
  that restores the same projects. Only projects the person manages are archived; the
  rest are named as skipped.
- Projects (Archived): Restore; and, for owners and admins, **Delete permanently**.

**Bulk permanent delete keeps the single-project safeguards.** The dialog runs each
project's own dry-run (`hard-delete/preview`), shows the combined counts, lists the
projects that can't be deleted and why (not archived, or files outside its storage
prefixes), and requires typing `delete N projects`. It then confirms each project with
its own correlation id and name, one at a time. Expired plans fail per project with the
server's message.

**Ticket filters.** The Tickets toolbar gains a search box (debounced, stored in
`?search=`, history entry replaced) and a **Filter** popover with Project, Status,
Priority and Tag. Both write the existing URL parameters, so links, chips and the
sidebar status links keep working. The search shows as a removable chip. The page
heading follows the active tab ("Needs your reply", "Overdue", ...).

**No per-row trash.** Deleting is done from the selection bar or the ticket detail.

**Ticket detail.** Rebuilt as a wide dialog: a context strip (ID, project, page,
visibility, "Open on page"), then the request, its author and age, screenshot and
attachments on the left; properties on the right with Save at the bottom of that
column and Delete as a quiet link under it. Save is disabled until something changes,
and saving shows a toast. The conversation follows, with author, age and visibility
per reply. Same fields and endpoints as before.

**Projects page.**
- Hover overlay: only "Open project" (a label - the card link handles the click).
- Header clock removed; "Soon" tabs removed (old `?type=webapp|mobile` links still show
  the coming-soon panel; both types remain on the New project dialog's roadmap).
- An **Active / Archived** switch with counts sits in the toolbar. The sidebar's
  "PROJECTS › Archived" group is removed; `?archived=true` links still work.

**Sidebar.** "Comments by status" is now "Tickets by status".

**New project form.** For websites the URL comes first and suggests a name from the
domain (`staging.acme-studio.com` → "Acme Studio") until the name is edited; files come
first for image/PDF projects. Then name, client, access. Step indicator: 2 steps.

**Project settings.** Only real switches remain; anchor recovery is one caption line.
The cross-browser description no longer refers to internal UI names.

## Not changed

- **Backend, API contracts, database.** No change; `packages/types` not regenerated.
- **Board and Calendar layouts** have no selection (see above).
- **Tests.** No new suites (Claude Code instruction in `AGENTS.md`). No existing spec
  referenced the removed or renamed elements.

## Suggested next steps (not in this slice)

- Bulk "Add tag" and "Set due date" on tickets; "Move to client" on projects.
- Select across pages ("Select all 230 matching") - needs a backend bulk endpoint.
- Keyboard navigation on the ticket list (j/k to move, x to select, e to open).
- The ticket detail as a side panel beside the list instead of a modal, so triage
  doesn't lose the list's scroll position.
- Saved views for the ticket filters.

## Verification

See the 2026-10-02 "UX pass: bulk actions, ticket filters" entry in
`docs/implementation/06-delivery.md`.
