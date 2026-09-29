# TDR-0049: Whole-app polish pass from a rendered audit

Date: 2026-09-29
Status: Implemented; verified by lint/typecheck/build and a headless browser pass

## Context

The user asked for open-ended improvement of the app: find and fix bugs across the site.
Every workspace route was rendered in headless Chromium against the real FastAPI app
running on in-memory Mongo and Redis fakes (scratch harness, not checked in). Routes
were captured at 1440×900 and 390×844, in light and dark themes, with console errors and
horizontal overflow logged. Each finding below was traced to its cause in source before
being changed. Findings that came from the fakes themselves were set aside. For example,
mongomock evaluates `{"$not": [expr]}` as always false, which zeroed the "open" and
"overdue" counts; real MongoDB unwraps the array.

## Decisions

**Hidden team-ticket page removed from page listings.**
- Tickets created from the Tickets page live on a hidden per-project page
  (`backline://projects/{id}/tickets`, `kind: "standalone"`).
- `GET /projects/{id}/pages` returned it like a real site page. The canvas could open on
  it and show "This saved page is outside the project URL". It was also offered in the
  page manager and the New Ticket page picker, and counted as a page.
- `pages/service.py` now leaves it out of `list_pages`, refuses to rename it, and
  excludes it from the reorder set (otherwise reordering the visible pages would fail
  "must include every page").
- The repository's `list_for_project` is unchanged, so comment and AI listings still
  include its tickets.
- Legacy documents are matched by `kind` or by the `backline://` URL. There is no schema,
  index or contract change.

**Errors show immediately and read clearly.**
- React Query retried every failure twice, so a 403/404/422 sat on "Loading…" for about
  3s before the error appeared. Client errors are no longer retried; 408, 429, 5xx and
  network failures still are.
- `api-client.ts` now reads FastAPI's own `{"detail": ...}` errors, which surfaced as
  "Unprocessable Entity".
- It falls back to a message per status, because HTTP/2 has no reason phrase, so a
  non-JSON error body produced an empty message.
- A dropped connection reads "Can't reach Backline…" instead of "Failed to fetch".

**Stale ticket links degrade instead of failing.** An unknown `view`, `sort`, `status`,
`priority`, `tag` or `display` value in the Tickets URL (an old bookmark, for example)
failed the whole request with a 422. Unknown values are now ignored, and the tab and
layout controls fall back to their defaults.

**Layout fixes, each traced to a cascade conflict:**
- Settings, Billing, Share links, Extension and Usage cards had a ~200px empty header
  band. `.bl-settings-section` was meant to be a row, but a later `.bl-attention` rule
  made it a column, turning the header's 200px flex-basis into a height. A compound
  selector now restores the two-column row, stacking below 900px.
- The AI Usage card scattered its icon, heading, list and note across three columns: a
  direct `<div>` child of `.bl-attention` gets that card's grid, which outranks the
  Tailwind `flex` class. That div now sets `display:flex` inline.
- A green line ran under every page's content. `ScrollToTop` focuses the route
  container for screen readers, and the global `[tabindex]:focus-visible` ring outranked
  its `outline:none`.
- A grey smudge sat in the top-left corner of every page: the parked skip link's shadow.
  The shadow now shows only while the link is focused.
- On phones, the Tickets table scrolled the whole page sideways:
  - The wrapper's bare `table` class is Tailwind's `display:table` utility, and a table
    box ignores `overflow-x`. The class was removed.
  - The `sr-only` "Actions" header had no positioned ancestor, so it escaped the
    scroller. `.bl-table-wrap` is now `position:relative`.
- The mobile "New project" button was squeezed to a dot. A later unconditional padding
  undid the mobile icon-only sizing.
- On phones, ticket list rows became two lines instead of a three-letter title, filter
  tab rows scroll sideways instead of wrapping, and row delete buttons are visible on
  touch screens (they only appeared on hover).
- The avatar initial on Settings was grey on red. `.bl-attention span` outranked the
  avatar's text color; avatars (`role=img`) are now excluded via `:where()`, so that
  rule's specificity is unchanged for everything else.
- Client names were centered in the Clients table. The button inherited
  `text-align:center`; archived rows had no flex wrapper at all.

**Clients → "New project" works.** The option only showed a "not wired up yet" toast. It
now opens the project form with that client preselected (a new optional
`initialClientId` on `ProjectForm`).

## Not changed

- Light as the default theme: `use-theme.ts` records it as a requested decision.
- Project card previews stay light in dark mode and carry a "website · illustration"
  label. This is noted for a later design pass and was not changed here.

## Verification

See the 2026-09-29 "Whole-app polish pass" entry in `docs/implementation/06-delivery.md`.
