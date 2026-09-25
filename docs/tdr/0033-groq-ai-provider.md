# TDR-0033: AI provider is Groq, scoped to the two existing thread actions

Date: 2026-09-26
Status: Accepted

## Context

`backend/app/modules/ai/` already shipped two real, credential-gated endpoints -
`POST .../comments/{id}/ai/summarize` and `.../ai/suggest-reply` - and the frontend
already calls them end-to-end: "✨ Summarize" and "✨ Suggest Replies" in
`apps/web/src/features/board/CommentThreadPanel.tsx`, and "Write a reply for me" in
`apps/web/src/features/projects/panel/comments/CommentDetail.tsx`. None of this was
new work; it was built against Google Gemini (`google-genai`, `GEMINI_API_KEY`),
but that key was never documented in `.env.example`/`.env.production.example` and
bypassed the `Settings` pattern every other credential entirely (raw `os.getenv`),
so in practice the feature had never run against a real model in this deployment -
every call fell through to the canned placeholder strings.

`docs/implementation/slack-ai-mcp-architecture.md` §0 had already flagged this as an
open decision for the user: keep Gemini, migrate to Claude (the prompt's own stated
default), or run both. The user made the call directly: use Groq.

Separately, `MASTER_PROMPT.md` Part 10 and the reference `backline-Final Draft.html`
(`CREDITS`/`spendCredit()`, the 4-tier pricing grid's "N AI credits a month") describe
a larger, credit-metered, page-wide "BugHunt AI" panel
(`apps/web/src/features/projects/panel/AiTab.tsx`) that reads every comment on a page
and prioritizes by severity. That is a different, unbuilt feature with no backend
endpoint at all, and its credit-gating is exactly the "fake AI" pattern AGENTS.md says
to keep out of production paths. This TDR does not touch it - `AiTab.tsx` stays an
honest "Coming soon" placeholder. Building the page-wide panel and any real usage
metering is a separate, later-scoped project.

## Decision

- `backend/app/modules/ai/service.py` now calls Groq's OpenAI-compatible chat
  completions endpoint (`https://api.groq.com/openai/v1/chat/completions`) directly
  over `httpx`, the same HTTP client already used for Slack/ClickUp/Asana/Jira/Trello,
  rather than adding the `groq` Python SDK as a new dependency. Prompts and response
  parsing (bullet-list suggestions, single-paragraph summary) are unchanged from the
  Gemini version.
- New settings in `app/core/config.py`: `groq_api_keys` (an empty JSON array disables
  the provider) and `groq_model`. The default, `openai/gpt-oss-120b`, is listed as a
  production model in Groq's official model catalog as of this decision date. The
  model remains configurable because provider lineups and account access can change.
  Documented in both `.env.example` and `.env.production.example`, and in
  `DEPLOYMENT.md` Part 8.7 - none of which ever happened for `GEMINI_API_KEY`.
- A missing key still returns the same labeled placeholder result it always did
  (`"[AI Disabled] Configure GROQ_API_KEYS..."` / the three `[AI]`-prefixed canned
  suggestions) rather than an error - this is the pre-existing, correct behavior for
  "not configured yet," unchanged.
- An actual upstream failure (bad key, Groq outage, rate limit) now raises
  `ExternalServiceError` (502), matching how every other external integration in this
  codebase reports a real failure, instead of an unhandled exception. The Gemini
  version never wrapped its call this way; this is a genuine behavior change, made
  because leaving it unhandled buries a real fix-the-key problem in the same generic
  500 as an unrelated bug.
- `google-genai` and the `pillow<12.0.0` cap it required stay in `pyproject.toml` /
  `uv.lock` for this change - removing an unused dependency needs a lockfile
  regeneration this slice doesn't otherwise require. The dependency comment is updated
  to say it's dead weight pending that follow-up; the `mypy` `module = "google.*"`
  override stays because `google-auth` (`auth/google_oauth.py`) still needs it.

## Consequences

- With `GROQ_API_KEYS` set, "Summarize", "Suggest Replies", and "Write a reply for me"
  produce real model output; no frontend change was needed since both surfaces were
  already fully wired.
- No AI credit/usage tracking exists or is implied by this change. Nothing gates or
  meters these actions - same as before, just now backed by a real model instead of a
  silent no-op.
- `docs/implementation/slack-ai-mcp-architecture.md` §0's open question is resolved by
  this TDR; that document is left as historical context with a pointer here rather than
  rewritten.
