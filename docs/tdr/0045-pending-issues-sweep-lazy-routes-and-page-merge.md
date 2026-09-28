# TDR-0045: Pending-issues sweep - lazy page routes and the canvas-parameter page merge

Date: 2026-09-29
Status: Accepted

## Context

The user asked for the pending issues to be worked through and solved. The repository has
several generations of "pending" lists: the 2026-09-09 master-audit rows, the 2026-09-13
production-readiness master plan, and follow-ups named at the end of recent ledger entries.
Each was re-checked against current source before anything was changed. Most of the older
lists are stale: the calendar `Today` control, ticket drag-and-drop, Jira/Asana
integrations, the MCP server, the placeholder-page treatment (G4), the per-project Slack
opt-out and the "project updated" Slack event all exist now. The items still live were:

1. `@backline/extension` typecheck failed in `content-script.ts` (noted as pre-existing in
   TDR-0041's entry). It was a real bug, not only a type error: `openComposer` resolves a
   boolean to decide whether to close, and the extension's callback returned nothing, so
   its composer never closed after a successful post.
2. Four web lint warnings. One was a real stale-closure bug: the canvas hotkey listener
   (`ProjectOverviewPage.tsx`) captured `setMode`/`goToPage`, which rebuild the URL through
   react-router's `setSearchParams` - and that closes over the `searchParams` of the
   render that created it. Pressing C/D/V or an arrow key after changing zoom, viewport or
   stage width wrote the old values back into the URL.
3. Ten backend files failed `ruff format --check`.
4. The web build's single 1.2 MB JavaScript bundle (the ">500 kB chunk" advisory every
   ledger entry since 2026-09-07 has carried).
5. TDR-0035's open follow-up: pages registered before that fix carry the canvas's
   `?blBrowser=` (and earlier `blMode`) parameter, so one real page appears several times
   in a project, with its comments split between them.
6. `UsagePage` still said Backline had "no configured AI provider, analysis jobs" after
   TDR-0033/0043 shipped real Groq-backed AI.

## Decision

- **Items 1-3, 6:** fixed directly. The extension callback returns `true`/`false` like the
  widget's and also shows ticket numbers on its pins. The hotkey listener reads the latest
  `setMode`/`goToPage` through a ref. Shortcut data (`shortcuts.ts`) and the browser list
  (`footer/browsers.tsx`) moved out of their component modules. The formatting was
  applied without code changes. The Usage page copy now says the AI actions work but their
  use isn't recorded.
- **Item 4: every page route loads lazily** through react-router's `lazy` route property,
  which the data router already in use supports. This needs no Suspense boundaries, and
  `RouterProvider`'s `fallbackElement` shows the existing `LoadingScreen` for the first
  route. Layouts (`WorkspaceLayout`, `ProjectLayout`) and the auth guard stay eager.
  Result: the entry chunk fell from 1,218.77 kB to 400.65 kB (357.66 kB to 127.44 kB
  gzip). pdf.js now ships only in the chunk shared by the canvas and asset review.
- **Item 5: a dry-run-first merge script**, `backend/scripts/migrate_canvas_param_pages.py`,
  instead of any automatic startup change. Pages are grouped by project and by the URL
  registration produces today (only the `blBrowser`/`blMode` query segments are removed,
  the rest kept byte-for-byte because both old and new registration serialize with
  `URLSearchParams`).
  - When that URL already has a page, each duplicate's comments, revisions, revision
    diffs and browser renders move onto it, and the emptied duplicate is deleted.
  - Otherwise the oldest duplicate is renamed in place and the rest merge into it.
  - Each duplicate moves in its own transaction. Before deleting, the transaction
    re-counts every collection that references the page (without the workspace filter, so
    a legacy record missing `workspace_id` blocks the delete rather than being orphaned),
    the same guard `delete_page` uses.
  - A duplicate's current revision is demoted when the surviving page already has one
    (`revisions_page_current_unique`).
  - A duplicate that has an uploaded asset, or a browser render colliding with the
    survivor's on browser and viewport, is skipped and reported. Events, stored objects
    and indexes are never touched.
- **Not built: the `webhook_events`/`webhook_deliveries` tables** proposed in
  `slack-ai-mcp-architecture.md` §3. That proposal was written when a failed Slack POST
  was never retried. Retries have since shipped: `workers/integrations.py` retries at 5s,
  30s and 5min, then dead-letters to an event and notifies whoever connected the
  integration (spec §17.7). A second delivery table would duplicate that. It is still the
  right shape if custom outbound webhooks are ever built.
- **Not repaired: `tests/test_proxy.py`.** Its fake replaces `httpx.AsyncClient` wholesale
  and predates the SSRF DNS guard, the shared transport and preview origins, so a repair
  is a redesign of the fake that could not be run here (no MongoDB/Redis). Per this repo's
  Claude Code instruction, no test suite was written or rewritten.

## Consequences

- The first page visited downloads about a third of what it did. Navigating to a page not
  yet visited fetches its chunk; the current page stays on screen until it arrives.
- The merge script has to be run by someone with production access: first without
  `--apply`, reviewing the JSON report, then with it. Transactions need a replica set,
  which production already requires for `delete_page`. Re-running it is a no-op apart from
  re-reporting skipped duplicates.
- Duplicates skipped for an asset or a render conflict stay visible until handled by hand.
  Neither is expected: website projects have no uploaded assets, and browser renders are
  requested for the dashboard's selected page, not the widget-registered duplicate.
