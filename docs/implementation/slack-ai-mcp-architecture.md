# Slack + AI/MCP integration architecture (MASTER_PROMPT.md Part 12)

**Date:** 2026-09-11. As with the backend completion plan, this corrects
`MASTER_PROMPT.md`'s assumption that this is greenfield planning — the Slack piece is
substantially built, and there are genuinely **two different, unrelated "AI" features**
in this codebase that the prompt's Part 10/12 conflate. This doc separates them and
scopes only what's actually still needed.

## 0. Two different "AI" surfaces — don't conflate them

1. **`backend/app/modules/ai/`** — real, shipped, Gemini-backed (`google.genai`,
   `GEMINI_API_KEY`, model `gemini-2.5-flash`). Two endpoints:
   `POST .../comments/{id}/ai/summarize` and `.../ai/suggest-reply`. Surfaces in
   `apps/web/src/features/projects/panel/AiTab.tsx`. This is a **thread-summarization
   /reply-drafting assistant**, not the MCP/agent-connector feature below.
2. **`McpTab.tsx` / `McpServerPage.tsx`** — honest UI stubs ("Connect" → toast/modal,
   no real OAuth) for **external coding-agent connectors** (Claude, Cursor, Codex,
   Antigravity) that would let *the user's own agent tooling* pull Backline feedback
   and push code. This is the feature Part 12 is actually asking to architect — it
   does not exist yet, and is unrelated to the Gemini summarizer.

### Provider decision needed from the user

**Resolved 2026-09-26, see [TDR-0033](../tdr/0033-groq-ai-provider.md):** the user chose
Groq, not Gemini or Claude. `ai/service.py` now calls Groq directly over `httpx`. The
paragraph below is left as-is for historical context on why this was flagged.

`MASTER_PROMPT.md` itself says: *"pick a provider (default recommendation: Claude...) -
do NOT default to OpenAI/Gemini without the user confirming."* The already-shipped
`ai/service.py` defaults to **Google Gemini**, which is the opposite of that
instruction. This was evidently decided in the same commit that added the prompt
(`e86227e`), before anyone re-read the prompt's own guidance. This pass did not
change it — swapping SDKs on a shipped, working endpoint is a real product/infra
decision (new API key/billing, different response shape/latency/cost), not something
to silently flip. **Flagging for the user to decide:** keep Gemini as-is, migrate
`ai/service.py` to the Claude API (Messages API, e.g. `claude-sonnet-5`) to match the
prompt's own stated preference and this being an Anthropic-tooled codebase, or run
both behind a per-workspace setting.

## 1. Slack — mostly built, matches the "outbound alerts only" ask already

Current (`backend/app/modules/integrations/slack.py`, `router.py`, spec §17.2):
- Incoming webhook only, no OAuth authorize flow — the admin pastes a webhook URL
  from Slack's own app directory. Spec §17.2 documents this as deliberate ("no app
  review needed for MVP"), and it already matches Part 12's ask exactly.
- Events wired: `on_comment_created`, `on_status_changed` (team-layer opt-out via
  `notify_team_layer`, off by default per §17.2's private-channel warning).
- Per-workspace config stored via the shared `integrations` collection
  (`type: "slack"`, `config_summary` never exposes the raw webhook URL to the
  frontend).

**Real gaps** (both genuinely unbuilt, confirmed via repo-wide search):
- **No delivery/retry table.** A failed Slack POST just fires a
  `WEBHOOK_DELIVERY_FAILED` activity event — nothing re-attempts it. See §3's shared
  schema below.
- **No per-project/per-user notification opt-out** beyond the single
  workspace-level `notify_team_layer`/`notify_status_changes` toggles set at connect
  time — there's no "mute this project's Slack notifications" or "don't notify me
  personally" control.
- **"Project updated" events aren't wired** — only comment-created and
  status-changed fire today (confirmed via `integrations/events.py` +
  grep for `on_comment_created`/`on_status_changed` call sites; no
  `on_project_updated` exists).

Proposed additions:
```
project_notification_prefs
  _id, project_id, workspace_id
  slack_enabled: bool (default true, inherits workspace config unless set)

member_notification_prefs   (already may overlap with notifications/digest.py's
                              per-member prefs - check that module first before
                              adding a parallel table)
  _id, user_id, workspace_id
  mute_slack: bool
```
Add `on_project_updated(project, config)` to `SlackIntegration`, call it from
`projects/service.py`'s update path (mirrors the existing `on_status_changed` call
site pattern in `comments/service.py` / tickets status-change path).

## 2. AI MCP tool (the actually-unbuilt piece)

