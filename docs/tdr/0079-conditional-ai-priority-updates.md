# TDR-0079: Apply AI triage without overwriting a newer edit

Date: 2026-10-20. Status: implemented; verification/rollout in progress.

## Context

Audit F29 reports that BugHunt changes priorities directly in the repository with
no ordinary activity/realtime event, and can overwrite changes made while the
provider request is running. Ticket/dashboard caches remain stale. The user
authorized continuing every gap from the Markdown audit.

## Decision

- Pass the authenticated actor into project analysis and recheck session/project
  access after provider completion. Route each priority change through the comments
  service, reloading membership/project permission before applying it.
- Atomically match workspace, page, root comment, live/open status, analyzed body,
  previous priority and edited_at before setting priority. A changed/deleted/closed
  comment is skipped, and repeated model entries cannot apply multiple writes.
- Emit normal comment.updated realtime and comment.updated audit events for actual
  writes. Do not invent a status-change email for a priority-only change.
- Return updated/skipped IDs alongside bounded analysis results, so the requester
  can distinguish a suggestion from an applied change. Invalidate project comments,
  tickets, dashboard and activity caches; guard simultaneous Analyze actions.
- Remove the remaining fabricated reply suggestions when no provider is configured
  or provider output is unusable. Unconfigured AI returns an explicit unavailable
  error, and empty summaries/suggestions fail clearly without pretend content.

Pydantic response additions have defaults and regenerate packages/types. Existing
provider/credit behavior is retained; quota reservation/concurrency is still F26.
No provider request is issued merely to verify this source change.

## Verification

Run affected Ruff/mypy and web lint/typecheck/build; no suite for this Codex task.
Provider response, competing human edit, deletion/closure, role loss during analysis,
realtime and cache acceptance require a later live run and are not inferred from
source checks. Preserve unrelated extension/store preparation changes in the shared
workspace; this slice does not stage or modify them.
