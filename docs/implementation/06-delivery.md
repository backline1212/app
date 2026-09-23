# Delivery and verification ledger

## 2026-09-23: Direct deployments without GitHub Actions

- Removed the repository's only GitHub Actions workflow at the owner's explicit
  request. The workflow was a verification/smoke-test gate; it did not perform the
  Vercel or Railway deployments.
- Retained direct Vercel and Railway GitHub deployments. Railway watch paths may still
  report "No deployment needed" for commits that do not change a service's source.
- Reconciled the current architecture, deployment guide, and testing specification in
  TDR-0027. Historical TDRs were left unchanged.
- Verification for this workflow/documentation-only change: `git diff --check` and
  repository status/diff inspection. No application source, API contract, database,
  lint/typecheck/build output, or test suite was changed or claimed.
## 2026-09-22: Ticket numbers, board, calendar and date picker (TDR-0032)

- **Ticket numbers (TDR-0032).** `comments.ticket_number` - a per-workspace integer
  assigned at creation from an atomic `counters` document
  (`CommentRepository.next_ticket_number`), exposed on `CommentOut`/`TicketOut`, backed
  by the additive unique partial index `comments_workspace_ticket_number`, and
  backfilled for existing records by `scripts/migrate_ticket_numbers.py` (dry-run by
  default, creation order, skips numbered records, raises counters with `$max`,
  re-runnable). Replies are deliberately unnumbered. `packages/types` regenerated.
  The reference is printed through one frontend helper (`lib/ticket-ref.ts`) on the
  board, list, table, calendar, ticket detail and the project review drawer - which
  now shows the real number instead of the browser-computed position it used before.
- **Board view rebuilt to the design** (`tBoard`/`taskCard` in `design/index.html`): a
  column per status tinted by that status with a count, and compact cards carrying the
  ticket number, priority, the ticket, its project · page, first tag, due date and
  assignee faces. Dragging between columns still sets status; the per-card status
  `<select>` is gone, since the design's card does not have one and the drag does the
  same job (it remains on the list and table rows).
- **Calendar view fixed** (`design/index.html`'s `.calm`/`.cal-dow`/`.cal-grid`): the
  CSS assumed flat day cells while the component wrapped each week in a `role="row"`,
  so every week collapsed into a single column and the weekday names ran together.
  Each row is now its own 7-column grid, with outside/today cells, three chips per day
  plus "+N more" / "Show less", a Today button and the "No due date" drop panel.
- **Due-date picker fixed.** `components/Dialog.tsx` opens a native `<dialog>` with
  `showModal()`, which paints in the browser's top layer; the calendar portaled to
  `<body>` therefore landed *behind* the dialog backdrop - visible as a smudge and
  impossible to click, so a due date could not be set from a ticket. It now portals
  into the nearest `<dialog>` when there is one, and the popup itself was rebuilt to
  the design's `.dp` (it previously borrowed the full-page `.bl-calendar` grid).
- **Board screen matched to the design, second pass.** Two separate causes, both now
  fixed. (1) A grid item is `min-width:auto`, so one unbreakable string (a project named
  by its URL) set a card's minimum width and pushed it past the column edge, hiding
  priority and the due date; columns, bodies and cards now carry `min-width:0`, so the
  subtitle ellipsizes instead. (2) The new board reused the `.bl-board` container class,
  and the legacy `.bl-board>section` / `.bl-board h2` rules - still the guest board's
  (`features/review/GuestBoard.tsx`), so not removable - outrank any single class: they
  were painting the columns paper-grey instead of white, adding 10px of padding that
  squeezed every card, and shrinking the column headings. The ticket board now has its
  own container class (`.bl-tboard`), which leaves the guest board untouched. Column
  tracks floor at 200px so six statuses still fit a laptop without a horizontal
  scrollbar. The card's due date became plain
  coloured mono text rather than a filled pill, as the design has it, and `TicketOut`
  gained `page_path` so the second line reads "Project · /pricing" (design/index.html's
  taskCard) instead of a page's marketing `<title>`. The ticket filters and the layout
  switcher are now one segmented control each with the design's own view icons and mint
  active counts, matching `.seg` in the design rather than the projects list's folder
  tabs.
- Verification: `pnpm turbo run lint typecheck build` passed (12/12; web lint keeps its
  4 pre-existing warnings, none in changed code). Backend `ruff check .` and strict
  `mypy app/ scripts/` passed (172 files); `ruff format --check` reports only
  files that were already unformatted before this change. The backfill was dry-run and
  then applied against the local dev database (1 workspace, 9 records numbered) and
  re-run to confirm idempotency (9 already numbered, 0 to number). Board, calendar and
  date picker were rendered in headless Chromium against the app's built CSS in light
  and dark, including picking a date inside a real modal dialog (returns the selected
  ISO date and closes) and the calendar's expand/collapse and month navigation. Per
  AGENTS.md, no test suite was added.

## 2026-09-22: Comment detail in the review drawer (TDR-0031)

- Clicking a comment in the project review drawer now opens that comment's detail in
  the drawer (`CommentDetail.tsx`) instead of only scrolling the canvas to its pin: an
  "All comments" back link and `#<n>` badge, the workflow fields (status, waiting on,
  tags, assignee, due date, priority, page), the thread with each message's author,
  attachments and captured context (browser · OS · viewport, and the element it was
  left on), and a reply box. The canvas still scrolls to the pin on the same click, and
  a pin clicked in the canvas moves the open detail to that comment.
- The reply box carries the design's "Write a reply for me" (the existing
  `ai/suggest-reply` endpoint) and "Turn into a dev task", which formats the comment's
  own recorded fields into a copyable card - no AI call, since no such endpoint exists.
  Replies keep their Client visible / Team only choice, screenshot attachments, @
  mentions and Cmd/Ctrl+Enter to post; Resolve/Reopen sits beside Post reply.
- The modal thread dialog is no longer opened from the drawer (the ticket board still
  uses it). `?thread=<id>` still deep-links a comment, and every field edit goes
  through the same `PATCH /comments/{id}` and cache merge as the list and board.
  `DatePicker` gained an optional `triggerClassName`/`children` for its trigger only.
- Verification: `pnpm turbo run lint typecheck build` passed (12/12 tasks; web lint has
  the same 4 pre-existing warnings, none in changed code). The detail was rendered in
  headless Chromium against the app's built CSS at drawer width, in light and dark:
  fields, thread, dev-task card, the status and tag menus, Escape closing a menu
  without closing the drawer (and reaching the drawer on the next press), click-outside
  closing a menu, and Post reply enabling once a reply is typed. Per AGENTS.md, no test
  suite was added; the live drawer against a running API was not exercised.

## 2026-09-22: Status in the canvas comment card (TDR-0030)

- The read-only comment card opened from a pin now shows the comment's status in its
  dark header (dot + label, between the page pill and the close "x"). In the dashboard
  canvas it's a menu with all six workflow statuses. The widget hands the change to the
  dashboard over postMessage (`backline:request-status-access` / `status-access`,
  `update-comment-status` / `comment-status-result`), and the dashboard makes it with
  the member's session via `PATCH /comments/{id}` and merges the result into the
  Comments drawer's cache. The extension calls the same PATCH with its member token.
  Guest reviewers see the status read-only. Guest permissions and the backend are
  unchanged.
- The card shows the new status straight away, then settles to what was saved, or
  reverts with "Couldn't change the status. Please try again." if the change fails or
  no answer comes within 15 s. `comment.updated` over the guest socket now also updates
  the widget's thread state and an open card. The menu is keyboard-operable (arrows,
  Home/End, Enter, Tab). Escape closes the menu first and the card on the next press.
- Verification: widget, extension and web `typecheck`, `lint` (web: 4 existing
  warnings, none in changed code) and `build` passed. The card was rendered in headless
  Chromium from the widget sources against a stubbed updater: editable and read-only
  headers, the open menu, keyboard selection, the pending state, the failure revert and
  the Escape order. Per AGENTS.md, no test suite was added. The live dashboard ↔ canvas
  round trip against a running API was not exercised.

## 2026-09-20: Full-width review preview and draggable width (TDR-0022)

- The responsive project-review preview ("Fit canvas") now fills its container instead
  of being capped at `min(1180px,100%)` and centred. The stage is that container: a
  single 40px gutter each side, with the right gutter also reserving the side-panel
  rail and, while it is open, the comments drawer - so a full-width frame no longer
  sits underneath the panel.
