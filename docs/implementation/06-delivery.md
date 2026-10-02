# Delivery and verification ledger

## 2026-10-02: Member-bound canvas sessions (TDR-0057)

This closes TDR-0056's known limit: a viewer could copy the review link out of the canvas
and comment as a guest. Reasoning is in TDR-0057.

**Built:**
- **Canvas link.** Each project gets one system-managed canvas link, made on first use.
  It's never listed with client links and can't be revoked.
- **Canvas sessions.** `POST /projects/{id}/canvas-session` issues a guest token bound to
  the member, and the dashboard hands it to the widget. `POST /guest-sessions` refuses
  canvas links.
- **Live role checks.** Every guest-capable path checks a member-bound session against the
  member's current project role, and the realtime socket checks it on connect.
- **Client links** are listed to commenters and up (`share_link:view`). "Open review" is
  hidden for viewers.
- **Session sync and cloud login** target the canvas link.
- **Copied canvas links.** The review entry page and the widget explain that a canvas link
  only opens inside the dashboard.

**Verification:**
- **Backend.** 274 passed on local MongoDB and real Redis. Ruff, mypy (strict) and the
  scoping lint pass. `packages/types` was regenerated.
- **Scratch API checks.** 7 of 7 pass: the 5 TDR-0056 scenarios plus 2 new ones.
  - Canvas sessions: shared link, reused session, viewer read-only, commenter posts and
    replies, demotion and removal take effect at once, forged and copied tokens refused,
    the canvas link is unlisted and unrevokable, client guests unaffected.
  - Session sync lands on the canvas link.
- **`apps/web` and `apps/widget`.** Typecheck, lint and build pass.
- **Browser pass**, real API on local MongoDB and real Redis:
  - Canvas: 30 of 30. The canvas loads from the canvas link, not a client link. A viewer
    can't post through the API with their canvas session, and the copied token makes no
    guest session. The canvas URL opened alone asks for no name and explains why. The
    entry page explains a canvas link. An editor comments.
  - Live updates: a new pin reaches a viewer's open canvas live (~1.5s), and the access
    changes from TDR-0056 still pass.

**Open:**
- Canvas comments are still guest comments. Attributing them to the member is possible now
  that the session records the member, but isn't done.

## 2026-10-02: Project roles, org chart and room codes (TDR-0056)

Branch `feature/room-code-org-chart`, with `main` (TDR-0055) merged in. Reasoning is in
TDR-0056.

**Built:**
- **Project roles** (viewer, commenter, editor, manager) and private projects, enforced in:
  - every project, page, comment and share-link route;
  - tickets, search, activity, dashboard counts and client stats;
  - MCP, the email digest, notifications and realtime.
- **Team page** with four tabs:
  - People: filters and CSV export;
  - Org chart: pan and zoom, search and fly-to, project lens, drag to set reporting
    lines with Undo, collapse, minimap, full screen, keyboard navigation, dark mode;
  - Access: an editable role matrix;
  - Requests.
- Person drawer, profile dialog, leave workspace, transfer ownership.
- **Room codes:** generated or custom codes, a Join page with preview and `/join?code=`
  links, approval with a role, notes, withdraw, cooldown and seat limits.
- **Share dialogs** show who has access and let managers edit it. The create-project
  form gets an access step. Controls are gated by project role across the project menu,
  comment drawer, board and cards.

**Fixed from the branch:**
- membership ids being compared against user ids;
- members locked out of legacy projects;
- instant join bypassing the seat limit;
- members shown an invite form the API refuses;
- duplicate not copying the cross-browser render and Slack settings;
- N+1 queries when listing members and workspaces.

**Follow-up the same day:**
- **Viewer canvas.** The widget gains a `view` mode. Pins and their cards work, but no
  click or drag opens a composer.
  - For a project viewer the dashboard swaps Comment and Draw for "View comments". The
    dock's tools, the C and D shortcuts, `?mode=draw` and Browser review follow suit.
  - The canvas status menu now needs an editor on the project, not just any member,
    matching `comment:update_status`.
- **E2E login helper.** `loginViaOtp` predated TDR-0053's password-first login page. It
  now goes through "Forgot password?" and skips the set-password step, so every spec
  that signs in works again.
- **Stale backend tests.**
  - The four proxy tests mock the upstream at the transport and stub the DNS-resolving
    SSRF check.
  - The Jira rotation test uses `IntegrationContext`.
- **Project card favicons** are requested from the project's full origin. Before, a
  site on http or on a non-default port asked `https://host/` instead.

**Verification:**
- **Backend.**
  - On a real Redis (5.0, local): 269 passed, and the six pub/sub tests that only failed
    on fakeredis pass. The 5 remaining failures were the stale proxy and Jira tests;
    after fixing them, `test_proxy.py` passes 8/8 and `test_integrations.py` 25/25.
  - Ruff, mypy (strict) and the scoping lint pass.
- **Scratch checks.** 5 RBAC scenarios pass: access end to end, room codes, org chart
  with transfer and leave, the realtime filter, and MCP plus the digest.
- **`apps/web` and `apps/widget`.** Typecheck, lint and build pass.
- **E2E.** `workspace-join.spec.ts` passes against a live local stack: real API,
  MongoDB replica set, Vite and Playwright.
- **Migration.** `scripts/migrate_org_access.py` was run on seeded legacy rows:
  - the dry run wrote nothing;
  - `--apply` backfilled 2 events, normalized a room code and dropped
    `assigned_member_ids`;
  - it left a colliding pair of codes untouched and listed them;
  - a second run found nothing new.
- **Browser passes**, real API on local MongoDB and real Redis:
  - Team pages: 39 of 39, in light and dark.
  - Live access changes: a project appears and disappears on a member's open dashboard
    within ~350ms. After removal, their socket gets nothing about it while a member
    still on it does.
  - Review canvas: 21 of 21. A viewer sees pins and cards, gets no composer, Draw, status
    menu or Browser review, and can still browse. An editor comments and gets the status
    menu.

**Open:**
- Run `scripts/migrate_org_access.py` as a dry run, then `--apply`, on each environment.
- The canvas widget runs as a guest of the review link. Anyone holding that link, a
  viewer included, can open it outside the dashboard and comment as a guest, as any
  client can. Closed by TDR-0057 (member-bound canvas sessions, entry above).


## 2026-10-01: Dashboard sidebar groups, AI page and API keys (TDR-0055)

The user asked for `feature/dashboard-sidebar-updates` to be reviewed, fixed and
improved, then opened as a PR to `main`. The reasoning is in TDR-0055.

**Fixed:**
- **Rail.**
  - Members, AI usage, Billing, Settings and MCP server are reachable from the rail
    again, in new Tools and Workspace groups.
  - Only the current link has `aria-current="page"`. Before, all ticket views were
    marked, and "Projects" was marked on every page.
  - Groups remember whether they are open and open when you land on one of their
    pages. Collapsed links leave the tab order.
  - Toggles have `aria-controls`, and their chevrons point the right way.
- **AI page.**
  - Shows real credits, plan and reset date, and this month's count per feature.
  - Says whether AI is ready, paused or not connected.
  - The server `GROQ_MODEL` detail is gone.
  - The "where to find it" copy matches the real buttons.
- **API keys page.**
  - Lists API keys and MCP tokens together and revokes either kind.
  - No longer claims that API keys authenticate MCP.
  - Shows a copyable `curl` check.
  - Uses the shared classes, with no inline styles.
- **Icons.** The Integrations, Extensions, AI and Key icons are redrawn.
- **Tickets.** An unknown `?status=` no longer renders a blank filter chip with no React
  key.
- **Tests.** `journey-9` visits `/extensions`.

**Verification:**
- **`apps/web`.** `pnpm typecheck`, `pnpm lint` and `pnpm build` pass.
- **e2e specs.** `navigation-titles-routes.spec.ts` and `journey-9` compile and list
  under `playwright test --list`. They were not run: there is no local MongoDB or
  Redis.
- **Browser pass.** The real FastAPI app ran on mongomock/fakeredis with Vite and
  Playwright at 1440×1000 (light and dark) and 390×844. 39 of 40 checks passed. The
  40th, the desktop console check, flagged only the `ERR_ABORTED` noted under Console
  below. The checks covered:
  - one `aria-current` on each of 11 routes;
  - Tools collapses, stays collapsed after a reload and reopens on `/keys`;
  - `/extension` redirects to `/extensions`;
  - the AI chip, meter and three feature cards render, with no `GROQ_MODEL`;
  - an API key can be created, copied, used as a Bearer token on `whoami` (200) and
    revoked (then 401);
  - an MCP token made on `/mcp` is listed and revoked;
  - no horizontal overflow on a phone, and the drawer closes after navigating.
- **Console.** No errors apart from two known messages:
  - React Router's v7 future-flag warnings, which appear in dev only;
  - Chromium's `ERR_ABORTED` on 204 DELETE responses, which the unchanged Browser
    Extension page also shows.

## 2026-09-30: Page-by-page fix sweep (TDR-0053)

The user asked for the rest of the code to be fixed page by page, across UI, backend
and database, on the billing branch. The backend suite ran on a real MongoDB 7.0
replica set for the first time, from a scratch directory, so the repo's `.env` with its
live keys was never loaded. Reasoning is in TDR-0053.

**Fixed:**
- **Accounts.**
  - Sign-in emails are case-insensitive, so an invite with capitals no longer splits
    into a second account at Google or code sign-in.
  - "Set a password" needs a code sign-in from the last 15 minutes.
  - `/login` with a live session opens the app.
- **Plan limits.** The seeded "Example Project" no longer takes one of Free's two
  project slots.
- **AI Usage** is real: this month's credits against the plan, and breakdowns by
  feature, member, day and month (new `GET .../billing/ai-usage`). AI actions that hit
  the limit now say so.
- **Access.**
  - A changed or removed role reopens the workspace or routes to the picker, instead
    of failing every request.
  - ClickUp, Jira and Asana OAuth connect again: the callback waits for the session and
    switches workspace first, and all refreshes share one request.
  - Guest passcodes allow 25 wrong tries per link per 15 minutes.
- **Links and pages.**
  - Search, asset review and dashboard ticket links open the ticket.
  - Stale ticket page offsets clamp to the last page.
  - Blank workspace, comment, token and label names are rejected.
  - The filter boxes don't flood browser history.
  - Clients export moved to the header, and its archived toggle is in the URL.
  - Activity rows show their dates.
  - Settings is read-only for members, without the fake upload text.
  - Members, extension-token and MCP errors are shown, and revoking a token asks first.
  - CSV formula guards cover a leading tab or carriage return.

**Database:** additive fields `refresh_tokens.auth_method/authenticated_at`,
`projects.is_sample` and `ai_usage.user_id`. There are no new indexes. Two dry-run-first
scripts come with it:
- `migrate_lowercase_user_emails.py` reports case-only duplicates and never merges them;
- `migrate_mark_sample_projects.py`.

