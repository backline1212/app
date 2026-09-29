# TDR-0047: Seamless commenting on the review canvas

Date: 2026-09-29
Status: Accepted

## Context

The user asked for the project editor page (the review canvas, `ProjectOverviewPage`,
where comments are placed) to work seamlessly: every comment problem and UI problem
on the page fixed, across frontend, backend and database.

Each part of the page was read: the canvas page, its Comments drawer (list and
detail), the in-canvas widget, and the comments API. The page was then driven in
headless Chromium against a stateful mock of the API, proxy and realtime socket (a
scratch harness, not checked in). What the harness showed:

**Canvas and drawer out of step**

- Opening a comment from another page left the canvas where it was. The widget holds
  only the loaded page's comments, so nothing happened.
- The previously open comment's card stayed on screen, which made it look like the
  answer.
- The status line said "Comment N — locating its pin" forever. N was the comment's
  position in the project, not its `#` ticket number.
- A team-only comment can never have a pin in the canvas, because the widget runs with
  the client's view. Selecting one gave the same endless "locating" message.
- react-router's functional `setSearchParams(prev => …)` takes `prev` from the last
  render, so two URL updates in one event don't compose. Opening a thread and switching
  page in one click dropped the thread. The comments in `useCommentFilters` assumed the
  opposite.
- Clicking a pin only highlighted its row in the list. It didn't open the comment.
- `page-registered` was posted before the widget had loaded the page's comments or
  attached its scroll listener, so a request sent in reply to it was lost.

**Widget gaps**

- `comment.created` was ignored: another person's comment or reply appeared only after
  a reload, and an open card never showed new replies.
- One click elsewhere discarded a half-written comment, and Escape did nothing.
- A file removed while still uploading was attached anyway. An oversized or failed
  file disappeared without a message. Posting mid-upload dropped the pending file.
- After a reload, a region comment's pin jumped to its element's corner. Its outline
  was drawn outside the shadow root, so Browse mode didn't hide it, and it didn't
  follow the element. A region drawn past the element under the pointer was squashed
  onto that element.
- A freshly drawn region's pin tracked the drawer's shared `target`, which the "Post
  comment" click overwrote with the widget's host element, so the pin hid itself.
- The avatar for "Sam (Client)" read "S(".
- The "Tap anywhere…" tooltip and toasts sat under the dashboard's floating dock.

**Drawer**

- Replies on a team-only thread defaulted to "Client visible".
- Field edits weren't optimistic. Tags, assignees and waiting-on are toggled inside
  menus that stay open, and each toggle was computed from the pre-round-trip value, so
  a quick second click undid the first.
- Reply and field errors carried over to the next comment.
- A posted reply sat below the fold.
- A won't-fix comment offered "Resolve" instead of "Reopen".
- There was no way to change a comment's visibility, although
  `PATCH /comments/{id}/layer` exists.
- "Delete thread" deleted immediately, with no confirmation or error feedback.
- Enter or Space on a row's own buttons opened the comment instead.
- "Display: Compact" changed only the gap between rows.
- "Select all" did nothing, and "No comments match" had no way to clear the filters.
- "Show comments on current page only" hid everything until the widget reported in.
- `dueMeta` read UTC-midnight dates in local time: "Due today" beside "30 Sept".
- Escape closed the drawer, and lost the draft, while the reply box had text or a date
  picker was open.

**Layout**

- The workspace was 12px wider than 1440px, so a focus change could shift the whole
  page sideways and clip the right rail. The last footer control was cut off.
- At widths up to 1100px the workspace had a 720px minimum height, which pushed the
  footer off a 1024×700 screen.
- The footer's menus opened under the floating dock.
- The dock's colours referenced two tokens that don't exist (`--ink-9`, `--ink-1`),
  which left it unreadable in dark theme.

**Backend**

- A member's reply on a team-only thread was stored and broadcast as client-visible,
  so it reached the guest channel.
- Making a thread team-only left it in every open guest widget until reload.
- Client-layer replies on a team-only thread were still in the guest page listing.

## Decision

- **Showing a comment is one page-aware action** (`revealComment` in
  `ProjectOverviewPage`): select it, and if it lives on another page, go there first.
  The request is sent once that page's widget reports in. The widget answers every
  request with `backline:comment-located` (found / not on this page / element
  missing), and closes any card it has open for a different comment. The status line
  prints the `#` reference and the real outcome, and states plainly that team-only
  comments have no pin in the canvas.
- **One composing URL updater** (`lib/use-search-params-updater.ts`) replaces the
  functional `setSearchParams` on this page and in `useCommentFilters`. Each update
  builds on the previous one made in the same task.
- **A pin click opens the comment's detail.** A request is consumed once, so reopening
  the tab doesn't jump back to it.
- **The widget handles `comment.created`/`comment.updated` fully.** It draws new
  threads' pins, adds replies to threads and to an open card, and loads a thread made
  client-visible. A 1.5s grace for top-level creates, plus `adoptPin`, keeps the
  widget's own post from being drawn twice. It also tells the dashboard about comments
  it posts (`backline:comment-created`), so the list refreshes without the websocket.
- **An unfinished comment is never discarded silently.** A click elsewhere nudges the
  composer instead of discarding it. Escape discards an empty composer at once, and a
  written one on a second press. Posting waits for uploads. The same guard is exported
  to the browser extension.
- **Regions** anchor to the innermost element containing the whole drawn box. They're
  drawn in the shadow root and follow that element. Their pins sit at the region's
  corner after a reload.
- **Drawer.** Field edits are optimistic, with a per-comment rollback, and a stale
  response is skipped while a newer edit is pending. Reply visibility follows the
  thread and is locked on team-only threads. The header layer badge toggles visibility
  behind a confirmation. Deletes are confirmed and give feedback. Compact mode is real,
  and there is a "Clear filters" action. Escape leaves the drawer open while typing, in
  a menu, in a dialog or in a date picker; `DatePicker` now marks its Escape as
  handled.
- **Layout.** `overflow: clip` on the workspace and main row. The "coming soon"
  controls are hidden below 1500px. The minimum height is 560px up to 1100px. The
  footer is raised while one of its menus is open. The dock uses theme tokens. The
  meta fields and thread scroll as one area, and the reply box is shorter on
  laptop-height screens. Draw joins Browse/Comment in the header.
- **Backend** (`comments/service.py`, `comments/repository.py`; no schema, index or
  contract change):
  - `create_reply` makes a reply on a team-only thread team-only.
  - `toggle_layer` sends `comment.deleted` to the project's client channel alone when a
    thread moves from client to team. Members still get `comment.updated`.
  - `list_for_guest_session` drops replies whose thread isn't client-visible, checking
    parents outside the result set with a workspace-scoped query.

## Consequences

- No migration is needed. Existing client replies on team-only threads stop reaching
  guests at read time and are not rewritten, so moving a thread back to client restores
  them.
- Team-only comments still have no pins in the dashboard canvas. Sending them into the
  canvas iframe would hand team content to the client site's own scripts, which run in
  that frame. The drawer states this instead.
- The page's URL updates now all go through the composing updater. Any new code on
  this page should use it rather than `setSearchParams`.
- Not verified here: the pytest suite and the Playwright journeys under `apps/e2e`
  (both need MongoDB/Redis, which this machine doesn't run). No test suite was
  written, per this repository's Claude Code instruction.