- Added a Chrome DevTools-style width handle on the right edge of the responsive frame
  (`CanvasResizer.tsx`). Dragging it narrows or widens the preview with the grabbed
  edge tracking the pointer, double-click / `Home` / releasing near the container edge
  returns it to full width, and `ArrowLeft`/`ArrowRight` (with `Shift` for a coarse
  step) and `End` drive it from the keyboard. It exposes the window-splitter pattern
  (`role="separator"`, `aria-valuenow`/`min`/`max`) and shows a live px readout while
  dragging.
- The width persists in the URL as `?stageWidth=<px>` (written once per drag, on
  release) and is reflected in the footer status readout as `<width> × auto`. It
  applies only without a `viewport` preset; picking any viewport clears it. No stored
  record or API contract changed.
- Switching the canvas between Comment, Browse and Draw no longer reloads the proxied
  site (TDR-0023). `blMode` is now only the mode the canvas was loaded with, and each
  switch is posted into the running widget as `backline:set-mode`; the widget applies
  it in place (tooltip, region-drawer setup/teardown, a mode check in the click
  handler) instead of being rebuilt. The dashboard re-sends the mode whenever the
  canvas reports `page-registered`, which also keeps Browse mode from reverting to
  Comment after a link click inside the canvas. Pins, open threads, an unsent composer
  and the scroll position all survive a switch now.
- Added the sign-in recovery affordance the login screen was missing (TDR-0024). The
  design's `lg-forgot` control ("Trouble signing in?") now opens the design's `#lg-reset`
  and `#lg-sent` panels, rebuilt against the real OTP flow rather than a password reset
  the product has no backend for: the recovery panel sends the six-digit code, and the
  code step became the "Check your email" panel (mail badge, address in `lg-mailbox`)
  with the existing code field, expiry countdown, resend and change-email controls. The
  three panels are now mutually exclusive, each with its own heading, as in the design.
  Verified against `design/index.html` side by side in Chromium at 1440x900.
