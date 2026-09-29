# TDR-0051: Contextual page titles and project sub-route navigation

Date: 2026-09-30 (first drafted 2026-09-29)
Status: Implemented; verified by lint/typecheck/build

## Context

- **Titles.** Browser tabs named only the page ("Tickets — Backline"), so tabs for two
  workspaces or projects looked the same. The canvas, board, guest review, 404, sign-in
  callback and integration OAuth callbacks set no title at all.
- **Navigation.** The board (`/w/:slug/p/:id/board`) had no way back to its project.
  The share-link manager's back link said only "Back to project". Neither page could be
  reached from the canvas or the project menu. The board was only reachable from
  Activity, notifications and search.

This was first drafted on `feature/standardize-routes-titles-navigation` as TDR-0048.
That number belongs to the native browser review record on `main`, and 0050 belongs to
the illustrations work (PRs #43 and #44), so this record is 0051.

## Decisions

**One title format.** `useDocumentTitle` takes a single title or context-first
segments. Segments are joined with " · " and followed by " — Backline". Blank or
missing segments are trimmed away, so `[project?.name, "Board"]` reads
"Board — Backline" until the project loads, with no loading guard at the call site. As
before, the previous title comes back on unmount.

| Route | Title |
| --- | --- |
| `/w/:slug` | `{workspace} · Projects`, or `· Archived Projects` with `?archived=true` |
| Workspace pages | `{workspace} · Tickets`, `Clients`, `Activity`, `AI Usage`, `MCP Server`, `Members`, `Billing`, `Settings`, `Integrations`, `Browser Extension` |
| `/w/:slug/p/:id` | `{project} · Review` (website canvas and asset review) |
| `/w/:slug/p/:id/board` | `{project} · Board` |
| `/w/:slug/p/:id/share-links` | `{project} · Share Links` |
| `/review/:token` | `{project} · Review` |
| `/login`, `/auth/callback` | `Sign in`, `Signing in` |
| `/integrations/*/callback` | `Connecting ClickUp`, `Jira` or `Asana` |
| Unknown route | `Page Not Found` |

- **Guest title.** It uses only `project_name` from the share-link resolve response,
  which the guest entry screen already shows, so no team content is exposed.
- **Sign-in title.** Sign-in uses a plain "Sign in". Reusing the "Sign in to Backline"
  heading read "Sign in to Backline — Backline" in the tab.
- **Language.** Titles are English literals, like the rest of the titles:
  `lib/i18n.ts` loads only English.

**One project query.** `features/projects/use-project.ts` is now the single definition
of the `qk.project(id)` query. The canvas, board and share-link pages all use it, so
moving between them reuses the cached project instead of each page declaring its own
copy.

**Navigation between a project's routes.**
- **Board header:** a "← Back to {project}" link to the canvas.
- **Share links:** the back link names the project.
- **Back-link styling:** both back links share `.bl-back-link`, which ends a long name in
  an ellipsis. Names allow 200 characters. The width cap is `min(60ch, 100vw − 72px)`
  rather than a percentage. The header is a flex item, and a percentage `max-width` is
  ignored when that item's intrinsic width is measured, so a long name would still
  overflow a phone.
- **Project ⋯ menu** (project cards, table rows and the canvas header):
  - "Manage share links" sits after "Copy review link", with the other sharing actions.
  - "Ticket board" sits before "Manage pages".
  - Both are disabled for archived projects, like the other items that open a project.
    An archived project's canvas is a restore gate.
- **Canvas side panel, Details tab:** "Open board →" and "Share links →".

**No route or URL changed.** The route tree already followed `/w/:slug/...` and
`/w/:slug/p/:id/...`, so bookmarks and the links in notifications, search and Activity
are unaffected.

## Review of the first draft

The branch's first commit was checked against `main` and cleaned up before merge:
- **Main merged, twice.**
  - First merge: 6 commits, including TDR-0048 and TDR-0049, with no conflicts.
  - Second merge, after PRs #43 and #44 (TDR-0050) landed: `NotFoundPage.tsx` and
    `UsagePage.tsx` conflicted only on adjacent imports. Both sides were kept, and
    `ChartIcon` was dropped where `main` had replaced it with `UsageChartArt`.
- **TDR renumbered** to 0051, as above.
- **Sign-in title.** The draft record promised "Sign In — Backline", but the page still
  rendered "Sign in to Backline — Backline". It now reads "Sign in — Backline".
- **Styles.** Inline styles on the board back link and the Details-tab links were
  replaced with `.bl-back-link` and the Tailwind utilities that file already uses.
- **Board header props.** The props are now required. The board always passes them, so
  the optional props and their render guard were dead code.
- **Project query.** The draft had three copies of the project query; they are now one
  hook.
- **Title hook.** It now trims segments before joining them.

## Not changed

- **Workspace picker** keeps its "Your Workspaces" title.
- **Playwright spec.** The first draft's `apps/e2e/tests/navigation-titles-routes.spec.ts`
  is kept. It was written under the Antigravity instruction in `AGENTS.md`. It compiles
  and lists, but it was not run here (no local MongoDB/Redis).

## Verification

See the 2026-09-30 "Contextual page titles and project sub-route navigation" entry in
`docs/implementation/06-delivery.md`.
