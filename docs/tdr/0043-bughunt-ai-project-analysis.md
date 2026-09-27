# TDR-0043: BugHunt AI becomes a real project-wide analysis

Date: 2026-09-27
Status: Accepted

## Context

`apps/web/src/features/projects/panel/AiTab.tsx` ("BugHunt AI") had always been an
honest static "Coming soon" placeholder. TDR-0033 deliberately left it that way: the
only reference for it, the checked-in `backline-final-draft.html`, ties it to a fake
AI-credits/paywall system (`CREDITS`/`spendCredit()`), and AGENTS.md forbids shipping
fake AI or fake billing. TDR-0033/0034 instead shipped the two other, already-built AI
actions - thread "Summarize" and "Suggest Replies" (`backend/app/modules/ai/`) - against
a real Groq-backed key pool (`key_pool.py`).

The user has now provisioned five real Groq API keys (the pool already supports
rotation across any number of keys - no pool change needed) and asked to build BugHunt
AI for real, scoped to exactly the checklist the panel itself already advertised: read
every open comment in a project, prioritize by severity, summarize progress. They asked
to leave the two existing comment-thread AI actions untouched ("except the comments"),
confirmed the new feature may write a severity value back onto existing comments (no
new comment/task creation), and asked for one more real, low-risk AI addition on top.

**Addition folded in: duplicate-thread flagging.** It's the one other item on the
reference HTML's credit list ("spotting duplicate threads") that fits inside the same
single analysis call - no separate endpoint, no separate UI surface, stays read-only
(never merges or deletes anything), and doesn't touch the two existing AI actions.

## Decision

- `backend/app/modules/ai/schemas.py` gains `Severity` (`Literal["low","medium","high"]`
  - deliberately the *same* vocabulary as `comments.schemas.Priority`, not a new scale),
  `BugHuntFinding`, `DuplicatePair`, and `ProjectAnalysisResult`.
- `backend/app/modules/ai/service.py` gains `analyze_project(db, workspace_id,
  project_id)`: resolves the project's pages the same way
  `comments/service.py:list_comments_for_project` already does, filters to open
  (`status not in {"resolved","wont_fix"}`), top-level (`parent_id is None`) comments,
  caps at the 40 newest (`MAX_ANALYZED_COMMENTS`) to bound prompt size and Groq cost,
  and - only if `GROQ_API_KEYS` is configured and there's at least one candidate - asks
  Groq for a single JSON object (`response_format: {"type":"json_object"}`, a new
  optional `json_mode` parameter on the shared `_complete()` helper; the two existing
  callers pass nothing and are unaffected) containing a summary, per-comment severity
  findings, and possible-duplicate pairs.
- **No new schema/migration for severity.** The model's severity writes straight into
  each comment's existing `priority` field via the existing
  `CommentRepository.update()`, only when it actually differs from the current value.
  Duplicates are never written anywhere - display only, human decides what to do.
- **No new permission.** Manually setting `priority` is already gated by
  `comment:update_status` (owner/admin/member) in `comments/router.py`; the new
  `POST /api/workspaces/{workspace_id}/projects/{project_id}/ai/analyze` endpoint
  requires the same permission, since it performs the same class of write.
- **Hallucination guard.** Any `comment_id` in the model's response that isn't one of
  the candidates actually sent is dropped before anything is written or returned - the
  model's JSON is untrusted input, not a source of new comment ids.
- **Malformed-JSON fallback.** If the model doesn't return valid JSON, the endpoint
  degrades to a summary-only result (the raw text, truncated) instead of a 500 - a
  parsing failure must not break the panel.
- A configured-but-empty key list, or a project with zero qualifying comments, returns
  the same honest placeholder/no-op convention the other two AI actions already use -
  never a fabricated result.
- `apps/web/src/features/projects/panel/AiTab.tsx` is no longer a placeholder: an
  "Analyze this project" action (same plain `async`-handler + `useState` pattern as
  `CommentThreadPanel.tsx`'s Summarize/Suggest Replies, not `useMutation`) calls the new
  endpoint, reuses the existing `aiErrorMessage()` busy-state helper untouched, and
  renders the summary plus clickable findings/duplicates that jump to the relevant
  comment via `ProjectSidePanel`'s existing tab-switch/`onSelectComment` wiring. A
  successful analysis with any findings invalidates `qk.projectComments(projectId)` so
  the board reflects updated priorities immediately.
- No credit/usage metering or paywall UI was added anywhere, matching TDR-0033's
  precedent and AGENTS.md's prohibition on fake AI/fake billing.

## Consequences

- With `GROQ_API_KEYS` configured, BugHunt AI produces real severity triage, a real
  progress summary, and real duplicate-thread flags for the calling workspace's own
  project only (workspace-scoped throughout, same as every other comment query).
- The two existing comment-thread AI actions (summarize/suggest-reply/"Write a reply
  for me") are unchanged in behavior, prompts, and callers.
- Groq spend/latency scales with how often "Analyze this project" is clicked and with
  project size (capped at 40 candidate comments per call); no rate limiting beyond the
  existing key-pool busy state was added, since none was asked for.
- `docs/implementation/06-delivery.md` records the verification evidence for this slice.
