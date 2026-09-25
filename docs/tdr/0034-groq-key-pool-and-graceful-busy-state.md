# TDR-0034: Groq key pool with cooldown, and a distinct "AI is busy" state

Date: 2026-09-26
Status: Accepted

## Context

TDR-0033 wired the already-built summarize/suggest-reply actions to a single Groq API
key. The user then asked, before shipping the actual key: whether Groq's free-tier
rate limits are per-account or per-key, and - regardless of the answer - to support
multiple keys with rotation, a cooldown, and a graceful "the service is busy, try
again" response for whichever request doesn't get a key, instead of the feature
erroring or the app breaking.

Groq's official docs state that limits are enforced at the organization level, not per
key. Multiple credentials can support planned rotation and revocation, but do not add
quota. Groq's acceptable-use policy also prohibits registering or orchestrating extra
organizations to bypass published limits, so this design must honor a 429 globally.

## Decision

`backend/app/modules/ai/key_pool.py` (new): a small Redis-backed pool over whatever
`GROQ_API_KEYS` (now a JSON array, replacing TDR-0033's singular `GROQ_API_KEY`) is
configured with.

- **Acquire = concurrency slot, not a fixed timer.** `acquire_key` claims the first
  key that is neither mid-request nor cooling down, via a per-key `SET NX EX` in Redis
  (atomic, so two concurrent requests can never claim the same key - this is what
  gives each concurrent caller "its own key"). `release_key` frees it the instant the
  Groq call returns. With no rate-limit rejections in play, a key is only ever
  unavailable for the few seconds one real request takes - not an arbitrary fixed
  cooldown after every successful call. That was deliberately rejected: with as few as
  one key configured (the expected starting state before the user's other four
  accounts are ready), an artificial per-call cooldown would make back-to-back clicks
  on "Summarize" then "Suggest replies" spuriously fail as "busy" even though nothing
  was actually rate-limited. The lock's TTL (`GROQ_KEY_LOCK_TTL_SECONDS`, default 30s)
  is a safety net only, for a process that dies mid-request.
- **Credential errors and organization limits are different.** A 401/403 cools only
  the rejected credential and retries another configured key. A 429 sets a global
  pool cooldown for Groq's `Retry-After` value (or the configured 30-second fallback)
  and immediately returns the graceful busy state; it never hops credentials to evade
  the organization-wide limit.
- **Lease ownership is checked atomically.** Every `SET NX EX` stores a unique owner
  token. Release/cooldown uses compare-and-delete/replace Lua, so a slow request whose
  safety TTL expired cannot delete a newer caller's lease.
- **Redis, not in-process memory**, because this repo already uses Redis (not
  in-memory state) for every other shared rate-limit/counter concern
  (`core/rate_limit.py`), and an in-process pool would silently reset on every deploy
  and wouldn't be correct if the API ever ran as more than one instance.
- **New error, distinct from the existing `RateLimitedError` (429, per-workspace abuse
  throttling):** `AIServiceBusyError` (`AI_SERVICE_BUSY`, 503) - raised only when no
  key is available at all, before any request reaches Groq. This is "our own capacity
  is temporarily exhausted," semantically different from "you personally are sending
  too many requests," so it gets its own code and status.
- **Frontend surfaces it distinctly.** `apps/web/src/features/ai/api.ts` exports
  `aiErrorMessage(error, fallback)`, checking for `ApiError.code === "AI_SERVICE_BUSY"`
  (the API client already threads the backend's `{error:{code,message}}` body through
  as `ApiError.code`) and returning "AI is busy right now - try again in a moment."
  instead of the generic per-action failure text. Wired into both existing surfaces:
  `CommentDetail.tsx`'s "Write a reply for me" and `CommentThreadPanel.tsx`'s
  "Summarize" / "Suggest Replies" (the latter previously had no visible error state at
  all for a failed suggest-reply call - just a `console.error` - so this is also a
  small existing-bug fix, not only new behavior).
- If every key is rejected with 401/403 (not 429) rather than merely busy, that's a
  configuration problem, not temporary load - surfaced as `ExternalServiceError` (502)
  instead of `AIServiceBusyError`, so a genuinely bad/revoked key doesn't masquerade as
  "just try again later" forever. A `logger.warning` fires per rejected key either way.

## Consequences

- One configured key behaves exactly as TDR-0033 shipped it: no artificial throttling,
  same disabled-placeholder fallback when the array is empty.
- Multiple keys permit planned credential rotation and isolate a revoked key, while
  still sharing the organization's quota. A provider 429 cools the pool as a whole.
- The pool must not be used with extra accounts or organizations created to bypass
  Groq's published limits.
- No client-side retry/polling was added; a busy response surfaces once, immediately,
  as a message the user can act on by trying again - matching what was asked for
  without adding queuing complexity that wasn't.
