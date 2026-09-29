# TDR-0046: Every integration and MCP client works without operator setup

Date: 2026-09-29
Status: Accepted

## Context

The user asked for "all integrations and all the MCPs set up and working", with anything
that needs their input skipped, so that as much as possible works without them.

State before this change:

- Slack (webhook URL) and Trello (key + token) worked.
- ClickUp, Jira and Asana could only connect through OAuth apps. Their client IDs and
  secrets are blank in every environment file, so the "Continue" buttons led to broken
  authorize URLs.
- Destinations (a Trello list, a Jira project key, an Asana project GID) had to be typed
  in as raw IDs.
- "Send to …" existed only on the legacy Board page, which the current UI no longer links
  to. Its results were kept in component state and lost on reload.
- Tracker backlinks pointed at `/p/{project}/board`, a route that no longer exists.
- `GET /integrations` required owner/admin, so members could not see the trackers they're
  allowed to send to.
- Both `.env` files set `INTEGRATIONS_ENCRYPTION_KEY=` to an empty string. That overrode the
  dev default, and every connect that stores a credential failed locally.
- The MCP server had one tool (`generate_implementation_prompt`).
- The URL the MCP page handed out, `…/mcp`, fell through to the proxy's catch-all route
  instead of reaching the MCP app, which is mounted at `/mcp/`.
- MCP tokens never re-checked the owner's workspace membership.

## Decision

**Token-first integrations.** Every provider connects with credentials the admin pastes:

| Provider | Credential |
| --- | --- |
| Slack, Discord, Microsoft Teams | Webhook URL |
| Signed webhook (Zapier, Make, n8n, custom) | HTTPS URL; signing secret generated and shown once |
| Trello | Key + token |
| ClickUp | Personal token |
| Jira Cloud | Site + email + API token |
| Asana | Personal access token |
| GitHub | Fine-grained or classic token |
| GitLab (gitlab.com or self-managed) | Access token |
| Linear | Personal API key |

OAuth stays for ClickUp/Jira/Asana. `GET /integrations/oauth-apps` offers it only when
that provider's client ID *and* secret are configured. The authorize URL is built
server-side from the same redirect URI the code exchange sends, which retires the
`VITE_*_OAUTH_CLIENT_ID` variables. Existing OAuth connection documents keep working
unchanged: the auth mode is inferred from which encrypted field is present.

**Destinations are picked, not typed.** Trackers connect without a destination.
`GET /integrations/{id}/destinations` lists what the credential can reach (Trello
boards/lists, ClickUp spaces/folders/lists, Jira projects, Asana projects, GitHub repos,
GitLab projects, Linear teams). `PATCH /integrations/{id}` accepts only an ID from that
list.

- For Jira it also stores an issue type that exists in that project (Task, then Bug, then
  Story, never a sub-task). Older connections keep asking for "Task".
- The destination is stored under each provider's original config key, so legacy
  documents read unchanged.

**One unified send, once.** `POST /comments/{id}/integrations/{integration_id}/send` files
any comment in any tracker:

- It records the result in a new `integration_links` collection, with a unique index on
  (workspace, comment, connection).
- The send claims that row *before* calling the tracker. A double click, two members, or
  an agent retry therefore resolves to one ticket.
- A failed call releases the claim, and a claim stuck pending for 2 minutes can be taken
  over.
- Links are served by a member-only endpoint, not on `CommentOut`. Guests and the guest
  realtime channel also receive `CommentOut`, and clients shouldn't see the agency's
  tracker URLs.
- The four per-provider endpoints remain as wrappers.

The comment drawer gains "Send to tracker" and a "FILED IN" row.

**Notifications.**

- Slack, Discord, Teams and webhooks share the existing Arq dispatch and 5s/30s/5min retry
  engine.
- All of them honour the team-only opt-in and the per-project mute (the
  `slack_notifications_enabled` key now mutes all four).
- Messages carry a working backlink (`/w/{slug}/tickets?comment={id}`).
- Slack text is escaped: a client could previously ping a channel with `<!channel>`.
- Discord sends `allowed_mentions: {parse: []}`.
- Webhooks are signed with HMAC-SHA256 over `<timestamp>.<body>`.
- Admins get "Send test"/"Check" and editable toggles.

**SSRF.** Webhook URLs, Teams URLs, Jira sites and self-managed GitLab URLs are validated
at save time. Webhook and GitLab URLs are also resolved and checked right before every
request, with redirects off. A tracker's credentials are never sent to the storage host
serving a screenshot: screenshots are fetched with a separate, header-less client.

**MCP.** The server now exposes:

- Tools: `list_projects`, `list_tickets`, `get_ticket`, `generate_implementation_prompt`,
  `reply_to_ticket`, `update_ticket`, `send_ticket_to_tracker`.
- Prompt: `fix_ticket`, which shows up as a slash command in Claude Code.
- Tickets can be addressed as `#12`, an ID, a reply's ID, or a dashboard link.

Access and safety:

- Tokens are read-only or read & write (`backline:read`/`backline:write`); older tokens
  read as read-only.
- Every request re-reads the owner's membership. Removal, or a role without team access,
  cuts access immediately.
- Writes also need the member's own role permission.
- Tool calls are rate-limited per token (`MCP_TOOL_RATE_LIMIT_PER_MINUTE`, default 120).
- Replies share the dashboard's reply rate-limit bucket.
- Replies default to team-only.

A small ASGI rewrite serves bare `/mcp` without a redirect. The MCP page shows
copy-paste setup for Claude Code, Cursor (with an install link), Codex, Antigravity,
VS Code (with an install link), Claude Desktop (through `mcp-remote`), Windsurf, Gemini CLI
and any Streamable-HTTP client.

**Smaller fixes.**

- A blank `INTEGRATIONS_ENCRYPTION_KEY` now means "unset": the dev default locally, and a
  startup refusal elsewhere, as before.
- Members may list integrations; connecting and changing them stays owner/admin-only.
- Unreadable provider responses become a 502 naming the provider, not a raw 500.
- `refreshSession` shares one in-flight request. Under StrictMode (dev), the double-run
  restore effect sent two concurrent refreshes, which tripped reuse detection and signed
  the user out on every reload.
- A checked switch's knob is inverted in dark mode, where it was white-on-white.

## Consequences

- An operator doesn't have to register any OAuth app. Registering one only adds a button.
- `TicketFilters` gains `open_only`, and `IntegrationOut` gains `kind`, `auth_mode`,
  `destination_*`, `needs_destination` and a one-time `signing_secret`. All additive;
  `packages/types` was regenerated.
- New collection `integration_links`, plus one additive unique index.
- GitHub has no issue-image upload API, so a GitHub issue links to Backline for the
  screenshot. GitLab and Linear embed the image. If an image upload fails, the issue is
  still filed.
- Microsoft Teams URLs are accepted only from Microsoft's workflow/webhook hosts. A
  sovereign-cloud tenant would need its host added.
- Not verified here: live calls to any real provider (all were exercised against mocked
  APIs), real OAuth consent screens, and each agent client's own config parser against
  the published snippets.