- Added email + password signup and sign-in beside the existing OTP and Google flows
  (TDR-0025, spec §13.2a). `POST /auth/signup` (201, signs straight in) and `POST
  /auth/login`, scrypt hashing via the existing `cryptography` dependency
  (`scrypt$n$r$p$salt$digest`, ~32 MiB/~175 ms, derived off the event loop), a nullable
  `users.password_hash` so Google/OTP members are untouched, a 409 rather than a merge
  when the address already exists, one identical failure message for every login failure
  (with a dummy-digest verification so timing doesn't separate them), and per-IP plus
  per-email rate limits. The login screen now carries all four design panels: sign-in
  with a password and SHOW toggle, "Create your account" with the design's four-point
  strength meter and terms gate, the recovery panel and the code panel.
- Verified live against a local API (Mongo + Redis on this machine, test accounts
  removed afterwards): signup 201 with the refresh cookie set, duplicate signup 409,
  correct password 200, wrong password and unknown address both 401 with the same body,
  a member with no password also 401, per-email login limit tripping to 429 after 10
  tries, and the schema/service policy rejections (422 under 12 characters, repeated
  characters, email inside the password, blank name). Driven through the real UI in
  Chromium: strength meter Weak→Strong, SHOW/HIDE, the terms gate, signup landing
  authenticated on `/`, and password sign-in doing the same.
- Regenerating `packages/types` also cleared drift already on `main` - the deleted
  `modules/auth/account` router was still in the checked-in `openapi.json`, so
  `app__modules__auth__schemas__SessionOut` collapsed back to `SessionOut` and the one
  frontend reference was updated.
- The review proxy now carries a login form and the session behind it (TDR-0026, spec
  §13.3a), so pages behind a client's own login can be reviewed. Added POST routes
  beside the existing GET ones, request-body forwarding capped at 2 MiB, `Origin`/
  `Referer` rewritten to the reviewed site's own address so its CSRF checks pass, and
  cookie passthrough in both directions - re-emitted to the reviewer as
  `blp_{share_token}_{name}` on `Path=/proxy/{share_token}` (`SameSite=None; Secure;
  Partitioned` outside local, since the canvas is a cross-site iframe), and forwarded
  upstream only when they carry that prefix. A form's redirect is returned to the
  browser as a 303 at the proxied path rather than followed server-side, so the frame's
  URL matches the page it shows. Nothing is stored server-side.
- Verified live against a local site with a real login (form → Set-Cookie → redirect →
  protected page), with the SSRF guard stubbed in a throwaway local process only, and
  the seeded project/share links removed afterwards: signed out bounced to the login
  page, the form action rewritten to the proxy, POST answered 303 to the proxied
  dashboard with the namespaced HttpOnly cookie, the protected content then served, and
  the widget still injected on it. Isolation checks: the site received only its own
  `sid` cookie while `refresh_token` and another Backline cookie sent alongside were not
  forwarded; `Origin`/`Referer` arrived as the site's own; a second share link to the
  same site in the same browser saw no session and was bounced to the login page; wrong
  credentials returned the site's own 401.
- Comment boxes now grow with what's being typed instead of staying at their opening
  size. The widget composer (`ui-composer.ts`) and the dashboard thread reply
  (`MentionsInput`, via the new `lib/auto-grow.ts`) share one rule: fit the content up
  to a 40vh cap declared in CSS, then scroll, and treat a height the person set by
  dragging the corner as a floor so a keystroke never undoes their drag. Both keep
  `resize: vertical`. The widget re-runs `placeCard` on each growth so a composer opened
  near the bottom of the viewport rides up rather than growing off-screen. A short
  message still looks exactly as it did.
- Verified in Chromium against the running app, with the seeded fixtures removed
  afterwards. Widget composer: 78px empty and for a one-liner, 164px for a seven-line
  comment, capped at 304px (40vh of a 760px viewport) for 40 lines and scrolling from
  there. Dashboard reply: 64px empty, 84px for a four-line reply, capped at 380px (40vh
  of 950px), scrolling, and still reporting `resize: vertical`.
- Fixed the comment composer navigating the reviewed page away on Enter. A shadow root
  hides DOM, not events: keystrokes typed into the widget kept propagating out
  (retargeted to the host) and reached the reviewed site's own document-level key
  handlers - a search box, a nav, a carousel - so a plain Enter mid-comment ran the
  site's handler and took the unsent comment with it. `createShadowRoot` now stops
  `keydown`/`keypress`/`keyup` at the shadow boundary, which is the last point inside
  the widget's own tree. Widget-internal handlers are unaffected: they sit on the
  elements themselves (the composer's Cmd+Enter, a pin's Enter) or on document in the
  capture phase (the comment card's Escape), both of which run first.
- Reproduced and verified in Chromium against a proxied local site carrying
  `document.addEventListener("keydown", e => e.key === "Enter" && (location.href = ...))`,
  which is what the real symptom looked like. Before: Enter navigated to the other page
  and the composer with its half-typed comment was gone. After: the page stays put, the
  composer stays open and Enter inserts a newline. Regression pass on the widget's own
  keys, all with no navigation: Enter submits the guest name prompt (implicit form
  submission is a default action, which stopPropagation doesn't touch), Cmd+Enter still
  posts a comment, and Escape still closes a pin's comment card.
- Verification: `pnpm turbo run lint typecheck build --filter=@backline/web --filter=@backline/widget` passed
  (6/6 tasks; 607 modules; the pre-existing >500 kB chunk warning and four pre-existing
  react-refresh lint warnings remain). Stage geometry was measured in headless Chromium
  against the built stylesheet: 40px left gutter and 94px right (40 + 54px rail) with
  the drawer closed, 474px right with it open, the frame centred within that box at any
  explicit width, and the handle hidden below the 760px breakpoint. No test suite,
  database migration, or deployment is claimed.

## 2026-09-10: Brand, contrast, and light/dark UI hardening

- Made Light the deterministic first-visit theme and retained Dark as an explicit user
  choice. Added a theme control to the authenticated topbar, project-review header, and sign-in screen, replaced
  the Account modal's system/light/dark select with clear Light/Dark choices, synchronized
  mounted controls, and kept the existing per-browser persistence boundary. Legacy
  `system` values safely resolve to Light.
- Repaired the root cause of mixed-theme text: Tailwind semantic colors now resolve
  through the same runtime custom properties as `backline.css`. Accent text, filled
  actions, and on-accent foregrounds have separate roles, preventing both dark-on-dark
  labels and white-on-bright-mint controls. The dark palette now has distinct canvas,
  rail, surface, elevated, border, text, muted, focus, danger, and brand states.
- Hardened shared application chrome and components: branded active navigation, clearer
  hierarchy, raised surfaces, consistent radii/shadows, visible focus states, responsive
  spacing, reduced-motion support, theme-aware inputs/tables/chips/dropdowns/dialogs, and
  responsive Account settings. Renamed the browser title from the prototype `QA Tool`
  label to Backline and added theme metadata.
- Migrated the project Board's remaining prototype Tailwind presentation onto shared
  Backline headers, segmented controls, filter bar, kanban columns/cards, empty states,
  bulk controls, and table styles. Data fetching, mutations, React Query ownership,
  URL-owned filters, routing, and backend contracts are unchanged.
- Verification passed: monorepo `pnpm lint`, `pnpm typecheck`, and `pnpm build`. The
  production build retains the existing large-chunk warning. Local browser QA covered
  the sign-in surface in Light and Dark at desktop and 390px mobile widths, verified
  persisted switching and theme-color metadata, and found no sub-4.5:1 normal-text
  contrast results on the rendered sign-in surface. Authenticated visual QA was not
  claimed because no authenticated local browser session was available. No test suite
  was added or run, per the Codex-specific project instruction.
- Decision: [TDR-0021](../tdr/0021-light-default-and-unified-theme-contract.md).

## 2026-09-09: Follow-up external implementation review

- Rejected an incorrect guest-widget drag/re-anchor implementation. It sent a guest
  token to the intentionally member-only `/comments/{id}/reanchor` endpoint, so every
  drop would receive 403 while leaving the pin visually moved. Guest re-anchoring stays
  disabled; pins now expose button semantics and Enter/Space thread opening instead.
- Retained and corrected the safe accessibility/resilience work: the date picker has a
  valid roving tab stop without a selected date and restores trigger focus when closed;
  the widget reconnect indicator is an ARIA live status and distinguishes a browser
  being offline from an online socket/server interruption.
- Source verification passed for both affected packages: web and widget lint,
  typecheck, and production builds. No Playwright or pytest suite was run. These changes
  do not close the outstanding master-audit items or establish release completeness.

## 2026-09-09: Current-state audit (verification only)

- The full set of `audit-batch-00` through `audit-batch-12` reports is present, but
  this does **not** close the master audit: its own ledger records 3 complete, 88
  partial, 47 pending, and 9 backlog rows. Release-complete status is therefore not
  supported.
- Current static verification passed: `pnpm lint`, `pnpm typecheck`, `pnpm build`
  (existing large web-chunk warning), backend Ruff, strict mypy, and workspace-scoping
  lint. MongoDB and Redis accepted read-only connectivity pings; no shared data,
  migrations, fixtures, or deletes were run.
- Existing test suites were not run and no test suite was added, per this Codex task's
  project guidance. The latest unstaged Playwright journey revisions now use the
  supported routes, but their helper/selectors require an isolated execution pass before
  they become evidence. See `docs/implementation/audit-current-state-2026-09-09.md` for
  the exact review findings and recommended completion order.
- The source recheck found and corrected the remaining M-20 ad-hoc integration query
  key: `IntegrationsPage.tsx` now uses `qk.integrations()` consistently.

## 2026-09-08: Slice 09 verification pass — fixes, extended coverage, and checks run

Verified the "Post-login UI consistency audit and polish (Slice 09)" entry below against
`backline.css` and a live build, since it had only been source-inspected. Found and fixed
real defects, extended coverage to routes the audit's own "every post-login and guest
route" mandate had missed, and this time actually ran the checks it had deferred.

**Confirmed defects found and fixed:**

- **Real bug (broken token, same class of mistake as the earlier settings-family
  fix):** `IntegrationsPage.tsx`'s disconnect button was changed from a hardcoded
  `#A33317` to `var(--bl-error)` - but no `--bl-error` custom property existed anywhere
  in `backline.css`, so the text would have rendered in an unstyled/inherited color
  instead of the intended error red. Added `--bl-error:#A33317` to the `:root` legacy
  alias block instead of reverting to a hardcoded hex, so the token now actually backs
  the reference and is available for reuse.
- **Missed one-off colors (the audit's own stated goal, applied to instances it didn't
  reach):** `MembersPage.tsx`'s "Remove" member button and `AccountModal.tsx`'s "Sign
  out" session button still had raw `#A33317` inline styles instead of the new token.
  Switched both to `var(--bl-error)`.

**Coverage gaps found and fixed (routes/components the "audit every post-login and
guest route" mandate should have reached but didn't):**

- `ComingSoonModal.tsx` (invoked live from the already-migrated `McpServerPage` and
  `ProjectTypePlaceholderPage`) was still a hand-rolled `fixed inset-0 z-50` Tailwind
  overlay div, unlike its sibling `ProFeatureModal`/`UpgradeToProModal`/
  `CollaboratorsModal`, which the panel slice had already moved onto the shared
  `Dialog` component. Rebuilt it on `Dialog` with the same `bl-form`/`bl-scope-badge`
  pattern `ProFeatureModal` uses - same copy and behavior, now with native focus
  containment/return and Escape instead of a manual click-to-close div.
- `apps/web/src/features/share-links/ShareLinksPage.tsx` - the full share-link manager
  linked from `ShareProjectModal` ("Manage all share links"), `CollaboratorsModal`, and
  `AssetReview`'s "Share" link - was entirely unmigrated raw Tailwind (`text-text-muted`,
  `border-black/10`, `dark:` variants, a bare `<select>`, no shared `Dialog`, no
  confirmation before revoking a link). Rebuilt on `bl-wrap`/`bl-head`/`bl-table`/
  `bl-empty` for the link list, the same `.bl-create-link`/`.bl-setting-row`/
  `.bl-switch` fields `ShareProjectModal`'s create form already established for a "New
  share link" `.bl-settings-section` card, `.bl-access-state` for the active/revoked
  status pill, and a `Dialog`-based revoke confirmation (`bl-dialog-intro` +
  `bl-dialog-actions-bordered`, matching `ClientsPage`'s archive-confirm pattern)
  instead of revoking on a single unconfirmed click. Also switched its query key from an
  inline `["project", projectId, "share-links"]` array to the existing `qk.shareLinks()`
  factory so it shares cache invalidation with `ShareProjectModal` correctly.
- `NotificationBell.tsx` (global topbar chrome shown on every authenticated page, listed
  in Slice 01's own scope but never actually migrated) was still raw Tailwind
  (`bg-bg-surface`, `border-black/10`, `dark:` variants, a manual `position:fixed`
  click-outside backdrop with hand-rolled `zIndex` values). Rebuilt on the existing
  `.bl-dropdown`/`.bl-dropdown-pop`/`.bl-dropdown-trigger` popover system (same one
  `ProjectsPage`'s filter pickers use) and the shared `useOnClickOutside` hook instead of
  a manual backdrop div; added `.bl-notif-panel`/`.bl-notif-head`/`.bl-notif-empty`/
  `.bl-notif-badge` to `backline.css` alongside the pre-existing `.bl-notif-item`/
  `.bl-notif-route` rules, using `var(--amber)` for the unread badge instead of the old
  Tailwind `recovery-orphaned` red (amber is this brand's "waiting for you" color per
  AGENTS.md, not a warning/error). The topbar icon-button sizing rule
  (`.bl-topbar-actions>.relative>button`) depended on a bare Tailwind `.relative`
  wrapper class as its CSS hook; extended it to also match
  `.bl-topbar-actions>.bl-dropdown>.bl-dropdown-trigger` so the bell keeps the same
  34px topbar sizing as its siblings under its new, correctly-named wrapper.
- `NotFoundPage.tsx` (the router's catch-all `*` route) and the loading/error states of
  `AuthCallbackPage.tsx` and `ClickUpOAuthCallbackPage.tsx` (Google/ClickUp OAuth
  redirect landings) were still raw Tailwind full-screen divs. Rebuilt all three on the
  existing `.bl-review-gate`/`.bl-loading-mark`/`.bl-review-gate-copy`/
  `.bl-review-eyebrow` full-screen gate pattern `ProjectLayout.tsx` already uses for its
  own error/not-found states, and `<LoadingScreen>` for the in-progress states.

**Found but deliberately not fixed here (out of scope for a quick verification pass,
flagged as separate follow-up tasks):**

- `apps/web/src/features/board/BoardPage.tsx` and its `BoardHeader`/`KanbanBoard`/
  `ListTable` subcomponents (the project-level comment kanban/list at
  `/w/:workspaceSlug/p/:projectId/board`, linked live from `ActivityPage`'s feed rows)
  are still entirely on the pre-migration Tailwind system. This is confirmed reachable,
  not dead code, and was missed by every one of Slices 01-09 despite the "audit every
  post-login route" mandate - but it's a multi-file, feature-rich surface (drag/live
  WebSocket updates, ClickUp/Trello task creation, bulk actions) whose full migration is
  slice-sized work, not a quick fix. Flagged for a dedicated follow-up pass rather than
  rushed here.
- `apps/web/src/features/workspaces/WorkspaceHomePage.tsx`, and the `ProjectCard.tsx`/
  `NewProjectMenu.tsx`/`NewProjectModal.tsx` it alone consumes, are dead code (not
  imported by `router.tsx` or anything else reachable - superseded by `ProjectsPage.tsx`)
  still sitting in raw Tailwind. Left untouched and flagged for deletion rather than
  migrated, since migrating unreachable code would be wasted work.
- A pre-existing, low-severity one-off: `CommentRow.tsx`'s "Delete thread" menu row uses
  an inline `color:"#A8401F"` (matching `.bl-button.danger`'s background, not the
  `--bl-error` token) instead of the established `.bl-dropdown-item.danger` class. Left
  as-is - harmless, pre-dates this pass, and outside the 8 files this slice touched.

**Verification run (deferred by the original slice prompt, actually executed for this
verification pass):** `tsc -b --noEmit` passes with zero errors; `eslint .` reports 0
errors (4 pre-existing warnings in files unrelated to this pass -
`ActivityPage.tsx`'s pre-existing `useMemo` dependency warning, and unrelated
`react-refresh/only-export-components` warnings in `BrowserMenu.tsx`/`ViewportMenu.tsx`);
`vite build` succeeds with only the pre-existing large-chunk warning. The `/login` route
was loaded in a local dev server (no backend available, so only backend-independent
pages could be checked) and rendered correctly with no CSS regressions. Not run: full
authenticated browser/keyboard/responsive QA of the specific pages changed (`Members`,
`Settings`, `Integrations`, `Billing`, `Usage`, `Mcp`, `Clients`, `Activity`,
`ShareLinksPage`, the notification popover) - these need a running backend and a real
session, which were not available in this environment.

## 2026-09-08: Post-login UI consistency audit and polish (Slice 09)

- Completed a consistency pass across the post-login settings family and guest routes (`SettingsPage`, `IntegrationsPage`, `BillingPage`, `UsagePage`, `McpServerPage`, `MembersPage`, `ClientsPage`, `ActivityPage`) to align with `backline-Final Draft.html` and `backline.css`.
- Standardized the left-to-right settings layouts using a new `.bl-settings-section` class in `backline.css`, eliminating inline `display: flex; gap: 40px` and fixed-width header overrides that had broken the brand geometry.
- Consolidate loading states by replacing unstyled `<p className="bl-mono">Loading...</p>` or `Loading clients…` text with the shared `<LoadingScreen />` component across all audited routes.
- Standardized empty state heading structures and replaced raw text glyphs (like `🔍`) with proper `@backline/ui` icons (`SearchIcon`).
- Switched the workspace rename success/error feedback in `SettingsPage` from hardcoded inline text to use the shared `useToast` pattern.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview, browser QA, and responsive screenshot comparison. The source diff was inspected, but visual verification is still required.

## 2026-09-08: Guest review entry and asset review slice (Slice 08) — verification and fixes

A prior session had already restyled `ReviewEntryPage`, `GuestBoard`, and `AssetReview`
onto the `bl-`/reference-HTML visual language, but left the change uncommitted and never
recorded in this ledger. This entry covers auditing that work against `backline-Final
Draft.html`, `apps/web/src/styles/backline.css`, and the generated API types, and fixing
what verification found before committing it.

**Confirmed defects found and fixed:**

- **Functional bug (guest board always looked empty):** `GuestBoard.tsx` grouped board
  items under invented status keys (`new`/`prog`/`rev`/`block`/`done`) that don't exist
  on `GuestBoardItemOut.status` (`todo`/`in_progress`/`in_review`/`blocked`/`resolved`/
  `wont_fix` per `packages/types`). Every column's `items.length` was always `0`, so a
  client with real board items would see "No items yet." Fixed to group by the real
  `WORKFLOW_STATUSES` from `@backline/ui`, and to color the read-only status pill with
  `STATUS_COLORS` like the real ticket `StatusSelect` does.
- **Type error (would fail `tsc -b`):** `AssetReview.tsx`'s comment list read
  `c.assignee_names` off a `CommentOut`, which only carries `assignee_id`/`assignee_ids`
  - `assignee_names` only exists on the unrelated `GuestBoardItemOut`. Removed the
    invalid read; `tsc -b --noEmit` and `vite build` now both pass clean.
- **Unstyled/broken UI (real regression, not just missing polish):** the gate
  (`ReviewEntryPage`'s name/passcode modal, its "You're in"/"Taking you to the
  site"/loading/error states) and the asset comment composer's tag-pill picker used
  class names lifted verbatim from the reference HTML's own embedded `<style>`
  (`scrim`, `modal`, `gate`, `modal-head/body/foot`, `field`, `hint`, `btn-solid`,
  `btn-quiet`, `cp-sec`, `cp-tags`, `cp-tag`, `cp-foot`, `cp-cancel`, `cp-post`, `ball`,
  `ballrow`) that were never ported into `backline.css` - none of those selectors exist
  there, so every guest who opened a review link would have hit a completely unstyled
  gate and comment composer. Ported the needed rules into `backline.css` under the
  project's `bl-` naming convention (`bl-gate-*` for the gate, `.bl-review-comments
  .cp-*` scoped to the composer) instead of adding the bare reference-HTML class names,
  to avoid polluting the global class namespace; reused the existing `bl-button`/
  `bl-quiet` button system instead of adding a second `btn-solid`/`btn-quiet` one, and
  reused the existing `bl-chip`/`bl-chip-row` instead of the unstyled `ball`/`ballrow`.
- **Missing slice-required coverage:** guest session recovery and leave/re-enter
  controls, named explicitly in the slice brief, were entirely absent. A guest who
  refreshed `ReviewEntryPage` (or an asset/PDF/image guest, who has no widget and lives
  entirely inside `AssetReview`) was re-asked for their name every time, with no way to
  intentionally end a guest identity. Added `features/review/guest-session.ts`
  (sessionStorage, same key/scope contract as `apps/widget/src/guest-session.ts`) so
  `ReviewEntryPage` recovers an existing session before showing the gate and persists a
  new one on creation; added a `.bl-guest-bar` ("Reviewing **X** as Y" + "Leave review")
  to `AssetReview` and `GuestBoard`, reusing the reference HTML's `.gbar` guest banner
  concept instead of `AssetReview`'s prior hardcoded-hex "Restricted Mode" banner, which
  also violated the amber/ink token contract.
- **Missing slice-required coverage:** offline messaging. Guest surfaces render outside
  `WorkspaceLayout` and never get its WebSocket-derived `bl-conn-banner` (that store is
  scoped to the authenticated workspace socket). Added `lib/use-online-status.ts`
  (`navigator.onLine` + online/offline events) and reused the existing `.bl-conn-banner
  .offline` styling in both `AssetReview` and `GuestBoard`.

**Confirmed correct, not changed:** the guest re-anchoring restriction already in the
uncommitted diff (drag-to-move/resize an *existing* pin is blocked for guests via
`!guest` guards on the pointer-down handlers; placing a *new* draft pin/comment remains
allowed) matches the permission contract recorded in the 2026-09-08 cross-session audit
entry below - guest manual reanchoring stays member-only, and the frontend now matches
that instead of only relying on the backend's 401.

**Verification run:** `tsc -b --noEmit` (apps/web) passes with zero errors; `eslint` on
every touched/added file (`ReviewEntryPage.tsx`, `GuestBoard.tsx`, `AssetReview.tsx`,
`guest-session.ts`, `use-online-status.ts`) reports nothing; `vite build` succeeds with
only the pre-existing large-chunk warning. A scripted className scan confirmed every
`bl-`/`cp-`/`gate`-family class referenced by the three migrated files now has a
matching selector in `backline.css` (the only unmatched names are `ml-2`, a real
Tailwind utility class still active app-wide, and the fully inline-styled
`bl-asset-pin-resize-handle`/`bl-asset-pin-border`/`cp-body`, which never needed a CSS
rule). Not run: backend tests, live browser/guest-journey QA, and responsive/mobile
keyboard screenshot comparison - these need a running backend and were out of scope for
this pass.

**Left untouched:** `apps/web/src/features/integrations/IntegrationsPage.tsx` had an
unrelated uncommitted local modification (a `LoadingScreen`/`bl-settings-section`/
`var(--bl-error)` cleanup) present in the working tree that this session did not make.
It was excluded from this commit to preserve it as the existing, unrelated user change
it appears to be.

## 2026-09-08: Post-login UI migration — settings family slice

- Migrated `MembersPage`, `IntegrationsPage`, `SettingsPage`, `BillingPage`, `UsagePage`, `McpServerPage`, and `AccountModal` as a single unified settings-family system.
- Rebuilt all pages using the established Backline brand from `apps/web/src/styles/backline.css`. Implemented a consistent left-to-right information hierarchy (`<section className="bl-attention" style={{ display: "flex", gap: "40px" }}>`) with the section header pinned to the left and controls/information on the right.
- `MembersPage` uses `.bl-wrap`, `.bl-head`, `.bl-toolbar`, and `.bl-table`. Role updates and team invites use the standard inputs and `Dialog` respectively.
- `AccountModal` now uses the shared `Dialog` component instead of inline styles for its layout, mapping profile/preferences/sessions controls to a neat left-to-right flow with the user avatar locked to the left.
- `IntegrationsPage` preserves all OAuth and Webhook inputs but drops them into the left-to-right card layout with `.bl-button` and `.bl-input`.
- Billing, Usage, and MCP Server pages are honest and intentional: unavailable features look deliberately disabled rather than simulating backend success or fake AI metrics.
- Preserved React Router structure, React Query mutations/keys, components like `UpgradeToProModal`, authentication verification, and workspace state exactly as they were. No API contracts or backend logic were touched.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview, browser QA, and responsive screenshot comparison.

### 2026-09-08: Verification pass on the settings-family slice

- Audited the slice above against `backline.css` (every `bl-` classname and `var(--bl-*)`
  token used across all 7 files was checked against the stylesheet's actual selectors and
  the `:root` custom-property block, not assumed) and against each file's pre-migration
  version to confirm no functional/API regression. Found and fixed:
  - **Real bug:** `SettingsPage.tsx`'s workspace-rename success message used
    `var(--bl-mint-deep)`, which is not defined anywhere in `backline.css` (only the plain
    `--mint-deep` token and a `--bl-` alias set that excludes it exist) - the confirmation
    text would have rendered in an unstyled/inherited color instead of the intended mint.
    Changed to `var(--mint-deep)`.
  - **Dead imports left over from the restyle:** `Button` from `@backline/ui` was imported
    but no longer rendered (replaced by plain `.bl-button` elements) in `SettingsPage.tsx`,
    `MembersPage.tsx`, and `IntegrationsPage.tsx`; `IntegrationsPage.tsx` also still imported
    the now-unused `disconnectLogo` icon after the disconnect button was simplified to plain
    text. Removed all four unused imports.
  - **Missing states called for by the slice brief:** `MembersPage` had no empty state for a
    zero-result search (silently rendered an empty table) and no error state for the
    `listMembers` query; `IntegrationsPage` had no error state for the `listIntegrations`
    query (only mutation errors were surfaced). Added the established
    `.bl-empty`/`.bl-error` patterns already used by `ClientsPage`/`TicketsPage`
    (search-aware empty copy, `role="alert"` error text), matching existing conventions
    rather than inventing new ones.
- Confirmed as correct, not touched further: `BillingPage`, `UsagePage`, and
  `McpServerPage` are faithful 1:1 restyles of their prior Tailwind versions onto the `bl-`
  system with no content or behavior loss; `AccountModal`'s and `MembersPage`'s hand-rolled
  dialog markup was correctly replaced by the shared `Dialog` component; all mutations,
  query keys, and the honesty contract (no fake checkout/AI/connection success) were intact
  before this pass and remain intact.
- One pre-existing, harmless issue left as-is (not introduced by this slice, not worth the
  diff): `AccountModal.tsx` applies a `bl-form-field` class to two label wrappers that has
  never been defined in `backline.css` at any point in this repo's history; both wrappers
  already carry full inline flex styles, so this is dead markup with no visual effect.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview,
  browser QA, and responsive screenshot comparison. This was a source-level audit plus
  targeted fixes; visual/interaction verification of the fixes above is still required.

## 2026-09-08: Post-login UI migration — clients and activity slice (corrected)

- A prior uncommitted pass at this slice rewrote `ClientsPage`/`ActivityPage` onto
  classnames copied verbatim from `backline-Final Draft.html`'s own embedded
  stylesheet (`.wrap`, `.head`, `.toolbar`, `.search`, `.rows`, `.cl-row`, `.cl-head`,
  `.act`, `.act-day`, `.act-ic`, `.card-new`, `.sel`, `.kbd`, `.btn-new`, `.btn-solid`,
  `.btn-quiet`, `.modal-body`, `.modal-foot`, `.field`, `.req`, `.hint`, `.ghost-btn`,
  `.chipf`, `.top-right`, `.seg`, `.plus`). None of those selectors exist in
  `apps/web/src/styles/backline.css` — confirmed by grepping the stylesheet for every
  one of them — so both pages would have rendered with no brand styling at all
  (default block/inline layout, no ink/paper/mint treatment, no 3px geometry). This
  violated the base prompt's "follow the established Backline brand from
  apps/web/src/styles/backline.css" / "reuse existing … shared components" rule. This
  entry replaces that pass; the earlier log text above it is no longer accurate and is
  superseded by this one.
- Rebuilt `ClientsPage` on the real `bl-` design system already used by every other
  migrated route: `.bl-wrap`/`.bl-head`/`.bl-head-actions`, `.bl-toolbar.wrap` +
  `.bl-search` (the same label/icon-span/input markup `ProjectsPage` uses) with an
  Escape-to-clear key handler, `.bl-table`/`.bl-table-wrap` for the row list (the same
  primitive the pre-existing `ClientsPage` and `MembersPage` tables use), `.bl-avatar`
  + `.bl-text-button` for the client/contact lockup, `.bl-chip`/`.bl-chip-row` for the
  linked-project list capped at 3 with a "+N more" chip, `.bl-select` for the existing
  row-actions dropdown, and `.bl-empty` for the empty state. The add/edit dialog now
  uses `Dialog` + `.bl-compact-form`/`.bl-required`/`.bl-input` (the same field
  grouping `ProjectForm`/`ProjectMenu`'s rename dialog use) and the archive
  confirmation uses `.bl-dialog-intro` + `.bl-dialog-actions` with `.bl-quiet`
  (cancel) / `.bl-button danger` (confirm) — the same confirm-footer pattern
  `ProjectMenu`'s `ConfirmAction` uses — instead of an unstyled ad hoc footer.
- Rebuilt `ActivityPage` on `.bl-tabs` for the event-type filter (the same
  underline-tab component `ProjectsPage`'s type tabs use, not a bespoke `.seg`),
  `.bl-group-title` for day headers, and the pre-existing `.bl-activity` card/article
  list (already defined in `backline.css` for exactly this page). Added one
  genuinely new but on-brand touch: a per-event-category color (`EVENT_META`, a
  `Record` of `{icon, color}` keyed by the event-type prefix), the same "small local
  colour map applied via inline `style`" convention `PRIORITY_META`/`STATUS_META`
  already use in the comments panel, painted onto the existing `.bl-avatar` icon slot
  instead of introducing new circular icon CSS. Pagination uses the existing
  `.bl-pagination` component instead of one-off inline styles.
- No behavior/data-contract changes: client-side search against the loaded client
  array, the archive/create/update mutations and their query-key invalidation, and
  activity's offset/event-type/date-grouping query all match the pre-existing
  contracts exactly — only markup and class names changed.
- Also reverted one unrelated stray whitespace change (trailing spaces on a
  ` ```text ` fence line) in `docs/implementation/10-ui-migration-chat-prompts.md`
  left over from the same prior pass.
- Not run at the user's request: lint, typecheck, build, automated tests, local
  preview, browser interaction QA, keyboard journey QA, and responsive screenshot
  comparison. Every classname used was verified against `backline.css` by direct
  grep (not assumed), but the file has not been rendered in a browser in this pass —
  visual/responsive verification is still required before this is considered done.

## 2026-09-08: Post-login UI migration — workspace tickets slice

- Migrated `TicketsPage` and its component tree to the Final Draft's workflow surface,
  reusing the priority/status/due-date visual language the comments-panel slice already
  built (`PRIORITY_META`, `STATUS_META`, `dueMeta` in
  `features/projects/panel/comments/types.ts`) instead of a second copy, plus the
  shared `Dialog`, `Avatar`, `bl-comment-popover`/`bl-review-menu-row` popover pattern,
  and existing icon set.
- Added `TicketToolbar` (Sort / Group / "Show work for" popovers, replacing three plain
  `<select>`s) matching the root HTML's `tsortPop`/`tgrpPop`/`whoPop`; a new dense
  `TicketRow` list view (priority bar, single-line title/subtitle, status and priority
  quick-edit, tag filter chips, stacked assignee avatars, due badge) alongside the
  existing `StatusSelect`/priority-select/date-input inline editing so list mode kept
  every control table mode already had; and a `TicketTable` with sortable column
  headers (Project/Status/Priority/Due, driving the same `sort` URL param the toolbar
  does) and a click-to-filter project-name cell. Board and calendar cards gained a
  priority-colored edge, due badges, and stacked assignee avatars (board now takes a
  `members` prop); existing drag-to-change-status and drag-to-set-due-date persistence
  (already backed by the real `updateComment` mutation) were not touched.
- Added the header tab counts (Everyone/Assigned to me/Needs your reply/Waiting on
  client/Overdue) from the existing workspace dashboard summary query, a unified
  "Filtering by" active-filter chip row (status/project/priority/tag/assignee, each
  independently clearable), and empty-state "Show all tickets"/"New ticket" actions.
- `NewTicket` gained the due-date and tags fields `TicketCreate` already supports but
  the form omitted, using the same `DatePicker`/chip-toggle pattern as `TicketDetail`.
  A screenshot/attachment control is shown disabled with a "Coming soon" badge:
  `TicketCreate` has no attachment field, so this mirrors the root HTML's control
  without simulating an upload that would silently drop the file.
- Honesty decision, not a new product/interaction contract beyond TDR-0018/TDR-0019:
  the dashboard ticket-list API's `assignee` filter takes one value
  (`TicketFilters.assignee: str | None`), unlike the reference's in-memory multi-person
  filter, so "Show work for" is a single pick (selecting someone else replaces the
  previous selection) rather than a multi-select the backend cannot honor. No bulk
  ticket-selection UI was added — no bulk endpoint exists to back it.
- Existing React Router structure, all React Query keys/invalidation
  (`invalidateTicketsAndDashboard`), the `updateComment`/`createTicket`/`createReply`
  API calls, URL-encoded filters (search/status/project_id/priority/tag/view/sort/
  group/display/assignee/offset/ticket), and workspace authorization were preserved.
  No backend, database, generated API declaration, or widget file was changed.
- Not run at the user's request: lint, typecheck, build, automated tests, local
  preview, browser interaction QA, keyboard journey QA, and responsive screenshot
  comparison. The final diff was inspected for scope only; release verification,
  including confirming the new sortable-header/filter-cell/toolbar-popover markup
  compiles and renders correctly, remains required before this is considered done.

## 2026-09-08: Post-login UI migration — project side panel and comments slice

- Migrated `ProjectSidePanel` and its Comments/Details/Integrations/MCP/AI tabs off
  the pre-migration Tailwind theme onto the Final Draft `bl-` brand, reusing the
  vocabulary already shipped for `ShareProjectModal`, `TicketDetail`, and the review
  workspace toolbar rather than inventing a new one. TDR-0019 records the specific
  reuse, scope and behavior decisions.
- Rebuilt the `CommentsTab` tree (`StatusChips`, `FilterSortBar`, `ViewOptionsBar`,
  `CommentsList`, `CommentRow`, `comments/types.ts`): status label/color now come from
  `@backline/ui`'s shared workflow module instead of a second, drifting copy; added
  the previously-missing device-type and assignee filter sections; comment cards now
  show priority, due date (with overdue/due-today/due-tomorrow language), tags,
  assignee avatars, `@mention` highlighting, screenshot previews (and a capture-failed
  note), attachment chips, a layer badge (client-visible/team-only) on every row, and
  an anchor-recovery badge for orphaned/low-confidence comments. Loading uses real
  skeletons, and a dedicated error state with retry now exists (previously absent).
  Grouping by page resolves real page titles/URLs instead of a raw page id.
- Wired `CommentThreadPanel` into the Comments tab as an "open thread" action on every
  row (distinct from the row's existing click-to-navigate-to-pin behavior, which is
  preserved), and rebuilt it on the shared `Dialog` component with status, priority,
  tags, assignees, due date, and waiting-on/waiting-on-client editing - the same
  fields and components (`DatePicker`, `PeoplePicker`) `TicketDetail.tsx` already uses
  for the same underlying comment record. `BoardPage.tsx`'s existing usage is
  unchanged. Fixed a pre-existing bug where assignee/waiting-on ids were compared
  against the wrong member field (workspace membership id instead of user id),
  meaning a saved assignee could never show as selected again.
- Restyled `DetailsTab`, `IntegrationsTab`, `McpTab`, `AiTab`, `CollaboratorsModal`,
  `ProFeatureModal`, and `UpgradeToProModal` onto the same brand; `CollaboratorsModal`/
  `ProFeatureModal`/`UpgradeToProModal` now use the shared `Dialog` component (native
  modal semantics, focus containment/return, Escape) instead of hand-rolled overlay
  divs. MCP connectors, workspace-integration quick toggles, and BugHunt AI remain
  visibly static/gated - no fake connection, AI, or billing success was added.
- Existing React Query keys/invalidation, comment/reply/attachment API calls,
  workspace/member/share-link data, authorization boundaries, and the widget's
  `postMessage` pin-navigation contract were preserved. No backend, database,
  generated API declaration, or widget file was changed.
- Not run at the user's request: lint, typecheck, build, automated tests, local
  preview, browser interaction QA, keyboard journey QA, and responsive/mobile-sheet
  screenshot comparison. The final diff was inspected for scope; release verification
  is still required. One known pre-existing accessibility nesting concern was not
  changed in this pass: `CommentRow`'s clickable row (`role="button"`) still contains
  further interactive buttons (resolve/menu/reply), inherited from before this slice.

## 2026-09-08: Post-login UI migration — project review workspace slice

- Migrated `ProjectLayout` and the website `ProjectOverviewPage` to the Final Draft's
  focused review workspace: compact project/environment/URL header, URL-backed page,
  mode, viewport, orientation and zoom state, keyboard page-tab navigation, genuine
  open-review/share actions, safe-proxy browser frame, and a dense bottom status bar.
- Reworked the canvas around the existing private proxy and separately bundled widget.
  Loading, timeout/failure, no-link, snippet-only-link, cross-origin-page, archived,
  project-query and page/share-query states are explicit. No public proxy, layout mock,
  localStorage data, or simulated network success was added.
- Preserved widget-owned comment placement and navigation, and added a persistent
  selected comment row/status after the side panel asks the iframe to reveal its real
  pin. The panel launcher now uses the ink/paper/mint rail on desktop and a usable
  bottom launcher/sheet arrangement at narrow widths; the panel's full content
  migration remains Slice 04 scope.
- Rebuilt viewport and version controls with grouped responsive presets, bounded custom
  dimensions, real revision-history loading/empty/error/current states, and the shared
  React Query key factory. Browser emulation, deploy-triggered capture and alternate
  preview sources remain honestly unavailable rather than pretending to change server
  or widget behavior.
- Existing React Router structure, workspace authorization resolution, React Query API
  calls and cache updates, project/page/share dialogs, and website-versus-asset routing
  were retained. No backend, database, generated API declaration, or widget file was
  changed.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview,
  browser QA, responsive screenshot comparison, and end-to-end keyboard QA. The final
  source diff was inspected only; release verification remains required.

## 2026-09-08: Vercel frontend build regression fix

- Exported the shared `PlusIcon` and `SearchIcon` used by the committed projects
  dashboard. The exports had remained only in an unstaged local edit, so a clean
  Linux/Vercel checkout failed during `tsc -b` even though the Windows worktree had
  stale incremental output.
- Verified the pushed commit from a clean checkout with `pnpm --filter @backline/web
  build` (`tsc -b && vite build`); it passes with only the existing large-chunk warning.
- The local multi-service Vercel emulator completed the web service and then stopped at
  the unrelated backend service because `uv` is not installed in this environment.

## 2026-09-08: Post-login UI migration — project dialogs slice

- Migrated `ProjectForm` to the Final Draft's progressive create flow with the
  website/image/PDF chooser, honest roadmap types, client selection and inline client
  creation, domain-based environment detection with manual override, validated file
  selection and retry-safe uploads, and a real review-link success handoff.
- Rebuilt project settings around the five persisted review preferences. Device
  capture, reviewer resolution, and client-board controls retain their enforced
  behavior; deploy re-anchoring and client digest are explicitly marked `Saved only`
  because their execution paths are not connected yet.
- Migrated `ShareProjectModal` with real workspace members, owner/admin-only teammate
  invitation, clear workspace-versus-project access language, active-link loading/
  empty/error/copy states, enforced link-policy summaries, and genuine proxy-link
  creation. Link mutation beyond the existing create/revoke contracts remains routed
  to the share-link manager instead of being simulated in the modal.
- Migrated `ProjectMenu`, `ProjectPagesModal`, and the project lifecycle confirmations:
  icon-led keyboard-navigable actions; safe rename; archive/restore; duplicate; CSV
  export confirmation; responsive add/rename/reorder/remove page controls; and the
  owner/admin, archive-first, preview-and-name-confirmed permanent-delete contract.
  Deploy history and asset file management remain visible but disabled as coming soon.
- Existing React Query keys and invalidation, member/project/share/page/asset API calls,
  authorization boundaries, routes, and generated types were preserved. No backend,
  database, generated declaration, or widget files were changed.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview,
  browser interaction QA, keyboard journey QA, and responsive screenshot comparison.
  The final diff was inspected for scope and whitespace only; release verification is
  still required.

## 2026-09-08: Post-login UI migration — shell and dashboard slice

- Adopted the Final Draft's shared brand contract in TDR-0018 and added reusable,
  bounded prompts for continuing the migration route family by route family.
- Reworked the authenticated workspace shell with a persistent Backline lockup,
  global new-project entry point, platform-correct search shortcut, stable skip link,
  corrected URL-filter-aware navigation states, and a real off-canvas mobile drawer.
- Migrated the projects dashboard closer to the supplied HTML: prototype-style tabs,
  hatched section divider, refined waiting-on-you panel, deterministic website/image/
  PDF preview artwork, visible comment pins, card hover actions, URL/client hierarchy,
  improved list/table densities, and project-type-aware create cards.
- Existing React Query data, routes, mutations, authorization, and backend contracts
  remain unchanged. Dashboard card previews no longer iframe arbitrary third-party
  origins; real sites continue to render only in the dedicated project review flow.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview,
  browser interaction QA, and responsive screenshot comparison. This slice therefore
  records implementation scope, not release verification.

## 2026-09-07: Requested main update

- Merged origin/main at 11fea12 while preserving local commit a5233a5; conflict decisions are recorded in TDR-0016. The pre-existing untracked gcm-diagnose.log is untouched.
- Passed: frontend typechecks, web/widget production builds (large-chunk warning), workspace-scoping check, and 9 security/scoping regression tests.
- Outstanding incoming-code checks: frontend lint reports 13 errors and 1 warning; backend Ruff reports 4 line-length errors in auth/router.py and notifications/repository.py; mypy reports 3 errors in auth/repository.py, auth/router.py and dashboard/service.py. The combined frontend check stopped on lint, so production builds were run separately and passed.
- Persistence/session/digest integration tests were not run: isolated MongoDB, Redis and S3-compatible services were not provisioned or verified for this pull. No shared-service fixtures were executed.

Date: 2026-09-06. This file tracks actual work; specification text alone is not evidence of delivery.

## Sequence

1. **Source and plan:** preserve HTML, index controls/behaviors, document PRD/flows/frontend/backend/database and amend spec index.
2. **Workflow foundation:** statuses, tags, priority, multi-assignee and clearable dates; backward-compatible models; scoped repositories/indexes.
3. **Workspace operations:** clients, project associations/environments/archive/restore, ticket/dashboard/activity APIs.
4. **Dashboard frontend:** draft design, navigation, project views, client UI, workspace ticket views and metadata editing, activity.
5. **Asset and review extension:** private image/PDF projects, persistent region review, sharing/policy enhancements.
6. **Account/provider flows [COMPLETED]:** profile/preferences/security; genuine AI and billing when provider configuration is available.
7. **Verification:** generated contracts, lint/typecheck/build, meaningful backend privacy/filter/mutation tests, live browser journeys, doc/status reconciliation.

## Current evidence

- Original HTML copied without executing its scripts. Inventory records 112 element IDs, 76 static controls and 158 action attributes including generated markup.
- Inspected existing React router/layout/features, FastAPI module boundaries, Mongo indexes, permissions, comment mutations and test infrastructure.
- Existing `.env.production.example` and `DEPLOYMENT.md` user modifications were present before this work and must be preserved.
- Plans and flow matrix authored before implementation.
- Implemented: workflow fields and filters; clients; project metadata and archive/restore; workspace dashboard, tickets and activity APIs; the Final Draft dashboard shell and project/client/ticket/activity screens; image/PDF asset upload and region review; private signed asset URLs; generated OpenAPI contracts; and the Final Draft documentation set.
- 2026-09-07: added the first global-search slice: a permission-gated, workspace-scoped API for active projects, root comments/tickets, and workspace members; workspace shell search UI with `/`, Cmd/Ctrl+K, and Escape; generated OpenAPI contracts; and the workspace-isolation/empty-query regression coverage. Search uses the bounded strategy in TDR-0013. Exact placed-comment routing, grouping/ranking, client search, and provider-backed text search remain open audit work.
- Frontend verification: `pnpm turbo run lint typecheck build` completed with 9 successful tasks. Vite reports the expected large PDF worker/application chunk warning; the production build succeeds.
- Backend verification: `ruff check app`, `mypy app/`, and `scripts/check_workspace_scoping.py` pass. The focused application suite passes with `37 passed` using isolated MongoDB, Redis and S3-compatible test services. A complete run reached `186 passed`, then 7 realtime assertions and 4 fixture cleanup cases failed after the local `fakeredis` TCP emulator dropped pub/sub connections; the affected product modules were unchanged by this work.
- Source limitations recorded: the reference HTML was indexed without executing its mock scripts, and local browser policy prevented opening the copied `file://` reference for visual inspection. Product behavior was derived from its markup, labels, controls and action inventory, then implemented against the existing code architecture.

## 2026-09-08: Cross-session audit reconciliation

- A prior Claude review was reconciled with the current worktree. It identifies the next
  parity/UX verification targets as BoardPage URL state and deep links, guest-board
  frontend wiring, page add/reorder controls, hard-delete preview/confirmation UI,
  website-canvas comment move/resize, calendar drag/drop, website page tabs, status-label
  consistency, toast/confirm adoption, query-key consolidation, comment parent/reply
  normalization, debounced/scoped search, and the larger god-file/design-system/i18n
  cleanup items. These are audit targets, not claims that each item is complete or safe
  to implement without checking the current code and product decisions.
- The review confirms that guest manual reanchoring remains member-only under the existing
  permission matrix. Guest drag/resize affordances must therefore be hidden or disabled,
  and the 401 behavior should remain covered by a regression test; no guest privilege is
  inferred from the frontend review UI.
- Verification limits remain important: local emulator-backed checks are not production
  health evidence, and shared or cloud database fixtures must not be used. No credentials
  or connection strings from cross-session chat notes are recorded in this repository.

## 2026-09-08: God-file split handoff

- The cross-session audit work split the large frontend/widget files while preserving
  their existing public import paths and behavior: `TicketsPage`, `CommentsTab`, and
  `BoardPage` now delegate to feature-local components, and the widget `index.ts`/`ui.ts`
  logic is split into focused modules under `apps/widget/src`.
- FE-01/FE-02 query-key and comment-cache consolidation is included in the same working
  tree. The i18n rollout remains intentionally deferred; no completion is claimed for
  FE-07/FE-08 styling/icon cleanup beyond the work explicitly present in this batch.
- The handoff notes identified duplicate implementations across concurrent sessions;
  this delivery snapshot reconciles the current worktree versions before publication.
- This synchronization turn intentionally did not rerun tests or builds at the user's
  request. Earlier session-reported checks remain historical evidence and should be
  revalidated before the next release.

## 2026-09-07 — audit batch 02 (M-03, M-07)

- **Delivered:** replaced the direct project-document hard-delete with owner/admin-only
  preview and confirmation contracts. The preview enumerates the workspace-scoped graph
  and private object keys, reports counts and creates a one-hour plan. Confirmation
  requires the same actor, exact project name, explicit acknowledgement, an archived
  project and an unchanged graph. It locks the project, creates durable object
  tombstones, completes R2/MinIO cleanup, deletes Mongo dependencies in order and emits
  one correlation-ID summary event. Normal UI deletion remains recoverable archiving.
- **Delivered:** page deletion now refuses pages referenced by comments, revisions,
  revision diffs or project assets and returns the reference counts; deleting an empty
  page emits `page.deleted`.
- **Delivered:** additive named indexes for notification unread lookup, share-link
  project listing, normalized page URLs, revision current/history reads, recovery
  history, refresh-token families, event feeds and active OTP lookup. Authorized guest
  HTTP/WebSocket activity now refreshes `last_seen_at`; the existing 180-day TTL remains.
  The migration is dry-run by default and never drops or renames an index.
- **Evidence:**
  `docs/implementation/evidence/audit-batch-02-index-explain.json` seeds 2,500 documents
  per collection. All 11 representative queries move from `COLLSCAN` (2,500 examined)
  to plans containing `IXSCAN` (one document examined; one key except OTP at two). It
  also records the 15,552,000-second guest TTL and that no existing index was dropped.
- **Verification passed:** focused backend integration suite `38 passed`; full backend
  suite `219 passed, 1 failed`, with the sole failure an out-of-scope stale M-04 project
  settings assertion (`test_projects.py::test_create_and_list_projects`). Workspace
  scoping check passed; touched Python files pass Ruff; focused mypy passes. Generated
  OpenAPI JSON/TypeScript are reproducible. Touched frontend files pass ESLint, web
  typecheck passes and the production web build succeeds.
- **Baseline checks still red outside this batch:** full `mypy app/` has the existing
  `auth/repository.py:137` aggregate-pipeline type error; full web lint has 13 existing
  errors plus one warning in unrelated UI files; the monorepo lint/typecheck/build run
  stops on that lint task. These were not changed because this batch is limited to
  M-03/M-07.
- **Traceability:** FD-AUD-022 is partial overall (safe delete delivered; duplicate and
  export are separate M-13 scope). FD-AUD-048 is partial overall (safe page/revision/
  recovery retention delivered; deploy/version product UI remains separate). The
  M-03/M-07 portion of FD-AUD-051 is delivered with migration, TTL/GC and explain
  evidence. Detailed file/change/risk evidence is in
  `docs/implementation/audit-batch-02-report.md`.

## 2026-09-07: Login outage from comment request index

- Fixed the Railway startup E11000 reported in the supplied logs: the compound
  sparse unique index included legacy comments with missing/null request IDs.
  Startup now creates a uniquely named partial index for string request IDs only.
  Existing comments and indexes are preserved; workspace-scoped uniqueness remains.
- Added a dry-run-first inspection/apply command in
  `backend/scripts/migrate_comment_request_index.py`; see TDR-0017 for rollout and
  the limitation of installations that still retain the old sparse index.
- Passed: 15 focused tests covering real MongoDB startup with legacy records,
  repeated lifespan/preflight requests, scoped uniqueness, existing-index coexistence,
  Google login persistence/rejection, and security. Tests used isolated local MongoDB
  on 27027, Redis emulator on 6389 and S3 emulator on 9010; no production fixtures.
  The initial test attempt hit local S3 region configuration; setting the emulator
  region to us-east-1 resolved it.
- Passed: Ruff and mypy on changed Python files; workspace-scoping check; six
  frontend typecheck/build tasks (cached, existing large-chunk warning).
- Production rollout/health and an interactive fresh Google sign-in remain to be
  confirmed. No OAuth callback code from the report was replayed.
- Hotfix `7191804` was pushed to GitHub `main` from an isolated worktree based on
  `11fea12`; the same 15 tests passed on that exact deployment branch. Unpublished
  local account/session changes were preserved locally and excluded from the push.
  Direct production health requests timed out from this machine, and Railway CLI
  access was unavailable, so deployment success is not claimed.

## External dependencies and unresolved product decisions

AI provider authorization/configuration; billing provider/prices/webhook credentials; verified guest domain restrictions; real email delivery credentials; password/2FA/SSO policy. Core local implementation can proceed independently. The HTML's simulated accounts, fake 2FA QR, in-memory credits and checkout toasts must never be copied as working product behavior.

## Verification commands

`pnpm turbo run lint typecheck build`; backend `ruff check`, `mypy app/`, `pytest`, `scripts/check_workspace_scoping.py`; regenerate `packages/types` from locally exported FastAPI OpenAPI without requiring a production server. Integration tests require isolated MongoDB, Redis and S3-compatible storage. Record unavailable infrastructure honestly; never substitute test counts from the historical README.

## 2026-09-09: Slice 12 verification pass (M-21, M-22, FD-AUD-043/044/054)

- **M-21 (CI, OpenAPI drift, migrations, docs/TDR reconciliation)**:
  - Regenerated `packages/types/openapi.json` with the locked backend environment and
    `packages/types/src/openapi.ts` with `openapi-typescript`; a second run produced the
    same SHA-256 hashes. Added CI drift gates for both artifacts.
  - Re-ran `backend/scripts/check_workspace_scoping.py` from the same `backend/`
    working directory used by CI: passed across 17 repository files. The checked-in
    CI/test paths were already correct, so no path-only edit was fabricated.
  - Reconciled the actual stale specifications: Review SDK share-link auth
    (`07-Review-SDK.md`), URL-owned board/filter state (`14-State-Management.md` and
    `16-Dashboard.md`), and structural diff vs anchor matching
    (`10-Revision-Recovery.md`). The R2 UUID layout was already current in
    `18-Storage-Deployment.md`.

- **M-22 (Product decisions and low-risk parity polish)**:
  - TDR-0020 records the real desktop decision: keep the signed-in dashboard responsive
    below 1024px; do not conflate this with the unbuilt Web App/Mobile App project types.
  - `ProjectForm` no longer lets users change the inert `reanchor_on_deploy` and
    `client_digest_enabled` fields. It reports automatic recovery as always on and the
    client digest as unavailable while retaining legacy API readability.
  - Corrected generic coming-soon copy so it does not claim that image/PDF review is
    unavailable or promise a notification signup that does not exist; the legacy
    `/image-pdf` route now redirects to the real image/PDF-capable project list.

- **FD-AUD-043 (AI actions)** and **FD-AUD-044 (Plans and checkout)**:
  - Removed the simulated AI paywall/pricing route and fabricated zero-run/token metrics.
  - Removed simulated prices, seat totals, plan benefits and upgrade action. The UI now
    states that no provider, usage ledger, entitlements, checkout or charges exist.

- **FD-AUD-054 (Documentation reconciliation)**:
  - Updated the flow matrix, this delivery ledger, affected specs, TDR-0020 and the
    Batch 12 report with evidence/status that distinguishes delivered behavior from
    compatibility fields and placeholders.

Verification on the final working tree: `pnpm turbo run lint typecheck build` passed
(9/9 tasks; web build 591 modules; existing >500 kB chunk warning), backend `ruff check
.` and `ruff format --check .` passed (189 files), strict `mypy app/ scripts/` passed
(153 files), and workspace-scoping lint passed (17 repository files). No test suite,
browser/E2E/axe run, database migration, or production deployment is claimed.
