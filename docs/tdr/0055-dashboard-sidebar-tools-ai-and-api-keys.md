# TDR-0055: Dashboard sidebar groups, AI page and API keys

Date: 2026-10-01
Status: Implemented; verified by lint/typecheck/build and a browser pass

## Context

`feature/dashboard-sidebar-updates` (commit d9041bd) added a collapsible TOOLS group to
the workspace rail, new `/ai` and `/keys` pages, and renamed `/extension` to
`/extensions` with a redirect. A review of that commit against `main` found:

- **Orphaned pages.** Members, Settings, AI Usage and MCP Server were only reachable by
  typing the URL. Billing was reachable only through "Compare plans". Their rail icons
  were still in `sidebar-icons.tsx` but unused.
- **Wrong "current page".** The rail used `NavLink`, which matches on the pathname only.
  On `/tickets`, "Assigned to me", "All tickets" and every status link all had
  `aria-current="page"`. "Projects" (`to=/w/:slug`, no `end`) had it on every
  workspace page.
- **AI page.**
  - Every capability was hard-coded "Active", even with AI unconfigured or out of
    credits.
  - "Usage" showed project and ticket counts, not AI usage.
  - It exposed the `GROQ_MODEL` server variable and told members to ask an admin to
    change the model, which no admin can do in the product.
  - The "where to find it" copy was wrong: Summarize is on the board, not in the
    comment drawer.
- **API Keys page.**
  - It claimed its keys authenticate MCP agents. MCP uses a separate token type
    (`modules/mcp`) that this page never listed.
  - It said it "unifies" extension and MCP tokens but only handled extension tokens.
  - It duplicated `ExtensionSettingsPage` line for line, including inline styles.
- **Collapsible groups.**
  - Open/closed state reset on every load.
  - A group stayed collapsed while its page was open, which hid the highlighted link.
  - The chevron pointed up when a group was open.
  - The toggles had no `aria-controls`.
- **Icons.** The new Integrations icon drew an "N" in a box, and the Key icon's path
  was malformed.
- **Tests.** `journey-9` still visited the old `/extension` URL.

## Decisions

**Rail structure.** The design's order is kept: the main links, then Comments by status,
then Projects. Two groups follow:

| Group | Links |
| --- | --- |
| Tools | Integrations, Extensions, MCP server, AI, API keys |
| Workspace | Members, AI usage, Billing, Settings |

All workspace routes now have a rail entry. Role enforcement is unchanged: each page and
endpoint still applies its own permission.

**One "current" link.**
- The rail renders plain `Link`s.
- Highlighting and `aria-current` come from the same query-aware flag.
- Sub-pages match by pathname prefix.

**Collapsible groups.**
- **Storage.** Open/closed state is a per-browser display preference in `localStorage`
  (`backline_rail_sections`), read and written inside try/catch, like `use-theme.ts`.
  It holds no workspace data.
- **Opening on landing.** Arriving on a page inside a collapsed group opens that group.
  Collapsing it again while on that page is respected.
- **Collapse behaviour.** Groups stay mounted and animate their grid rows. The closed
  state becomes `visibility:hidden` once the transition ends, which takes its links
  out of the tab order.
- **Chevron.** It points down when a group is open and right when it is closed.

**AI page reads the AI-usage ledger.**
- **Data.** `/ai` calls the existing `GET .../billing/ai-usage` endpoint, the same data
  the plan limit is enforced from.
- **Status chip.** It shows one of three states: Ready, Paused (credits used up) or
  Not connected (no Groq keys).
- **Credits.** A meter shows credits used against the plan limit and the reset date.
- **Features.** Each feature shows this month's count and the exact button that
  triggers it. The page links to `/usage` for the full breakdown.
- **Removed.** Server configuration details are no longer shown.
- **Artwork.** `AiSummaryArt` (a thread condensing into a summary card) follows the
  TDR-0050 illustration rules: theme tokens only, and every animation ends on its
  resting frame.

**API keys page is a real single view.**
- **Two credential types.** "API key" means an extension token.
  `get_current_session` accepts one as a Bearer token on every member endpoint, so
  one key serves both scripts and the browser extension. MCP tokens are listed next
  to API keys with their access level and client, newest first, and can be revoked
  here.
- **Creating MCP tokens.** They are still created on `/mcp`, which generates the
  setup for each client.
- **Example request.** The page shows a copyable `curl` call to
  `/extension-tokens/whoami`, filled in with the new key once one is revealed.
- **Styles and empty state.** Inline styles were replaced with the existing
  `bl-int-*`/`bl-mcp-*` classes. The empty state uses a new `EmptyArt kind="keys"`
  scene.

**Routes.** `/extensions` and the legacy `/extension` redirect are kept as the branch
added them. `journey-9` now visits `/extensions` directly.

**Tickets filter chip.** This bug predates the branch and was found during the browser
pass. An unknown `?status=` value (a typo'd or old link) rendered a blank chip with
an `undefined` React key. The chip now falls back to the raw value, so it can still be
read and cleared.

## Not changed

- **Backend.** No backend, API contract or database change. `packages/types` was not
  regenerated.
- **Browser Extension page.** `ExtensionSettingsPage` is unchanged apart from its URL.
- **Tests.** No new test suites (Claude Code instruction in `AGENTS.md`). The branch's
  edits to `navigation-titles-routes.spec.ts` are kept. The page titles it asserts
  still hold: `· AI` and `· API Keys`.

## Verification

See the 2026-10-01 "Dashboard sidebar groups, AI page and API keys" entry in
`docs/implementation/06-delivery.md`.
