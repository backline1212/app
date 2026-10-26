# TDR-0199: AI cost bounds, team-note privacy, token revocation and key-page copy

Date: 2026-10-27. Source: production-readiness audit of AI and API keys.

## Findings

- AI calls had no output cap and sent every reply of a thread in full, so one long
  thread or a looping script could make calls expensive; credits only cap the month.
- A summary or suggested reply for a client thread included the team's internal notes.
- A Groq key stayed claimed until its lock expired when a call was cancelled; a Groq 5xx
  failed at once; a `null` completion crashed with a 500.
- Reviewer text went into prompts unmarked (prompt injection), and the MCP server's
  instructions didn't tell connected agents that ticket text is untrusted.
- "Sign out everywhere" and password changes ended sessions and extension tokens but not
  MCP tokens.
- The API keys page said keys work for "CI" and stop on any role change; in fact API keys
  only reach the review endpoints (`core/extension_access.py`) for 30 days, and MCP
  tokens follow the member's current role. Browser-review keys (one project, 8 hours)
  cluttered the list.

## Decisions

- `max_completion_tokens` (1,200; 6,000 for a project analysis) and `reasoning_effort:
  low` for gpt-oss models. Thread context: the request plus the newest 30 replies, each
  up to 1,500 characters, 12,000 in total, with a note of how many were left out.
- Client-layer threads send only client-layer replies to the model.
- 10 AI requests per member per minute (Redis sliding window), checked before a credit
  is reserved.
- The key is released in `finally` unless a cool-down already holds it; one retry on
  the next key after a 5xx.
- Reviewer text is wrapped in `<feedback>` markers with a rule to treat it as data; the
  MCP instructions say the same.
- A credit is still released when the model's answer is unusable (empty or no
  suggestions): the member got nothing, and the rate limit bounds the cost.
- Revoking all sessions or changing a password revokes the member's MCP tokens too.
- API keys page copy describes the real scope and expiry; project-scoped and expired
  keys are hidden from the list.
- Guest file review: a missing file tells the client to ask the team, not to "upload it
  again from Manage files".
