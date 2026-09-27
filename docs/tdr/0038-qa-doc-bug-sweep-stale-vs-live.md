# TDR-0038: QA doc bug sweep — most items were already fixed, three were not

Date: 2026-09-27
Status: Accepted

## Context

A client bug report (a Google Doc with 17 annotated screenshots) listed 13 distinct UI
complaints across the Share modal, the left sidebar, the projects dashboard, tickets
(calendar/board/toolbar/due-date), and the pin-click comment popup on a reviewed page.

Before changing anything, each item was checked against the current source, not assumed
from the screenshot. This mattered because the branch already carries several large
design-parity passes (TDR-0032's calendar/board/date-picker rebuild, and the 2026-09-26
tickets/shell/card-hover slices logged in `06-delivery.md`) that post-date when these
screenshots were most likely taken. Several fixes even carry code comments describing
the exact symptom in the screenshot as a bug already closed.

## Decision

**Verify against live source before touching anything; only change what's still broken.**
Of the 13 reported items:

**Already fixed on this branch (no change made, confirmed by direct source read):**
1. Calendar view collapsing into one column —
   `TicketCalendar.tsx`/`backline.css:2037` already lay out a proper 7-column grid
   (TDR-0032).
2. Due-date popup/overlay broken behind a dialog — `DatePicker.tsx` already portals into
   the nearest `<dialog>` (TDR-0032).
3. Sidebar horizontal scrollbar — `.bl-rail{overflow-x:hidden}` (`backline.css:707`)
   already wins the cascade; the scrollbar itself is also hidden (`backline.css:2258`).
4. "Waiting on you" button/text centered instead of left-aligned —
   `backline.css:627-631` already carries the fix, with a comment describing this exact
   layout bug and why the later rule outranks the older 3-column grid.
5. Projects filter tab bar horizontal scrollbar — the redesigned `.bl-tabs` rule
   (`backline.css:767`, `overflow:visible;flex-wrap:wrap`) already wins over the legacy
   `overflow-x:auto` rule that preceded it.
6. Project card three-dot menu in two places — confirmed mutually exclusive by view
   (`ProjectsPage.tsx`'s `cornerMenu` flag): card/compact views get the top-right corner
   menu, list/table views get the footer one. Never both at once.
7. Select/dropdown chevron flush against the border — `backline.css:1985-1994` already
   fixes this for every `.bl-input`/`.bl-select`, deliberately appended last in the file
   so it isn't overwritten by an earlier `background` shorthand, with a comment
   describing the exact symptom.
8. Board view not matching the reference design — already substantially rebuilt
   (TDR-0032, plus two further 2026-09-26 passes logged in `06-delivery.md`).

**Genuinely still broken, fixed in this pass:**
- **Share modal settings icon.** `ShareProjectModal.tsx` drew the "review link settings"
  toggle as a hand-rolled sun-shaped inline SVG, while the sibling `CollaboratorsModal.tsx`
  already imports a proper `GearIcon` for the identical control. Switched
  `ShareProjectModal.tsx` to reuse `GearIcon` instead of maintaining a second icon.
- **"Manage all share links."** Removed from `CollaboratorsModal.tsx`'s footer per the
  report's explicit instruction. (`ShareProjectModal.tsx`'s footer never had this link in
  the current code — only `CollaboratorsModal.tsx` did.)
- **Ticket IDs not visible everywhere.** `ticketRef()` was already wired into every
  ticket-feature surface (list, table, board, calendar, detail, delete-confirm) and the
  project-panel comment surfaces, but the separate comment/design-review Kanban board
  (`features/board/components/KanbanBoard.tsx` — a different board than the tickets one)
  had no ticket/comment number on its cards at all. Added a `bl-tid` badge there,
  matching the existing convention.
- **Pin-popup reply thread not shown.** The widget's read-only comment card
  (`openCommentView` in `apps/widget/src/ui-comment-view.ts`) rendered only the top
  comment. `thread-manager.ts` already held `[top, ...replies]` per thread in memory but
  read only index `[0]` before this fix — the reply data existed and was discarded before
  rendering. Added a `replies` field to `CommentViewData` and a read-only reply list
  (author, relative time, body) below the tags/attachments section. Deliberately **not**
  added: a reply composer inside this popup. Posting a reply already has a real, permission-
  aware path (the dashboard's `CommentDetail`/`CommentThreadPanel` for members); adding a
  second posting surface inside the on-page widget is a separate, larger product decision
  (guest-reply policy, attachment handling, realtime merge) that this report didn't ask
  for — it asked for replies to be *visible*, which is now true.
- **Duplicate `.bl-ticket-toolbar` CSS rule.** Found while investigating the reported
  "vertical scroll" on the All Tickets toolbar: `backline.css` defined this class twice,
  and the second, later definition silently dropped `flex-wrap:wrap`, so the
  Sort/Group/Who controls plus the List/Board/Table/Calendar segment could no longer wrap
  on a narrow viewport. Removed the shadowed first rule and restored `flex-wrap:wrap` on
  the one that wins the cascade. The specific "up/down spinner" scrollbar in the
  screenshot was not reproducible against current markup (no persistent `overflow-y` on
  the toolbar itself, only on popovers that only exist while open) and is most likely the
  same kind of stale capture as items 1-8 above.

**Deliberately left alone (explained, not silently skipped):**
- **Status-change control in the pin popup.** It already exists
  (`ui-comment-view.ts`'s `statusHtml`) whenever `onStatusChange` is supplied, which
  `thread-manager.ts` gates on the widget being embedded inside the dashboard's own
  review canvas (`statusUpdater()`). A guest opening a bare share link — the likely
  source of the reported screenshot — sees the read-only pill by design (guests never
  change status, per `13-Authentication.md §13.5`); a team member reviewing through the
  dashboard already gets the editable version. Changing that gate to also cover a team
  member's *direct* share-link visit (outside the dashboard canvas) is a real product
  question — it needs a way to tell "team member, no dashboard" apart from "guest" from
  inside the widget, which doesn't exist today — so it wasn't done as a drive-by part of
  this sweep.
- **Projects Table view "design a proper UI."** Already has real styling (sticky header,
  truncation, aligned numeric columns, archived-row dimming — `backline.css:2001-2024`),
  not the unstyled table the screenshot suggests. Further visual polish is a design
  opinion, not a defect; left for a scoped design pass with actual direction, not
  reinterpreted here.
- **Missing due-date range filter button in the tickets toolbar.** Git history
  (`caaf5d1`) shows this was deliberately removed along with a full search/filter row in
  an earlier, intentional pass, then never reintroduced. Re-adding it reverses a past
  product decision this report didn't ask to reopen (it only asked about board-view
  parity and ticket-ID visibility), so it was left as-is.

## Consequences

- Files touched: `apps/web/src/features/workspaces/ShareProjectModal.tsx`,
  `apps/web/src/features/projects/panel/CollaboratorsModal.tsx`,
  `apps/web/src/features/board/components/KanbanBoard.tsx`,
  `apps/widget/src/ui-comment-view.ts`, `apps/widget/src/thread-manager.ts`,
  `apps/widget/src/ui-styles.ts`, `apps/web/src/styles/backline.css`.
- No API contract, database, or `packages/types` change; nothing here touched a backend
  route.
- No test suite was written or run, per this task's own instructions (Claude Code:
  verify via lint/typecheck/build only).