Scope: let a user's own AI agent (Claude Code, Cursor, Codex, Antigravity — the four
already listed in `McpTab.tsx`/`McpServerPage.tsx`) authenticate once, then pull a
structured "implementation prompt" generated from a comment/ticket and post back
progress.

### Request/response shape
```
POST /api/v1/mcp/connections                 - start a connector (returns an
                                                 authorization_url + state, mirrors
                                                 the existing ClickUp OAuth pattern
                                                 in integrations/service.py)
GET  /api/v1/mcp/connections                 - list this user's connected agents
DELETE /api/v1/mcp/connections/{id}          - disconnect

POST /api/v1/comments/{id}/mcp/generate-prompt
  -> { agent: "claude"|"cursor"|"codex"|"antigravity",
       implementation_prompt: str,       # the actual "fix this" prompt, built from
                                          # comment body + thread + anchor context +
                                          # screenshot URL, same _get_thread_context
                                          # shape ai/service.py already builds
       suggested_files: [str] | null,    # best-effort, provider-dependent
       structured_plan: { steps: [str] } | null }
```
Surfaces as a "Generate implementation prompt" action on a comment/ticket (next to
the existing AI summarize/suggest-reply actions in `AiTab.tsx`/`CommentRow.tsx`),
distinct from those two - this one is meant to be copy-pasted into (or, once
connected, sent directly to) the user's own agent session, not shown inline in
Backline's UI as the final answer.

### Auth model
Each of the four target tools already exposes a way to receive an external prompt:
Claude via the Agent SDK / a project's own MCP server config, Cursor/Codex/
Antigravity via their own extension APIs. Rather than Backline holding credentials
for the *user's* agent tooling (backwards from every other integration in this repo,
which stores *Backline's* credentials to post *into* Slack/ClickUp/Trello), the
realistic v1 is **not OAuth at all**: generate a personal access token
scoped to `comment:read_own_workspace` + `mcp:generate_prompt` (mirrors the
"Personal access token" section already stubbed as "coming soon" in both
`McpTab.tsx` and `McpServerPage.tsx`), which the user pastes into their own tool's
MCP server config pointing at a Backline-hosted MCP server. That MCP server is a
thin wrapper over the `generate-prompt` endpoint above. This avoids inventing a
fake "OAuth flow" for tools that don't have a Backline-facing OAuth app to review
in the first place — token storage/revocation reuses this repo's existing
Fernet-encryption pattern from `app.core.encryption`.

### Database schema sketch
```
mcp_personal_tokens
  _id, user_id, workspace_id
  token_hash (bcrypt/argon2, never store plaintext - the token itself is only ever
              shown once at creation, same UX as GitHub PATs)
  label: str            # user-given name, e.g. "My laptop - Cursor"
  agent_hint: str | null
  created_at, last_used_at, revoked_at: datetime | null
```

## 3. General webhook event system (shared by Slack retries + future connectors)

```
webhook_events           # append-only log of "something happened that might fan out"
  _id, workspace_id, type (e.g. "comment.created"), payload_json, created_at

webhook_deliveries       # one row per (event, target) delivery attempt
  _id, event_id (-> webhook_events._id), integration_id (-> integrations._id)
  target_url_hash          # never the raw URL at rest beyond the integrations doc itself
  status: "pending"|"delivered"|"failed"|"exhausted"
  attempt_count: int
  next_attempt_at: datetime | null     # exponential backoff: 30s, 2m, 10m, 1h, then exhausted
  last_error: str | null
  created_at, updated_at
```
Delivery worker: reuses whatever background-job mechanism the repo already has for
notification digests (`notifications/digest.py`) rather than introducing a new queue
system - check that module's scheduling approach first (it's the one existing
precedent for "runs periodically, not request-scoped" in this codebase).

**User-configurable custom webhook URLs** (Part 12's last bullet): add a fourth
`IntegrationType = "custom_webhook"` variant to the existing discriminated union in
`integrations/schemas.py` (`CustomWebhookIntegrationCreate{ url, secret,
event_types: list[str] }`), HMAC-sign the payload with `secret` the same way Slack's
own outgoing webhooks are conventionally verified, and route it through the same
`webhook_deliveries` retry table above rather than a separate one-off path.

## Priority for a follow-up pass

1. `webhook_deliveries`/`webhook_events` (unblocks real Slack retry reliability, and
   is a prerequisite for the custom-webhook feature).
2. MCP personal-access-token issuance + the `generate-prompt` endpoint (the smallest
   real slice of the MCP feature - ships something functional before the fancier
   "connect Cursor via its own extension API" integrations).
3. Per-project/per-member Slack notification opt-outs.
4. ~~The Claude-vs-Gemini provider decision (§0)~~ - resolved, see TDR-0033 (Groq).