**Verification:**
- Backend `ruff`, format, `mypy` (205 files) and the scoping check pass.
- Backend suite: 270 passed, 11 failed. All 11 predate this work:
  - 6 are pub/sub tests the fake Redis can't deliver;
  - 5 are stale proxy and Jira tests (see TDR-0053).
- Scratch checks covered the auth, limit, usage and passcode changes, and both
  migrations.
- `pnpm turbo run lint typecheck build --force`: 12/12.

**Not verified:** a browser pass of the new AI Usage page, and live OAuth apps.

**Open:**
- Whether to enforce the pricing table's integration, cloud-login and MCP rows.
- Updating the 5 stale tests.

## 2026-09-30: Billing plans, Stripe, Razorpay/UPI and plan limits (TDR-0052)

The user asked for the billing branch's first cut to be verified against
`docs/BILLING_BRANCH_OVERVIEW.md`, then fixed, optimized and pushed. That first cut was
filed as TDR-0048; `main` has since used both 0048 and 0051, so this is TDR-0052.
`main` was merged in first, and again after PR #45 (route titles), whose
`[workspace, "Billing"]` page-title convention the billing page now follows. The
reasoning is in TDR-0052.

**Fixed:**
- **Free upgrades.**
  - Webhooks now check their Stripe/Razorpay signatures; Stripe's also has a 5-minute
    replay window.
  - Confirming a payment now activates only what a server-side checkout record says.
    Stripe sessions are re-read from Stripe, and Razorpay signatures are checked.
  - The sandbox is refused in production.
- **One payment, one invoice.** Activation is exactly-once across the browser confirm
  and webhooks. Invoice numbers come from a service-wide counter, so they no longer
  collide across workspaces.
- **Real gateway flows.** Razorpay Checkout (UPI QR/ID, RuPay, netbanking) and Stripe's
  return confirm both work. The fake card and UPI inputs, fake card digits and fake
  storage figure are gone.
- **Expiry.** Paid plans are prepaid and lapse to Free when their period ends.
  Renewing the same plan extends it.
- **Limits.**
  - Plans now match the spec.
  - AI credits are metered (one per Groq call, reset monthly) and enforced.
  - Restoring an archived project counts against the project limit.
  - A refused invite no longer creates a user.
  - Upgrade prompts key off `PLAN_LIMIT_EXCEEDED`, not the word "limit".
- **UI.**
  - The billing page, checkout, banner, comparison table and invoices were rebuilt on
    the app's own classes and tokens, so light/dark and phone width work.
  - The table's `<div>` inside `<tbody>` is gone.
  - Only owners see plan actions.
  - Features the product doesn't have yet are marked "Coming soon".

**Verification:**
- `ruff`, `ruff format --check`, `mypy` (201 files) and the workspace-scoping check pass.
- `pytest tests/test_billing.py tests/test_permissions.py`: 11 passed.
- Scratch backend pass on mongomock/fakeredis: 41/41 checks. It runs the transaction
  callback directly, because mongomock has no sessions.
- Headless browser pass in light, dark and at 390px: test-mode upgrade, invoice,
  deep link and URL filters. No console errors beyond React Router's existing notice.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

**Not verified:**
- Live Stripe/Razorpay keys.
- The rewritten billing e2e specs; they need the full stack.

**Open:**
- Taxes and receipt legal details are undecided.
- The comparison table's integration, cloud-login and MCP rows aren't enforced.

## 2026-09-30: Contextual page titles and project sub-route navigation (TDR-0051)

The user asked for the first commit on `feature/standardize-routes-titles-navigation`
to be verified against the requested changes, fixed and optimized. That commit's
`BRANCH_CHANGELOG.md` lists the requested changes. `origin/main` was merged in first
(6 commits, no conflicts). Reasoning is in TDR-0051.

**Delivered:**
- **Browser tab titles.**
  - Workspace pages read `{workspace} · {page} — Backline`.
  - Project pages read `{project} · Review`, `· Board` or `· Share Links`.
  - The guest review reads `{project} · Review`.
  - Sign-in, the sign-in and OAuth callbacks, and the 404 page have their own titles.
  - The canvas, board, guest review, 404 and callbacks had no title before.
- **Navigation between a project's pages.**
  - The board has a "← Back to {project}" link.
  - The share-links back link names the project.
  - The project ⋯ menu has "Manage share links" and "Ticket board".
  - The canvas Details tab has "Open board →" and "Share links →".

**Fixed in review of the first commit:**
- **TDR number.** The TDR was 0048, which `main` already uses, so it is now 0051. 0050
  is the open illustrations branch's number.
- **Sign-in title.** It read "Sign in to Backline — Backline" and now reads
  "Sign in — Backline".
- **Project query.** The same project query was declared in three pages. It is now one
  `useProject` hook.
- **Inline styles.** The board back link and the Details-tab links used inline styles.
  They now use a shared `.bl-back-link` class and Tailwind utilities.
- **Long project names.** The back link now ends a long name in an ellipsis. Before, it
  could widen the page on a phone.
- **Board header props.** The props are required; their optional-prop guard was dead.
- **Menu order.** "Manage share links" moved beside "Copy review link".

**Changed files:**
- `apps/web/src/lib/use-document-title.ts` and 19 of the 20 page components that call it
  (the workspace picker is unchanged).
- `features/projects/use-project.ts` (new).
- `features/board/components/BoardHeader.tsx`, `features/projects/ProjectMenu.tsx` and
  `features/projects/panel/DetailsTab.tsx`.
- `styles/backline.css`: one rule, `.bl-back-link`.
- No backend, contract or route change.

**Verification:**
- `pnpm turbo run lint typecheck build --force`: 12/12 passed with zero lint warnings.
- The existing `apps/e2e/tests/navigation-titles-routes.spec.ts` typechecks under
  `tsc --strict`, and `playwright test --list` lists its test.

**Not verified:** the Playwright suite was not run (no local MongoDB/Redis), nor was a
browser pass or a deployed stack checked. No test suite was written, per this
repository's Claude Code instruction.

**Resynced with `main` for a manual merge (same day).** GitHub reported the branch
could not merge automatically after PRs #43 and #44 (TDR-0050, illustrations) landed.
`origin/main` was merged in again, and three conflicts were resolved:
- `NotFoundPage.tsx` keeps both the `LostPinArt` import and the title import.
- `UsagePage.tsx` keeps `UsageChartArt` and the title and workspace imports. `ChartIcon`
  is dropped because `main` had replaced it.
- This ledger keeps both entries, newest first.

Lint, typecheck and build were re-run on the merged result.

**Open:** `BRANCH_CHANGELOG.md` sits at the repo root. This ledger and TDR-0051 record
the same changes, so it can be dropped before merging to `main`.

## 2026-09-29: Illustrations and interaction audit (TDR-0050)

The user asked for the pending findings from TDR-0049 to be finished. They had also
originally asked for custom SVG artwork and animation. The work is on a new branch from
`main` (PR #42 had merged). Reasoning is in TDR-0050.

**Delivered:**
- **Project card artwork** (`ProjectArtwork.tsx`):
  - a schematic page in three layouts, with the site's favicon in its header;
  - real pins, one per open comment (up to three, then "+N"), or a check when all are
    closed;
  - pins drop in on load and lift and pulse on hover;
  - dark-mode palettes, so there is no white slab;
  - the label reads just "Website", "Images" or "PDF".
- **Illustrations** (`components/illustrations.tsx`):
  - eight empty-state scenes (tickets, clients, projects, activity, members, share
    links, guest board, and "no matches");
  - a 404 lost-pin scene, a growing chart for AI Usage, an invoice with a "SOON" stamp
    for Billing, and a pinging brand mark for the loading screen.
  - Colors are theme tokens only, and every animation settles to a complete still frame
    under reduced motion.
- **In-page loaders.** Seven pages used the full-viewport loader inside their content;
  they now use `LoadingScreen inline`.
- **Tickets empty state:**
  - the message depends on whether filters are on, a tab is empty, or there are no
    tickets at all;
  - "Show all tickets" on an empty tab used to do nothing, and now switches to
    Everyone.
- **Activity:**
  - rows read as sentences with the object named, and the ticket's `#N` plus its first
    line;
  - "Open comment" when the row links to a thread.
  - Backend: additive `ticket_number` and `comment_excerpt` on `ActivityOut`, from one
    workspace-scoped bulk read (`CommentRepository.find_many_in_workspace`). OpenAPI and
    `packages/types` were regenerated.
- **Interaction fixes:**
  - The New ticket and Account dialog intros were half hidden under the sticky header.
  - Ticket detail priority showed raw values ("high").
  - The search box had a double focus ring.
  - Team-ticket search results said "Project tickets"; they now say "Team ticket"
    (backend).
  - "Mark all read" showed with nothing unread.
  - In the mobile drawer, the close button covered the workspace chevron.
- **Canvas shortcuts.** "?" opens the shortcuts list, and arrow keys show as ← →.
- **Follow-up fixes (same day, user-requested):**
  - **Activity links.** A link into an archived project now goes to the Archived list
    ("Project archived →"), since archived projects can't be opened. A deleted project
    shows "Project deleted" with no link.
  - **Search ignores the hidden "Project tickets" page title.** Global search and the
    Tickets search no longer match it, via one shared `page_title_match` in
    `dashboard/repository.py`. Harness check: "tickets" went from every team ticket to
    0 results, while "Hero" and "Acme" still match. Backend `ruff`, `mypy` and the
    scoping check passed, as did web `tsc` and `eslint`.

**Verification:**
- `pnpm turbo run lint typecheck build --force`: 12/12 passed with zero lint warnings,
  production builds included.
- Backend: `ruff check .`, `ruff format --check .` (233 files), strict
  `mypy app/ scripts/` (193 files) and `scripts/check_workspace_scoping.py` passed.
- OpenAPI re-exported; the `packages/types` diff is additive only (two optional fields).
- Scratch browser pass: the real API on `mongomock-motor` and `fakeredis`, with a
  `$toObjectId` shim added for global search.
  - Every illustration was captured in light and dark after animations settled, as was
    the loading screen mid-load.
  - 16 dialogs, popovers and drawers were opened in both themes.
  - Activity, search, bell and drawer were re-checked after the fixes.
  - No console errors other than unresolvable demo hosts and the canvas preview frame.

**Not verified:** the pytest suite and Playwright journeys (no local MongoDB/Redis). No
test suite was written, per this repository's Claude Code instruction.

## 2026-09-29: Whole-app polish pass (TDR-0049)

The user asked for open-ended improvement of the app and for bugs across the site to be
found and fixed. Every workspace route was rendered in headless Chromium against the
real API on in-memory fakes, at desktop and phone widths, in both themes. Each finding
was traced to source. The branch was first fast-forwarded to `origin/main` (15 commits,
no conflicts). Reasoning is in TDR-0049.

**Fixed:**
- **Canvas opened on a hidden page.** The project canvas could open on the hidden
  "Project tickets" page and show "outside the project URL". That page is no longer
  listed as a site page, whether on the canvas, in page management or in the New Ticket
  picker. It can't be renamed, and reorder ignores it.
- **Errors.**
  - Client errors (4xx) are no longer retried, so they appear immediately instead of
    after about 3s of "Loading…".
  - FastAPI validation errors and HTTP/2 responses with no status text now produce
    readable messages instead of "Unprocessable Entity" or a blank one.
  - Network failures read as such instead of "Failed to fetch".
- **Stale Tickets links.** Unknown values in the Tickets URL are ignored instead of
  failing the list with a 422.
- **Settings-style cards.** Settings, Billing, Share links and Extension lost the ~200px
  empty header band and are two-column again. AI Usage's placeholder, which was
  scattered across three columns, is a single centered column.
- **Every page.** The stray focus ring (a green line under the content) and the
  top-left shadow smudge are gone.
- **Phones.**
  - The Tickets table scrolls inside itself instead of scrolling the page sideways.
  - Ticket rows use two lines.
  - Filter tabs scroll sideways instead of wrapping.
  - The "New project" button shows its icon.
  - Row delete buttons show on touch screens.
- **Avatars.** Initials inside settings cards are legible again.
- **Clients.**
  - Names are left-aligned.
  - "New project" opens the project form with the client preselected (it was a
    "not wired up" toast).

**Changed files:**
- `backend/app/modules/pages/service.py` (no schema, index or contract change);
- `apps/web/src/lib/api-client.ts`, `app/providers.tsx`;
- `features/tickets/{use-tickets.ts,TicketsPage.tsx,components/TicketTable.tsx}`;
- `features/clients/ClientsPage.tsx`, `features/projects/ProjectForm.tsx`,
  `features/workspaces/UsagePage.tsx`;
- `styles/backline.css` (a labelled block at the end, plus five in-place fixes).

**Verification:**
- `pnpm turbo run lint typecheck build --force`: 12/12 passed with zero lint warnings.
- Backend: `ruff check .`, `ruff format --check .` (233 files), strict
  `mypy app/ scripts/` (193 files) and `scripts/check_workspace_scoping.py` passed.
- Scratch browser pass (not checked in):
  - Setup: the real app on `mongomock-motor` and `fakeredis`, with shims for mongomock's
    `$not`-array and `$lookup`-with-`let` gaps, seeded with 4 members, 4 projects (one
    archived), 14 tickets, 2 clients and a share link.
  - Coverage: 20 routes × 2 widths × 2 themes, 80 captures.
  - Horizontal overflow: none after the fixes. It had been on the mobile Tickets table.
  - Console errors: none other than unresolvable demo hosts and the canvas frame, whose
    preview domain doesn't resolve locally.
  - Tickets with `?view=board&status=bogus`: the full list of 14 tickets with
    "Everyone" selected and no error.
  - Settings avatar initial computed as white.
  - Clients → "New project" reached the details step with "Globex" preselected.

**Not verified:** the pytest suite and Playwright journeys (no local MongoDB/Redis), and
a deployed stack. No test suite was written, per this repository's Claude Code
instruction.

**Open:**
- Project card previews stay light in dark mode and carry a "website · illustration"
  label, which needs a design pass.
- Custom illustrations for empty and "coming soon" states were not started.

## 2026-09-29: Seamless commenting on the review canvas (TDR-0047)

The user asked for the project editor page, where comments are placed, to work
seamlessly, with every comment and UI problem on it fixed. The page was audited by
reading the source and by driving it in headless Chromium against a stateful mock of
the API, proxy and realtime socket (scratch harness, not checked in). Full list and
reasoning are in TDR-0047. Delivered:

**Canvas ↔ drawer**
- Showing a comment from the drawer (or from BugHunt AI) switches the canvas to the page
  the comment is on, then shows its pin.
- A card left open for a different comment closes.
- The status line gives the `#` reference and the real outcome: found, no pin on this
  page, element changed, or team-only.
- Clicking a pin opens that comment's detail in the drawer.
- Comments posted in the canvas refresh the list even without the websocket.
- URL updates on the page compose. React-router's functional `setSearchParams` was
  dropping one of two updates made in the same click (new
  `lib/use-search-params-updater.ts`).

**Widget**
- Live comments and replies from other people: pins, and replies added to an open card.
- Threads made team-only leave the client view live; threads made client-visible
  appear.
- An unfinished comment is no longer discarded by a stray click (the composer is
  nudged instead). Escape discards an empty composer, and a written one on the second
  press.
- Uploads: posting waits for them, a file removed mid-upload is dropped, and a failed
  or oversized file gets a message.
- Region comments:
  - anchored to the element containing the whole drawn box;
  - outline follows the element and is hidden in Browse mode;
  - pin restored at the region corner after reload;
  - a freshly drawn region's pin no longer hides itself.
- Closed comments get dimmer pins, and the open comment's pin is highlighted.
- Avatar initials ignore punctuation.
- Cards, the tooltip and toasts keep clear of the dashboard dock.

**Drawer**
- Optimistic field edits: quick successive tag/assignee toggles no longer undo each
  other.
- Replies on team-only threads are team-only.
- A layer toggle, behind a confirmation.
- Delete asks for confirmation and reports errors.
- Keyboard Enter/Space on a row's own buttons works.
- Real compact mode, a "Clear filters" action, and "Reopen" for any closed status.
- Errors reset per comment, and the thread scrolls to a new reply.
- Escape no longer closes the drawer (losing the draft) while typing, in a menu,
  dialog or date picker.
- Due labels read dates in UTC, matching the printed date.

**Layout**
- No sideways page shift (`overflow: clip`), and no clipped footer control.
- The footer stays on screen at 1024×700.
- Footer menus open above the dock, and the dock is legible in dark theme.
- The thread gets more room on laptop-height screens.
- Draw is in the header mode switch.

**Backend** (no schema, index or contract change)
- `create_reply` keeps replies on team-only threads team-only, so they are never
  broadcast to guests.
- `toggle_layer` sends guests `comment.deleted` when a thread becomes team-only.
- `list_for_guest_session` drops client replies on threads that aren't
  client-visible.

Verification:
- `pnpm turbo run lint typecheck build --force` passed 12/12 with no warnings.
- Backend `ruff check` and `ruff format --check` passed on `modules/comments`, strict
  `mypy app/` passed (182 files), and `scripts/check_workspace_scoping.py` passed.
- Scratch backend harness (`mongomock-motor`, realtime publishing captured), 12/12:
  - guest listing hides a hidden thread's replies, including with `since`;
  - a member reply on a team thread is forced team-only and not sent to the guest
    channel;
  - a client-thread reply is;
  - client→team sends guests only `comment.deleted`, and members `comment.updated`;
  - team→client sends guests `comment.updated`;
  - guest replies stay client.
- Scratch browser harness, 23/23 checks plus the scenarios above, with screenshots at
  1440/1366/1280/1100/1024 widths in light and dark themes.
- Existing tests in `tests/test_comments.py` encode behaviour this change keeps: a team
  reply on a client thread stays team, and guests never receive team content.

Not verified: the pytest suite and the `apps/e2e` Playwright journeys (no local
MongoDB/Redis), and a real proxied site through a deployed stack. No test suite was
written, per this repository's Claude Code instruction.

## 2026-09-29: Every integration and MCP client works without operator setup (TDR-0046)

The user asked for all integrations and MCPs to be set up and working, with anything
needing their input skipped.

**Integrations.** Eleven providers, every one connectable from the Integrations page with
a pasted token or webhook URL, so no OAuth app registration is needed:

- Notify: Slack, Discord, Microsoft Teams, and a signed webhook (Zapier, Make, n8n, custom).
- File tickets: Jira, Linear, GitHub, GitLab, Asana, ClickUp, Trello.
- ClickUp, Jira and Asana gained token modes. OAuth remains, offered only when the
  operator configures it (`GET /integrations/oauth-apps`, authorize URLs built
  server-side).
- New providers: Discord, Teams, webhook, GitHub, GitLab, Linear.

Around the connections:

- Trackers pick their list, project, repo or team from what the credential can reach
  (`GET /integrations/{id}/destinations`, `PATCH /integrations/{id}`), including a valid
  Jira issue type.
- One unified send, `POST /comments/{id}/integrations/{integration_id}/send`, recorded
  once per comment and connection in the new `integration_links` collection.
- The comment drawer has "Send to tracker" and a "FILED IN" row.
- Admins get "Send test"/"Check" and editable notification toggles. Members can see what's
  connected.

**MCP.** Seven tools (`list_projects`, `list_tickets`, `get_ticket`,
`generate_implementation_prompt`, `reply_to_ticket`, `update_ticket`,
`send_ticket_to_tracker`) and a `fix_ticket` prompt.

- Tokens are read-only or read & write.
- The owner's membership and role are re-checked on every request.
- Tool calls are rate-limited per token.
- The MCP page gives copy-paste setup (and install links where they exist) for Claude
  Code, Cursor, Codex, Antigravity, VS Code, Claude Desktop, Windsurf and Gemini CLI.

**Fixed along the way:**

- Bare `/mcp`, the URL the MCP page handed out, fell through to the proxy's catch-all
  instead of the MCP app.
- Tracker backlinks pointed at the removed `/p/{project}/board` route.
- Slack posts didn't escape `<!channel>`-style sequences in client-written comments.
- A blank `INTEGRATIONS_ENCRYPTION_KEY` in `.env` broke every credential-storing connect
  locally.
- A project's mute now covers every notifier, not only Slack.
- A provider answering with something unreadable (an HTML error page, an empty body)
  returned a raw 500 with no CORS headers, so the browser showed only "Failed to fetch".
  It is now a 502 that names the provider, and a failed send releases its claim.
- A checked `.bl-switch` was white-on-white in dark mode.
- In `pnpm dev`, every page reload signed you out. StrictMode ran AuthProvider's restore
  effect twice, and the second concurrent `/auth/refresh` tripped the server's
  refresh-token reuse detection, which revokes the session. `refreshSession` now shares
  one in-flight request. Production builds were unaffected.

**Contracts.** `packages/types` regenerated (`scripts/export_openapi.py`, then
`pnpm generate:local`). All changes are additive; legacy integration documents and the
four per-provider create endpoints keep working. `VITE_*_OAUTH_CLIENT_ID` is no longer
read. `.env.example`, `.env.production.example` and `DEPLOYMENT.md` were updated.

**Verification.**

- `pnpm turbo run lint typecheck build --force`: 12/12 tasks passed with zero lint
  warnings.
- Backend: `ruff check`, `ruff format --check` (233 files), strict `mypy app/ scripts/`
  (193 files) and `scripts/check_workspace_scoping.py` passed.
- Two scratch harnesses (not checked in) used in-memory `mongomock-motor` and `fakeredis`
  in place of the `.env` services. mongomock lacks `$convert` and `$indexOfArray`, so the
  harness shims only the object-id and array-index forms the dashboard pipelines use.
- **MCP, 42/42.** A real uvicorn server was driven by the official MCP SDK client over
  Streamable HTTP. It covered:
  - `/mcp` and `/mcp/` both working with no redirect;
  - 401 for a missing, bad or revoked token, and for an owner downgraded to a role
    without team access;
  - every tool and the prompt;
  - `#N`, ID, reply-ID and link ticket references;
  - no access to another workspace's ticket;
  - read-only tokens refused on writes, and legacy tokens read-only;
  - replies stored as the owner on the team layer;
  - the per-token rate limit.
- **Integrations, 83/83.** Every provider was exercised against respx-mocked provider APIs.
  It covered:
  - connect, check, destinations, send, and dedupe (including three concurrent sends
    filing one card, and a failed send releasing its claim);
  - schema SSRF rejections, plus refusal of a public hostname that resolves to 127.0.0.1;
  - that screenshot fetches never carry tracker tokens;
  - Jira's refresh-token rotation, now persisted;
  - Slack escaping, the Discord mention guard and Teams card shape;
  - webhook signature verification;
  - the team-only and per-project mute gates;
  - retry at 5s, then dead-letter plus notification;
  - the "project updated" fan-out;
  - route permissions (members list and send, but can't connect or browse destinations);
  - unreadable provider responses becoming readable 502s.
- **Browser pass.** A throwaway API ran on the same fakes, with its own Vite on a spare
  port, driven by headless Chromium. It covered:
  - the Integrations page (light, dark, and 390px wide with no horizontal overflow);
  - choosing a Trello list, Slack settings, and the Jira token form with its error path;
  - the MCP page: creating a token, the Cursor config with the token embedded, the install
    link, and the Codex tab;
  - "Send to tracker" in the project's comment drawer filing to Linear, and the resulting
    "FILED IN" chip.
  The only console error was the expected 422 from the deliberately bad Jira token.
- `tests/test_integrations.py` and `tests/test_mcp.py` had their call sites updated to the
  new signatures (no new tests). The eight that need no database pass. The rest need
  MongoDB/Redis, and were not run because the conftest `db` fixture wipes whatever
  `MONGO_URI` points at.

Not verified: live calls to real Slack, Discord, Teams, Jira, Linear, GitHub, GitLab,
Asana, ClickUp or Trello accounts; real OAuth consent screens; each agent client's own
config parser against the published snippets.

## 2026-09-29: Pending-issues sweep (TDR-0045)

Every "pending" list in the repository was rechecked against current source: the
2026-09-09 master-audit rows, the 2026-09-13 production-readiness plan, and the follow-ups
at the end of recent entries below. Most older items are already delivered (calendar
`Today`, ticket drag-and-drop, Jira/Asana, the MCP server, placeholder-page treatment,
per-project Slack opt-out, the Slack "project updated" event). Still live, and fixed:

- **Extension composer never closed after posting.** `content-script.ts`'s submit callback
  returned nothing where `openComposer` expects `true`/`false` (the extension typecheck
  failure first noted in TDR-0041's entry). It now returns the result like the widget's,
  and its pins show ticket numbers too.
- **Canvas hotkeys reverted the URL.** The hotkey listener in `ProjectOverviewPage.tsx`
  held stale `setMode`/`goToPage`, which rebuild the URL from the `searchParams` of the
  render that created them. After changing zoom, viewport or stage width, pressing C/D/V
  or an arrow key restored the old values. The listener now calls them through a ref.
- **Web lint at zero warnings:** besides the above, shortcut data moved to
  `features/projects/shortcuts.ts` and the browser list to `footer/browsers.tsx`, so their
  component modules export only components (React Fast Refresh).
- **Backend formatting:** `ruff format` applied to the 10 files that failed the check
  (whitespace only).
- **Entry bundle 1,218.77 kB → 400.65 kB** (357.66 → 127.44 kB gzip): every page route in
  `app/router.tsx` now loads lazily via react-router's `lazy`, with `LoadingScreen` as the
  first-load fallback. pdf.js ships only in the canvas/asset-review chunk. The build no
  longer prints the >500 kB chunk advisory.
- **`?blBrowser=` duplicate pages (TDR-0035 follow-up):** new dry-run-first
  `backend/scripts/migrate_canvas_param_pages.py`. It merges pages registered with the
  canvas's `blBrowser`/`blMode` parameters into the page the same URL registers as today,
  one transaction per duplicate, with a reference re-check before each delete. Duplicates
  with an asset or a colliding browser render are skipped and reported. **Not run against
  any database**; run it without `--apply` first.
- **Stale copy:** `UsagePage` no longer claims there is no AI provider; the widget's
  UX-AUD-027 "still pending" comment now describes the retry the composer already does.

Deliberately not done (reasoning in TDR-0045): the `webhook_events`/`webhook_deliveries`
tables (Slack retries already exist in `workers/integrations.py`), and repairing
`tests/test_proxy.py` (its fake predates the SSRF guard, shared transport and preview
origins; it can't run here, and no test suites are written under Claude Code).

Verification: `pnpm turbo run lint typecheck build --force` passed 12/12 with no warnings
(extension typecheck included, for the first time since TDR-0041). Backend `ruff check .`,
`ruff format --check .` (226 files), strict `mypy app/ scripts/` (186 files) and
`scripts/check_workspace_scoping.py` (19 repository files) passed. The merge script ran in
a scratch harness (not checked in) against `mongomock-motor`, with transactions faked,
covering:

- a dry run that wrote nothing;
- an apply that matched the dry run's plan;
- a canonical page absorbing two duplicates, with exactly one current revision left;
- a missing canonical page, where the oldest duplicate was renamed, adopted the other's
  current revision and got `latest_revision_id` set;
- render-conflict and asset duplicates skipped untouched;
- an unrelated `?page=2` page ignored;
- a re-run that was a no-op;
- the workspace filter.

Not verified: real MongoDB transactions, a browser session against a running stack (lazy
route loading, the hotkey fix, the extension composer), and the pytest suite (no local
MongoDB/Redis/Docker on this machine).

## 2026-09-27: SSO sign-in clicks escape the canvas into a real tab (TDR-0044)

Clicking "Sign in with Google" (or Microsoft/Apple/Facebook/GitHub/Okta/Auth0/Yahoo)
inside the canvas failed silently - the identity provider refuses to render its own
sign-in page in any iframe, browser-enforced, same restriction TDR-0040/0042 already
document as unfixable by proxying. Added to `modules/proxy/interceptor.py` (injected into
every proxied page, same file TDR-0035/0040 already extend): a capturing `click` listener
that opens a matching `<a href>`'s target in a real `window.open()` tab instead of
navigating the canvas to it, and a capturing `submit` listener that does the same for a
matching `<form>` by cloning its fields into a form built inside the new tab (needed for
POST forms, where a static URL can't carry the body). Host matching is an explicit
allowlist, exact-suffix only (a lookalike like `accounts.google.com.evil.com` does not
match). This only redirects where the browser navigates - it does not read, store, or
transmit anything from the resulting sign-in; carrying that session into the canvas
afterward is still the existing extension Sync action (TDR-0041).

Verification: backend `ruff check`/`format --check`/`mypy` (strict, 175 files) and
`tests/test_proxy_rewriter.py` (10/10) clean. Extracted the real generated interceptor
script via `build_interceptor_script()` and syntax-checked it with `node --check`. Ran it
in a Node VM harness against a fake DOM: a Google OAuth link click is prevented and opens
a new tab; a same-site link click is left untouched; a link already carrying
`target="_blank"` is left for the browser; a Microsoft OAuth POST form submit is
prevented and its fields are cloned into a form submitted inside the new tab; a normal
form submit is left untouched; a lookalike domain (`accounts.google.com.evil.com`) does
not match; `github.com` matches but `githubusercontent.com` does not. Not verified: a
real browser session against a live identity provider (would need the deployed stack and
a real "Sign in with X" button to click). No test suite added, per this repo's Claude
Code instruction.

## 2026-09-27: BugHunt AI becomes a real project-wide analysis (TDR-0043)

- `AiTab.tsx` ("BugHunt AI") was an honest "Coming soon" placeholder since TDR-0033
  deliberately deferred it (its only reference, `backline-final-draft.html`, ties it to
  a fake AI-credits/paywall system AGENTS.md forbids). The user provisioned 5 real Groq
  keys and asked to build it for real, scoped to exactly the checklist the panel
  already advertised (read every open comment, prioritize by severity, summarize
  progress), explicitly excluding any change to the two existing comment-thread AI
  actions ("except the comments"), plus one recommended addition: duplicate-thread
  flagging. Full decision record: docs/tdr/0043-bughunt-ai-project-analysis.md.
- Backend: `backend/app/modules/ai/schemas.py` gained `Severity`/`BugHuntFinding`/
  `DuplicatePair`/`ProjectAnalysisResult`; `service.py` gained `analyze_project()`
  (resolves project → pages → open top-level comments the same way
  `comments/service.py`'s `list_comments_for_project` already does, caps at the 40
  newest, calls Groq in JSON mode via a new optional `json_mode` param on the shared
  `_complete()` helper - the two existing callers pass nothing and are byte-for-byte
  unchanged); `router.py` gained `POST .../projects/{project_id}/ai/analyze` gated by
  the existing `comment:update_status` permission (same bar as manually setting
  priority, since this writes that same field). No schema/migration was needed for
  severity - it writes straight into the comment's pre-existing `priority` field.
  Any `comment_id` the model returns that wasn't in the candidate set sent to it is
  dropped before it can be written or returned; a non-JSON model response degrades to
  a summary-only result instead of a 500.
- Contracts regenerated: `uv run python scripts/export_openapi.py` then (from
  `packages/types/`) `pnpm generate:local`; `pnpm typecheck` clean.
- Frontend: `AiTab.tsx` rewritten from a static placeholder into a real panel (plain
  `async`-handler + `useState`, matching `CommentThreadPanel.tsx`'s existing
  Summarize/Suggest Replies pattern rather than `useMutation`); reuses the existing
  `aiErrorMessage()` busy-state helper untouched. `ProjectSidePanel.tsx` now passes
  `workspaceId`/`projectId` and an `onViewComment` callback that switches to the
  Comments tab with the clicked finding/duplicate selected. A successful analysis with
  any findings invalidates `qk.projectComments(projectId)` so the board reflects
  updated priorities immediately.
- No credit/usage metering or paywall UI was added anywhere, matching TDR-0033's
  precedent.
- **Follow-up bug fix, same day:** the first pass only caught a `json.loads` failure
  (non-JSON text). A syntactically-valid-but-wrong-shaped response - a JSON array or
  scalar instead of an object, or a `findings`/`possible_duplicates` entry that isn't
  itself an object - would call `.get()` on the wrong type and raise an unhandled
  `AttributeError`/`TypeError` past that narrow `except ValueError`, surfacing as a 500
  instead of the intended graceful degradation. Fixed by widening the try/except to
  wrap the full parse-and-extract block (`isinstance` guards on `parsed` and on each
  list entry, catching `ValueError`/`TypeError`/`AttributeError` together) so any
  malformed model output degrades to a summary-only result and, critically, leaves
  `findings` empty - no partial/garbage write to a comment's `priority` can happen from
  a bad response.
- Verification: from `backend/`, `uv run ruff check app/`, `uv run ruff format --check
  app/modules/ai/` (repo-wide `format --check` has 7 pre-existing files needing
  reformat, all outside this slice and already modified by unrelated in-progress work
  on this branch - left untouched), strict `uv run mypy app/` (175 files), and
  `scripts/check_workspace_scoping.py` (the static tenant-isolation lint backing
  `test_workspace_scoping_lint.py`) all clean. From `apps/web/`, `pnpm typecheck`,
  `pnpm lint` (4 pre-existing warnings, none in touched files), and `pnpm build` all
  clean. The existing `pytest` suite was not run to completion: this machine has no
  local `mongod`/`redis-server` running (TDR-0001's native-binary dev setup), so the
  DB-backed suite hangs on connection rather than failing fast - consistent with prior
  Groq-slice entries in this ledger, which noted the same gap rather than starting
  those services. No new test suite was written, per this task's own Claude Code
  instructions. No live call to Groq was exercised in this session - the 5 keys are
  supplied by the user outside it; with `GROQ_API_KEYS` unset the endpoint returns the
  same honest disabled placeholder the other two AI actions already use, which is what
  this session's verification exercised.

## 2026-09-27: Cloud login browser deploy, part 2 - dedicated Dockerfile (TDR-0042)

Continuing the same-day deploy: the user added Railway balance and asked for the
`cloud-login` service to actually work. First deploy attempt (after merging PR #35,
which landed the whole day's work - preview origins, session sync, and this feature - on
`main`) failed twice:

1. First build used Railpack's own Node/Nx auto-detection instead of the Dockerfile at
   all - traced to the `cloud-login` service's build config not yet being set at the time
   its first (service-creation-triggered) build ran.
2. After setting `dockerfilePath`/`startCommand` via the Railway GraphQL API and
   redeploying, the container built but crash-looped: `startCommand` bypasses the
   Dockerfile's own `CMD ["sh", "-c", ...]` and runs the string directly, so
   `${PORT:-8000}` was never shell-expanded. Fixed by wrapping the override in its own
   `sh -c "..."`.
3. That redeploy (still against the OLD `main`, before the PR merge landed) also failed
   for the more fundamental reason that `cloud_login_app.py` didn't exist on `main` yet -
   the earlier attempt to `git push` had been blocked by a safety check and needed the
   user's explicit confirmation to retry, which they gave ("create pr and push to main").
4. After merging, `app` and `worker` auto-redeployed cleanly with the new code (confirms
   the rest of this day's work - TDR-0040/0041 - is now live). `cloud-login` still failed:
   tried `dockerfilePath: "/backend/Dockerfile#cloud_login"` (a guess at stage-target
   syntax some platforms support) - Railway's build log showed it literally tried to read
   a file at that path and failed, confirming that syntax isn't supported here.
5. Root cause: neither the Railway dashboard (Settings → Build, checked directly via a
   screenshot the user shared) nor the public GraphQL API (`ServiceInstance`,
   `ServiceInstanceUpdateInput`, `ServiceSource` schemas all searched for `target`) expose
   a way to pick a non-last Dockerfile stage for this project. `backend/Dockerfile`'s own
   comments describe a "Docker Build Target" dropdown for the `worker` service, but that
   control isn't reachable through anything checked this session - whether it still works
   for `worker` itself wasn't verified either way.
6. Fix: gave the cloud login browser its own dedicated `backend/Dockerfile.cloud_login`
   (single stage, no target ambiguity possible) instead of a `FROM worker` stage inside
   the shared Dockerfile. Slightly duplicates the base Python/uv setup, installs only
   Chromium (not Firefox/WebKit - this service never launches those), and completely
   removes any risk to `app`'s or `worker`'s own untargeted builds. `backend/Dockerfile`'s
   `cloud_login` stage was removed; TDR-0042, `.env.production.example`, and
   `DEPLOYMENT.md` updated to reference the new file instead of a build-target setting.

Status at end of this entry: `cloud-login` service's `dockerfilePath` repointed at
`backend/Dockerfile.cloud_login` via the Railway API; the file itself committed and
pushed on `codex/fix-proxy-comments-ai`, PR opened, not yet merged/redeployed - next step
is the user merging it and a final redeploy + health check once that lands.

Railway setup performed this session (via `railway` CLI + its GraphQL API, all
non-destructive/reversible): linked the `believable-caring` project; created the
`cloud-login` service tracking `main`; generated it a public domain
(`cloud-login-production.up.railway.app`); set `CLOUD_LOGIN_WS_URL` on `app`; wired
`cloud-login`'s `MONGO_URI`/`REDIS_URL`/`JWT_SIGNING_KEY`/`INTEGRATIONS_ENCRYPTION_KEY`/
`CORS_ALLOW_ORIGINS`/`PUBLIC_DASHBOARD_BASE_URL` as Railway variable references to `app`'s
existing values (`${{app.VAR}}`, not copied secrets). A `railway sandbox` was also tried
mid-task (user's own suggestion) to get real infra for verification, but it has no access
to the project's private network by default and no copy of the repo, so it was destroyed
again without being put to use. One `git push` and one attempt to read back the
`cloud-login` service's resolved variable values were both blocked by this environment's
own auto-mode safety classifier (secret-store write/read guards); the push was retried
after the user explicitly confirmed, the variable read was not retried (not needed - the
`set` call's own success response was sufficient confirmation).

## 2026-09-27: Cloud login browser - code ready, not deployed (TDR-0042)

Built the second of the two login approaches asked for (session sync, TDR-0041, is the
first): a real server-side Chromium a member can drive interactively for reviewers without
the extension, or sites whose session is bound to the signing-in IP.

- `backend/app/cloud_login_app.py` (new, separate minimal FastAPI app - never mounted into
  `app.main:app`): `GET /ws` - validates a one-time Redis ticket, claims one of a small
  number of concurrency slots (`SET NX EX`, same pattern as `ai/key_pool.py`'s Groq key
  claiming), launches Chromium behind the same per-navigation SSRF guard
  `browser_render/service.py` already uses, streams a CDP `Page.startScreencast` (JPEG,
  1280×800) to the client, and applies mouse/keyboard input via `page.mouse`/
  `page.keyboard`. On finish/timeout/disconnect: captures cookies + localStorage and calls
  `session_sync.service.create_ticket` **directly** (same process - reuses TDR-0041's
  pipeline instead of a second one).
- `backend/app/modules/cloud_login/` (new): `POST /api/v1/projects/{id}/cloud-login/sessions`
  (`project:manage`) mints the ticket on the main API, which never imports Playwright.
- `backend/Dockerfile`: new `cloud_login` stage, `FROM worker` (reuses its already-installed
  Chromium/Firefox/WebKit binaries rather than repeating the install), own `CMD`.
- `apps/web/src/features/projects/CloudLoginModal.tsx` (new) + `QuickToolsDock`/
  `ProjectOverviewPage` wiring (a "Sign in with a live browser" menu item, gated on a proxy
  link existing) + `styles/backline.css` additions.
- Config: `CLOUD_LOGIN_WS_URL` (empty = off, matches every other credential-gated feature's
  convention), `CLOUD_LOGIN_MAX_CONCURRENT_SESSIONS` (default 2),
  `CLOUD_LOGIN_SESSION_TTL_SECONDS` (default 240). Documented in `.env.production.example`
  and `DEPLOYMENT.md`.
- `packages/types` regenerated (additive: `CloudLoginSessionOut` + the new path).

**Not deployed.** Mid-build, the user shared their Railway dashboard: the
`believable-caring` project's only environment (`production`, already running the live
`app`/`worker`/`Redis`) had **$4.41 of credit left over the remaining 25 days**, no staging
environment to try a new service against first. A `railway sandbox create` was tried at the
user's own suggestion to get a real Linux box for verification, but the sandbox has no
access to the project's private network by default (confirmed: it couldn't even resolve
`redis.railway.internal`) and no copy of the repo, so it was destroyed again after a few
minutes rather than spending effort wiring it up for marginal benefit over the scratch
harness below. Given that budget, creating the actual `cloud_login` Railway service
(`CLOUD_LOGIN_WS_URL`, its own public domain) was deliberately left for the user to decide
on rather than done unprompted - see TDR-0042's Cost section for the actual numbers
(the running cost is genuinely small; the open question is whether to spend any of a
near-exhausted balance on trying a new service before topping up).

Verification:
- Backend `ruff check`/`format --check`/`mypy` (strict, 175 files) clean.
- Scratch harness (fakeredis, no real Redis/Mongo/Chromium): `cloud_login_app` module
  imports cleanly without the browser binaries installed (confirms the lazy `playwright`
  import - the API/ticket-minting path never pays for Chromium); the concurrency slot
  semaphore claims exactly `CLOUD_LOGIN_MAX_CONCURRENT_SESSIONS` slots, refuses the next,
  and reclaims one after release; the ticket round-trip is one-time (replay returns None);
  the dashboard-origin allowlist accepts the configured dashboard origin and rejects an
  arbitrary one; the mouse-coordinate parsing helper accepts numeric points and rejects
  malformed ones.
- `pnpm turbo run lint typecheck build` for web/widget/types: clean, same 4 pre-existing
  warnings, no new ones. Extension `lint`/`build` clean (its one pre-existing `typecheck`
  failure, unrelated to this work, is unchanged - see TDR-0041's entry).

Not verified, and can't be without deploying: an actual Chromium launch, the CDP screencast
loop against a real page, or the dashboard modal's canvas rendering/input capture against a
live websocket. No test suite written, per this repo's Claude Code instruction.

## 2026-09-27: Session sync via the extension, for SSO the proxy can't reach (TDR-0041)

Google/Microsoft SSO refuses to render inside any iframe, so TDR-0040's per-link preview
origin can't help sign-in flows that use it. Delivered a way to carry a session the member
already has in a normal browser tab into the canvas instead:

- `backend/app/modules/session_sync/` (new): `POST /api/v1/projects/{id}/session-sync`
  (`project:manage`-gated) takes cookies + localStorage, resolves the project's active
  proxy-mode share link, and stores a one-time Redis ticket (5-minute TTL) keyed by 24
  random bytes; refuses outright (clear error, not silent no-op) when the link has no
  preview origin (TDR-0040 not configured).
- `GET /proxy/{share_token}/__backline/session-sync` (`proxy/router.py`, registered before
  the catch-all path route so it isn't forwarded upstream) redeems the ticket: real
  `Set-Cookie` names with TDR-0040's own CHIPS attributes, an inline script writing
  localStorage (escaped the same way `interceptor.py`'s own injected script is), then
  redirects to `/`. Deletes the ticket the instant it's read, valid or not.
- Extension (`apps/extension`): manifest now declares `cookies` + `host_permissions:
  <all_urls>`. Popup shows "Sync this session to the canvas" when the active tab matches a
  project the member can manage; background worker reads cookies (`chrome.cookies.getAll`,
  HttpOnly included) and localStorage (`chrome.scripting.executeScript`), posts the ticket,
  then opens/closes an invisible tab at `redeem_url` - cookies/localStorage are per-origin,
  not per-tab, so the canvas iframe (same preview origin) picks both up on its next load
  with no coordination needed.
- `packages/types` regenerated (additive: `SessionSyncTicketOut` + the new path).

Verification:
- Backend `ruff check`/`format --check`/`mypy` (strict, 170 files) clean.
- Scratch in-process ASGI harness (real app, Mongo/Redis stubbed): create-ticket → redeem
  round trip confirmed real cookie names + HttpOnly + CHIPS attributes on the Set-Cookie
  response, an XSS-shaped localStorage value (`"<script>fake"`) correctly escaped in the
  emitted inline script, one-time consumption (replay → 404), and redemption attempted off
  a preview origin correctly rejected (422) rather than falling through to the generic
  proxy handler and being forwarded upstream.
- `pnpm turbo run lint typecheck build` for web/widget/types: clean, same 4 pre-existing
  warnings. Extension `lint`/`build` clean; extension `typecheck` has one pre-existing
  failure in `content-script.ts` (`openComposer` callback return type) confirmed via
  `git stash` to already exist on this branch before this work - not introduced here, not
  touched (out of scope for this change).

Not verified: a live browser session (`chrome.cookies`/`chrome.scripting` behavior, the
invisible-tab redeem) against a running extension + deployed stack. No test suite written,
per this repo's Claude Code instruction.

## 2026-09-27: Review proxy serves each share link from its own origin (TDR-0040)

Login sites failed in the canvas: Instagram's login rendered its own "profile not found"
page because its router read `/proxy/{token}/accounts/login/` as a username. Root cause
and all related breakers in TDR-0040. Delivered:

- `modules/proxy/preview_host.py` (token ↔ base32 DNS label, preview-domain config) and
  `preview_middleware.py`, which re-addresses every preview-host request to the proxy and
  nothing else (404 for a malformed label; websockets closed). Registered outermost in
  `app/main.py`.
- `proxy/service.py` preview path: `Cookie` forwarded as sent, `Set-Cookie` relayed under
  real names (Domain dropped; `Secure; SameSite=None; Partitioned`), redirects returned to
  the browser, Referer origin-swapped. `sec-ch-ua*`/`upgrade-insecure-requests` forwarded
  and `Sec-Fetch-*` normalised to a direct visit (both modes). Legacy path mode extracted
  unchanged into `_fetch_legacy`.
- `interceptor.py`: empty-prefix mode, plus a `document.cookie` setter applying the same
  cookie attributes. `rewriter.py` needed no logic change.
- Contract: nullable `preview_origin` on `ShareLinkOut` and `ReviewResolveOut`; OpenAPI
  re-exported and `packages/types` regenerated (additive diff only).
- Web: canvas iframe and guest handoff use `preview_origin` (legacy URL when null);
  postMessage targets the frame's real origin (`features/projects/canvas-origin.ts`, used
  by `ProjectOverviewPage.tsx` and `panel/CommentsTab.tsx`).
- Config/docs: `PROXY_PREVIEW_DOMAIN`/`PROXY_PREVIEW_SCHEME` (local default
  `preview.localhost:8000`; off elsewhere until set) in `.env.production.example` and
  `DEPLOYMENT.md`.

Verification:
- Backend `ruff check`, `ruff format --check` and `mypy` (strict, 166 files) clean; existing
  `tests/test_proxy_rewriter.py` 10/10.
- `pnpm turbo run lint typecheck build` for web, widget and types: all passed; web's 4
  pre-existing warnings unchanged.
- Scratch in-process ASGI harness (real app; Mongo, Redis and upstream stubbed with
  `httpx.MockTransport`):
  - preview `/` → `302 /accounts/login/`;
  - `csrftoken` relayed unprefixed with `Secure; SameSite=None; Partitioned`;
  - a JSON login POST carried the `Cookie` and `X-CSRFToken` upstream, and its HttpOnly
    session cookie came back;
  - absolute site links rewritten root-relative;
  - `/api/v1/auth/me` and `/widget/sdk.js` on a preview host went upstream, not to
    Backline;
  - a malformed label returned 404;
  - legacy `/proxy/{token}/` output unchanged;
  - with `ENVIRONMENT=production` and nothing set, `preview_origin` is null.
- Scratch Node VM run of the generated interceptor: relative URLs untouched, absolute
  `www.`/apex site URLs made root-relative, CDN URLs untouched, `pushState` mapped, and a
  `document.cookie` write's Domain/SameSite replaced.

Not verified: a live browser session against a running stack (no local Mongo/Docker in this
environment). That run would cover partitioned cookies in the cross-site canvas iframe on
`*.preview.localhost`, and a real SPA login. No test suite written, per this repo's
Claude Code instruction. Production needs wildcard DNS and a TLS certificate before
`PROXY_PREVIEW_DOMAIN` is set.

## 2026-09-27: Tickets doc sweep — pin ticket numbers and paste-to-attach (TDR-0039)

A second stakeholder Google Doc (plain text, no screenshots, 18 items) — distinct from
TDR-0038's 13-item screenshot report above — listed QA-tool bugs/requests whose wording
suggested an older backlog predating TDR-0021 through TDR-0038. Each item was checked
against current source before anything was changed. Full reasoning in TDR-0039; summary:

- **13 of 18 items were already done**, matching prior TDR work: ticket IDs in the
  dashboard (TDR-0032), the ticket board design, multi-person assignee filter, Add/Select
  Page, ticket-creation screenshots, default priority/page state, the due-date picker's
  dialog-portal fix (TDR-0032), login/forgot-password/signup in the tool (TDR-0024,
  TDR-0025), the full-width draggable/resizable preview (TDR-0022), comment pins surviving
  a refresh (TDR-0033–0036), and the comment composer/popup design. No changes made.
- **Fixed (2 genuine gaps):**
  - The widget's `CommentRecord` type never declared `ticket_number` (already present on
    the backend's `CommentOut` — no API change needed), so a live review-page pin and its
    read-only card never showed which ticket they belonged to, even though the dashboard
    shows the number everywhere. `renderPin` (`ui-notifications.ts`) now takes an optional
    ticket number and renders it as the pin's text; `index.ts` and `region-drawer.ts` pass
    it for an existing comment's pin and set it once a draft pin's comment is created.
  - Screenshot copy-paste was entirely missing (confirmed net-new — not in the widget, the
    web app, or the design HTML). `ui-attachments.ts`'s file-input handler was refactored
    to expose a reusable `addFiles(files)`; `ui-composer.ts` now listens for `paste` on the
    comment textarea, extracts any clipboard image items (naming them from their MIME type,
    since `getAsFile()` gives no filename), and feeds them through the same upload/chip
    pipeline a picked file already uses. Scoped to the widget comment composer only, per
    stakeholder direction (not the dashboard's "New ticket" form).
- **Asked the stakeholder directly rather than guessing (both answered):** the
  Status/Priority pills in `TicketRow.tsx`/`TicketTable.tsx` use a native `<select>` over a
  styled pill, with an existing code comment marking this intentional, and the design HTML
  has no interactive open-state for it to match against — decision: leave as-is, not a bug;
  and paste-to-attach scope — decision: widget composer only.
- Verification: `pnpm turbo run lint typecheck build` for `@backline/widget`,
  `@backline/extension`, and `@backline/web` all passed clean (web's 4 pre-existing
  warnings unchanged, none in touched files). No test suite was written or run, per this
  task's own instructions. Not exercised in a live browser against a running API.

## 2026-09-27: QA doc bug sweep — verified against source, fixed what's still live (TDR-0038)

A client bug report (Google Doc, 17 screenshots, 13 items) covering the Share modal,
sidebar, dashboard, projects grid/table, tickets calendar/board/toolbar, and the widget's
pin-click comment popup. Each item was checked against current source before changing
anything, since the branch already carries TDR-0032's calendar/board/date-picker rebuild
and the 2026-09-26 design-parity slices. Full reasoning and per-item disposition in
TDR-0038; summary:

- **8 of 13 items were already fixed** on this branch (calendar grid, due-date popup
  positioning, sidebar horizontal scroll, "Waiting on you" alignment, projects tab-bar
  scroll, project-card three-dot menu placement, select/dropdown chevron padding, board
  view design) — confirmed by direct source read, several against code comments that
  already describe the exact screenshot symptom as a closed bug. No changes made to these.
- **Fixed:**
  - `ShareProjectModal.tsx`'s hand-rolled sun-shaped settings icon replaced with the
    existing shared `GearIcon` (already used for the identical control in
    `CollaboratorsModal.tsx`).
  - Removed the "Manage all share links" footer link from `CollaboratorsModal.tsx`.
  - `features/board/components/KanbanBoard.tsx` (the comment/design-review board, distinct
    from the tickets Kanban) had no ticket/comment number on its cards, unlike every other
    ticket surface. Added a `bl-tid` badge via the existing `ticketRef()` helper.
  - The widget's read-only pin-popup (`ui-comment-view.ts`'s `openCommentView`) rendered
    only a thread's top comment; `thread-manager.ts` already held the full
    `[top, ...replies]` array in memory but read only index `[0]`. Added a `replies` field
    to `CommentViewData` and a read-only reply list (author, time, body) to the card. No
    reply composer was added inside this popup — posting already has a permission-aware
    path via the dashboard's `CommentDetail`/`CommentThreadPanel`; a second posting surface
    in the on-page widget is a separate product decision this report didn't ask for.
  - Found while investigating the reported toolbar "vertical scroll": `backline.css`
    defined `.bl-ticket-toolbar` twice, and the later definition silently dropped
    `flex-wrap:wrap`. Removed the shadowed rule and restored `flex-wrap:wrap` on the one
    that wins the cascade.
- **Deliberately left alone** (reasoning in TDR-0038): the pin-popup's status control is
  already editable for a team member reviewing through the dashboard canvas and read-only
  for a guest, by existing design policy — the screenshot most likely came from a bare
  guest-link visit; the projects Table view already has real styling, so "design a proper
  UI" is an open-ended aesthetic ask rather than a defect; a due-date range filter button
  in the tickets toolbar was intentionally removed in an earlier commit (`caaf5d1`) and
  wasn't reinstated, since re-adding it reverses a past product decision this report
  didn't ask to reopen.
- Verification: `pnpm turbo run lint typecheck build --filter=@backline/web
  --filter=@backline/widget` passed 6/6 (web lint: the same 4 pre-existing warnings, none
  in changed files; the same pre-existing >500 kB chunk advisory). No API contract,
  database, or `packages/types` change. No test suite was written or run, per this task's
  own instructions (Claude Code: verify via lint/typecheck/build only). No live browser
  QA was performed in this pass.

## 2026-09-26: Final proxy, comment persistence, and Groq reconciliation (TDR-0033–0036)

- Completed the interrupted comment-pin slice: stored anchors now wait a bounded time
  for late SPA rendering, pin offsets are proportional to the element's current box,
  and pending anchor work is discarded after a page change. This removes the
  load-timing race that made a persisted comment appear only on some reloads.
- Presigned R2 uploads remain the fast path. Screenshots and attachments now retry via
  a bounded multipart API relay when the browser cannot complete that PUT (notably a
  missing/stale bucket CORS policy). The relay repeats actor/project authorization,
  Pydantic type/size validation, rate limiting and private S3 storage; the generated
  OpenAPI JSON and TypeScript contracts include `StoredUploadOut` and the new route.
- Hardened the proxy work before publication: per-request HTTP clients now close
  without closing the shared connection pool, and cross-site GET redirects return to
  the browser instead of forwarding bearer/custom headers to a different host.
- Reconciled Groq behavior with current official documentation. The configured default
  is the documented production model `openai/gpt-oss-120b`; limits are organization-
  wide, so a 429 cools the entire pool rather than hopping keys. Redis leases now carry
  unique ownership tokens and release/cooldown uses atomic compare operations, avoiding
  deletion of a newer lease after a safety TTL expires. Documentation no longer
  recommends extra accounts/organizations to multiply quota.
- Final verification: backend `ruff check app` passed; `ruff format --check` passed on
  all changed Python files; strict `mypy app/ scripts/` passed across 174 source files;
  and the workspace-scoping checker passed across 19 repository files. OpenAPI JSON
  and generated TypeScript were regenerated twice with identical SHA-256 hashes.
  Frontend `pnpm turbo run lint typecheck build` passed all 12 tasks (the same four
  existing web warnings remain); the web build retains its existing >500 kB chunk
  advisory. Per the Codex task instruction,
  no new test suite was written or run. No live provider credential, production
  service, shared fixture, or destructive migration was used.

## 2026-09-26: Groq AI feature - frontend refinement and concurrency verification

> Historical intermediate evidence: the pool later gained owner-token leases and
> organization-wide 429 cooldown in the final reconciliation above. Treat the final
> lint/typecheck/build evidence, not this earlier throwaway harness, as release evidence.

- Confirmed the AI feature needs no permission/plan change to be testable by every real
  user: `comment:view_team` (the permission both AI endpoints already require) is
  granted to `owner`/`admin`/`member` - every workspace role except `guest` - per
  `backend/app/core/permissions.py`. No `ProFeatureModal`/plan check wraps either AI
  button in the frontend (grepped both surfaces directly). This was already the case
  before today's Groq work; nothing needed changing to make it available for testing.
- Found and fixed a real state-leak bug while reviewing the frontend for refinement:
  `CommentDetail.tsx`'s `draft` (suggestReply) mutation's `isError`/`error` is not
  reset when the drawer switches to a different comment (its existing per-comment
  reset `useEffect` cleared `body`/`attachments`/`devTask`/etc. but never called
  `draft.reset()`). A user who got "AI is busy" on one comment would still see that
  banner under the next comment they opened, before ever asking it for a draft. Fixed
  by moving the reset effect to after `draft` is declared (it referenced `draft`
  before its declaration otherwise) and adding `draft.reset()` to it.
- Small related polish in `CommentThreadPanel.tsx`: a summary or suggested replies
  generated before a reply is posted now clear on that reply's success, since they
  described a thread state (pre-reply) that no longer matches what's now on screen.
- **Made the key pool's concurrency claim concrete, not just reviewed:** no local Redis
  was available in this sandbox during the original TDR-0034 work, so `acquire_key`/
  `release_key`/`cool_down_key` had only been verified by reading. Wrote an ad-hoc
  script (not part of the repo) against `fakeredis`'s async Redis stand-in and ran it:
  confirmed 3 concurrent acquires against 3 keys each get a distinct key with no
  double-claim; a 4th concurrent caller with all keys held gets `None` (the "busy"
  case); a released key is immediately re-claimable rather than waiting out the lock's
  safety-net TTL; a cooled-down key stays unavailable until its own cooldown elapses,
  then is claimable again; and - the strongest check - 50 concurrent callers racing for
  3 keys produced exactly 3 winners with no two winners getting the same key index,
  which is the actual atomicity guarantee `SET NX` is relied on for. All 10 checks
  passed. This does not test against the real production Redis (out of reach from this
  environment, and not attempted so as not to touch live traffic/data) - it tests the
  same logic against a faithful in-memory Redis implementation instead.
- Verification: `pnpm turbo run lint typecheck build` passed 12/12 (only the same
  pre-existing warnings as every prior run - none in the two files touched here). The
  `fakeredis`-based key-pool script was run via `uv run --with fakeredis`, an ephemeral
  dependency for this one verification run only - `pyproject.toml`/`uv.lock` are
  unchanged.

## 2026-09-26: Proxy sign-in through a site's own scripts, and faster, steadier loading (TDR-0035)

- Problem reported: signing in to a reviewed site inside the canvas failed, and the
  canvas was slow, reloaded by itself and sometimes showed "failed to load". The user
  asked for the proxy (not the browser extension) to handle any site's own login.
- Root causes and fixes are itemized in TDR-0035. In short: a page's scripted requests
  (fetch/XHR login, SPA routing, resources added after load) never reached the site, so a
  network interceptor is now injected first in every proxied page
  (`backend/app/modules/proxy/interceptor.py`) and the widget reaches Backline through the
  un-wrapped fetch; bearer/CSRF headers and the reviewer's User-Agent are forwarded, and
  PUT/PATCH/DELETE are proxied; DNS no longer blocks the event loop; connections are
  pooled; responses are gzipped and keep their caching headers; the rate limit is per
  share link + IP at 1200/min; the dashboard no longer reloads (or times out) pages the
  frame navigated to itself; and the widget follows SPA route changes, re-registering the
  page, its pins and its realtime subscription.
- Also fixed on the way: registered page URLs no longer include the canvas's `blBrowser`
  parameter, which had been creating a separate page per capture-browser choice (and a
  different page from the one guests register). Existing `?blBrowser=` pages are left
  as-is; merging them needs a dry-run-first migration, not done here.
- Verification: `uv run ruff check app/` and `ruff format --check` clean; `uv run mypy app/`
  clean (164 files); `tests/test_proxy_rewriter.py` 10/10 passed. `pnpm turbo run lint
  typecheck build` for web, widget and extension: 9/9 tasks passed (web lint: the 4
  existing warnings, none new), plus uncached `tsc`/`eslint` runs for widget and extension.
  Two scratch harnesses (not checked in): the generated interceptor run in a Node VM
  against a fake browser global - 25/25 rewrite-rule checks, including the widget bypass,
  double-injection guard and element rules; and `fetch_proxied_resource` driven against an
  `httpx.MockTransport` site - 16/16, covering the injected-script order, a JSON login
  POST (body intact, `Set-Cookie` namespaced and path-scoped), CSRF/UA forwarding with the
  reviewer's IP withheld, a follow-up call authenticated by bearer token plus the
  namespaced cookie with Backline's own cookie withheld, cache-header passthrough, and 50
  concurrent asset fetches.
- **Not verified:** no live browser run against a real site through a deployed stack -
  MongoDB/Redis/S3 aren't available on this machine, so `tests/test_proxy.py` and the
  Playwright journeys couldn't run. That suite is also already broken independent of this
  change: its `_FakeUpstreamClient` has no `.cookies`, which `service.py` has read since
  `916e444` (the session work), and the file hasn't been updated since before that commit.
- Open follow-ups: an API on a separate domain; WebSocket and streamed (SSE) responses;
  worker requests and CSS `url()` (still via the Referer fallback); the `?blBrowser=` page
  merge. Framed third-party SSO (Google/Microsoft/Okta) is a browser-enforced limit.

## 2026-09-26: Groq model and local environment reconciliation

- `openai/gpt-oss-120b` is the configurable default and is listed in Groq's official
  production model catalog. No API key is committed; deployment credentials belong in
  Railway and local credentials belong in ignored environment files.
- Groq's current documentation confirms limits are organization-wide. The key pool is
  for credential rotation and graceful busy handling, not quota multiplication; a 429
  now cools the whole pool and never hops organizations/accounts.
- `Settings.model_config` resolves `.env` from the backend process working directory.
  `RUNNING_LOCALLY.md` now calls out that local backend settings belong in
  `backend/.env` when starting from `backend/`.

## 2026-09-26: Groq key pool - multi-key rotation and a graceful busy state (TDR-0034)

- Follow-up to the same-day Groq migration below, before the user's key was live:
  they asked whether Groq's rate limits are per-account or per-key (Groq documents
  them as **organization-wide**), and asked for multi-key rotation with a cooldown
  and a graceful "busy, try again" response for whichever request doesn't get a key,
  regardless of the answer.
- `GROQ_API_KEY` (singular) became `GROQ_API_KEYS` (a JSON array, matching
  `CORS_ALLOW_ORIGINS`'s existing convention) backed by a new Redis-based pool,
  `backend/app/modules/ai/key_pool.py`: each concurrent AI action claims one
  configured key for the duration of its own call and releases it immediately after;
  a 401/403 cools only the rejected credential and retries another configured key;
  a 429 honors `Retry-After` and cools the organization-wide pool. A new
  `AIServiceBusyError` (503, `AI_SERVICE_BUSY`) fires when every
  key is genuinely unavailable, before any request reaches Groq - distinct from the
  existing `RateLimitedError` (per-workspace abuse throttling).
- Both existing frontend surfaces (`CommentDetail.tsx`'s "Write a reply for me",
  `CommentThreadPanel.tsx`'s "Summarize"/"Suggest Replies") now show "AI is busy right
  now - try again in a moment." specifically for that case via a new
  `aiErrorMessage()` helper in `features/ai/api.ts`, instead of the generic per-action
  failure text. `CommentThreadPanel.tsx`'s suggest-reply failure path previously had no
  visible error state at all (only `console.error`) - fixed as part of this same
  change.
- Full design rationale, including why the pool uses a call-duration lock rather than
  a fixed per-call cooldown (would spuriously show "busy" with only one key
  configured), is in TDR-0034.
- Verification: from `backend/`, `uv run ruff check .` passed clean and strict
  `uv run mypy app/` passed clean (163 source files, up one for the new
  `ai/key_pool.py`). `uv run ruff format --check app/modules/ai/ app/core/config.py`
  confirmed the new/changed files themselves are clean (the 2 files it still flags,
  `ai/router.py`/`ai/schemas.py`, are the same pre-existing drift noted in the
  TDR-0033 entry below, not touched here either). `pnpm turbo run lint typecheck
  build` passed 12/12 for the frontend changes (`CommentDetail.tsx`,
  `CommentThreadPanel.tsx`, `features/ai/api.ts`), same 3 pre-existing warnings as
  every prior run. No test suite was written or run, per this task's own instructions.
  No live call to Groq or Redis-backed concurrency scenario was exercised - the pool's
  claim/release/cooldown logic was verified by reading, not by running multiple
  concurrent requests against a live Redis instance.

## 2026-09-26: AI provider is Groq (TDR-0033)

- `backend/app/modules/ai/service.py`'s "Summarize" and "Suggest reply" actions were
  already real, shipped endpoints, and the frontend (`CommentThreadPanel.tsx`'s "✨
  Summarize" / "✨ Suggest Replies", `CommentDetail.tsx`'s "Write a reply for me") was
  already fully wired to them - both predate this change. What was missing was a
  configured, documented provider: the code called Gemini via a raw `os.getenv`
  read that bypassed `Settings` entirely and was never added to either `.env.example`
  file, so in this deployment every call fell through to the canned placeholder text.
- Per the open decision flagged in `docs/implementation/slack-ai-mcp-architecture.md`
  §0, the user chose Groq (not Gemini or Claude).
  `ai/service.py` now calls Groq's OpenAI-compatible chat completions API directly
  over `httpx` (no new SDK dependency); `groq_api_keys`/`groq_model` were added to
  `Settings` following the existing empty-array-disables convention, and documented
  in `.env.example`, `.env.production.example`, and `DEPLOYMENT.md` Part 8.7. See
  TDR-0033 for the full decision record, including why a genuine upstream failure now
  raises `ExternalServiceError` (502) instead of an unhandled exception.
- Not in scope, and not touched: `AiTab.tsx` ("BugHunt AI") is a different, unbuilt,
  page-wide multi-comment analysis surface with no backend endpoint, tied in the
  reference HTML to a fake AI-credits system (`CREDITS`/`spendCredit()`). It remains
  the honest "Coming soon" placeholder noted in the 2026-09-08 entry below.
- Verification: from `backend/`, `uv run ruff check .` passed clean (162 files); strict
  `uv run mypy app/` passed clean (162 source files). `uv run ruff format --check .`
  flagged 13 files as needing reformatting, none of them touched by this change
  (pre-existing drift - `ai/service.py` itself is not in that list). From the repo
  root, `pnpm turbo run lint typecheck build` passed 12/12 tasks (0 cache hits, fresh
  run); the only lint output is the same three pre-existing warnings unrelated to this
  change (`ProjectOverviewPage.tsx` exhaustive-deps, two fast-refresh-only-exports
  warnings), and the `web:build` >500 kB chunk warning is the same pre-existing one
  noted in the 2026-09-09 entry above. `SummarizeResult`/`SuggestReplyResult` were not
  touched, so no `packages/types` regeneration was needed. No test suite was written or
  run, per this task's own instructions. No live call to Groq was made as part of
  verification - the key is supplied by the user outside this session.

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

## 2026-09-27: Client bug report - set-password from OTP flow, login UI fixes (TDR-0037)

Fixed six items from a client bug report against the sign-in/sign-up/forgot-password
screens (screenshots reviewed via the reported Google Doc):

- Added `POST /auth/password` (authenticated, 204): sets/replaces the caller's own
  password, reachable only after an OTP verify. `LoginPage`'s code-verification step now
  offers a "Set a password" panel (with "Skip for now") instead of navigating straight
  in. Closes both "update my password after the code" and "let a Google/OTP member
  create a first password" - same gap, same fix; see TDR-0037 for why the signup 409
  collision itself is unchanged.
- Fixed the double focus outline on login password/email fields (`.lg-f
  input:focus-visible`, previously a separately-darkened border plus an offset outline
  from the global rule).
- Wired up the previously-inert `.lg-caps`/`.capson` CSS: a Caps Lock badge on password
  fields (sign-in, sign-up, set-password), via `getModifierState("CapsLock")`.
- Replaced the signup password field's native `minLength` validation bubble with the
  app's own `.lg-err` message (`Use at least 12 characters.`), matching what the backend
  already enforces.
- Added spacing between an error message and the button that follows it (`.lg-err`
  `margin-bottom`), and centered the error icon on the message text instead of a
  flex-start + manual offset hack.
- Regenerated `packages/types/openapi.json` and `src/openapi.ts` for the new endpoint.

Merged `main` (which had landed TDR-0034's account-settings password/email change,
`has_password`, and the one-session-per-member model one day before this branch
started) back into this branch: only `docs/implementation/06-delivery.md` conflicted
textually (both sides appended a dated entry), resolved by keeping both, main's first
chronologically. The two password endpoints coexist by design (see TDR-0037's updated
Decision section); after `POST /auth/password` succeeds, the frontend now also patches
the in-memory user's `has_password` so TDR-0034's account-modal copy doesn't go stale
until the next token refresh. `packages/types` was regenerated fresh post-merge rather
than trusted from the text-level auto-merge, and produced an identical result.

Passed (post-merge, full tree): backend `ruff check app/` (166 files) and strict `mypy
app/` (166 files); `scripts/check_workspace_scoping.py` (19 repository files); frontend
`eslint .` (0 errors, pre-existing warnings unrelated to this change), `tsc -b
--noEmit`, and `vite build`. No test suite was written per this task's own instructions
(Claude Code: verify via lint/typecheck/build only). No interactive browser/E2E run,
database migration, or production deployment is claimed.

## 2026-09-26: Design parity slices - tickets, account/sessions, shell, card hover (TDR-0033, TDR-0034)

- **2026-09-26 Tickets design parity (design/index.html)**:
  - New ticket dialog rebuilt to the design: two-column fields, "Page or file" picker,
    single assignee/tag selects, and real screenshot uploads (TDR-0033: additive
    `TicketCreate.page_id` + `attachments`, both scope-checked).
  - List rows and the table use the design's status pill, mono priority chip, outlined
    tags and colored due text. Status (list and table), priority and due date (table)
    stay editable inline through the pills. The list no longer has a priority select;
    the colored bar shows priority, as in the design.
  - Assignee filter's empty state reads "All" instead of "Anyone".
  - Project card hover overlay lightened.
  - Verification: web `tsc --noEmit`, `eslint` (no new warnings) and `vite build`
    passed; backend `ruff check`/`ruff format` and `mypy` on `app/modules/dashboard`
    passed. Not run in a browser; no E2E run is claimed.

- **2026-09-26 Account, sessions and shell polish (design/index.html)**:
  - Account modal rebuilt to the design (Profile / Notifications / Security tabs):
    photo upload/remove, first/last name, email change confirmed by a code sent to the
    new address, password change. One active session per member: signing in elsewhere
    signs the other device out (TDR-0034). Language picker removed; app pinned to English.
  - Projects: Web App / Mobile App tabs show the design's in-page coming-soon panel
    instead of a modal (no notify button or target dates, per M-22).
  - Project settings footer regains its bottom padding; the rail and main column scroll
    without visible scrollbars; one shared hover (ink + underline) for text links.
  - Verification: web `tsc`, `eslint` (0 errors), `vite build`; backend `ruff check .`,
    `mypy app` passed. Not exercised in a browser; no E2E run claimed.

- **2026-09-26 Tickets and project card follow-ups**:
  - Resolved / won't-fix tickets sort below open ones under every sort (API pipeline
    `_closed` key, mirrored optimistically in the list) and render struck through.
  - Ticket ID badge restyled with its own fixed-width column in the list.
  - Tickets can be deleted from a list/table row (hover trash) or the ticket detail,
    with confirmation, through the existing thread moderation endpoint (`comment:delete`).
  - Project card hover rebuilt to the design: Duplicate + Share glass buttons beside
    the ⋯ menu (the gear "brightness" button is gone), white "Open Project" with an
    external-link icon and mint hover, URL + mint access badge.
  - Verification: `tsc -b`, eslint (0 errors), `vite build`; backend ruff + mypy on
    `app/modules/dashboard`. Not exercised in a browser.

- **2026-09-26 Tickets toolbar to design (#37a9, #37a7, #37a1)**:
  - Sort / Group / "Show work for" rebuilt to design's tsortPop / tgrpPop / whoPop:
    ghost buttons, SORT BY / GROUP BY labels, mint ticks, "Group: …" label; the people
    picker is multi-select (checkboxes, person marks, per-person counts, Unassigned,
    Clear / Done) and the button shows stacked faces or "N people".
  - API: `TicketFilters.assignees` (repeatable; any-of, incl. "unassigned"; the single
    `assignee` still works), new `assignee` / `tag` sorts, and `TicketListOut.assignee_counts`
    + `total_any_assignee` computed over the same filters minus the people filter.
  - #37a1 (page + screenshot in New ticket) was delivered in the earlier New ticket slice.
  - Verification: `tsc -b`, eslint, `vite build`; ruff + mypy on dashboard. The new
    aggregation was not run against MongoDB (none available locally).

- **2026-09-26 Design parity, area 1 - rail, topbar, search, notifications**:
  - Rail: workspace switcher at the top (ink/mint mark, "N projects · M people",
    up/down switch icon); design nav icons, "All tickets" label, ink active state with
    mint counts, mint "hot" count on Assigned to me; mono section labels; plan card in
    the design's style. The Backline brand row is gone (not in the design).
  - Switcher popover: SWITCH WORKSPACE label, lettered marks, role sub-line, tick on the
    current workspace, "Create workspace" row that reveals the form.
  - Topbar: design order (bell, New project, account); square initials/photo account
    button opens the Account modal directly (sign-out is inside it); design search copy
    and "/" hint; search results as icon tile + title + mono sub-line.
  - Notifications: mint unread dot instead of a number badge; rows with actor initials,
    bold actor name, mono relative time, mint tint when unread.
  - Kept on purpose: the WORKSPACE nav group (members, integrations, extension,
    settings) and the theme toggle, which the design has no place for; the plan card
    shows the real project count instead of the design's "2 / 3" meter (no plan limits
    exist).
  - Verification: `tsc -b`, eslint (0 errors), `vite build`. Not checked in a browser.

- **2026-09-26 Project card hover flicker**:
  - Hover no longer moves the card (a lifted card slid out from under a cursor near
    its edge and oscillated) and the overlay no longer uses backdrop-filter over
    scaling artwork (repainted every frame and flashed in Chrome). Hover is now the
    design's border + shadow change with a .13s opacity fade on a flat scrim.
  - Verification: `vite build` passed. Not checked in a browser.
# 2026-09-29: Authenticated native browser review (TDR-0048)

- Implemented one-click project-bound browser review for members and guests, using
  the real signed-in website tab, extension toolbar, server-side comments, page
  registration and native visible-tab screenshots. Retired the misleading cookie-sync
  control and cloud-login entry point; removed extension cookie permission.
- Verification completed locally: web/widget/extension typecheck, lint and production
  builds; 10 worker protocol checks (project/guest scope, OAuth origin, screenshot
  tab switch, upload, service-worker restart); isolated DOM toolbar/annotation checks.
- Full browser/API journey (password login, provider redirect, member/guest posts,
  screenshot upload and SPA page change) is checked in and ready to run against an
  isolated Mongo/Redis/S3 stack. It is **pending**, since this execution environment
  forbids Chromium/MongoDB sockets and the permission escalation was rejected.
  The owner declined a GitHub Actions gate; the temporary workflow was removed.
  Do not mark the feature production verified on the basis of the local checks.
