# TDR-0108: Persist project integration dispatch with metadata changes

Date: 2026-10-22. Backlog item: BUG-05, project-update slice.

## Plan and decision

`PATCH /projects/{id}` previously committed its metadata/activity transaction, then
queued a single Arq job. A Redis failure in that gap could return an error after the
project was saved and leave no replayable delivery intent. The old worker also
swallowed individual provider failures. Store one `integration_dispatches` row per
connected notifier inside the existing project transaction. Keep each row scoped to
the workspace and project, with the event-time project name, state, due time,
attempts and lease. No webhook credentials or client contact data are copied into
the outbox. Idempotent project-update replays produce no new rows.

A minute Arq sweep queues due rows. A scoped atomic claim gives each attempt a
two-minute lease; delivery has an 80-second deadline and up to eight attempts with
bounded backoff. Successful, skipped and exhausted rows remain distinguishable.
Delivery reads current project/integration settings and skips disconnected or muted
destinations. One destination failing cannot suppress another. A save response means
the project was saved and delivery was scheduled, not that the remote provider
accepted it. Provider acceptance followed by a worker crash can still duplicate a
message; webhook providers do not share a universal idempotency contract. The
separate comment-event dispatch path remains a BUG-05 follow-up.

The index on `(state, after)` is additive. Inspect it with
`python -m scripts.migrate_review_persistence_indexes` before applying; no existing
review record needs migration. Keep the old project Arq handler during mixed rollout
so jobs queued by older API processes remain readable. Deploy the new API and worker
together when Railway accepts the exact source SHA.

## Acceptance and verification

Source acceptance: Ruff, strict mypy, repository workspace-scope checker and diff
checks pass. No new test suite under the Codex task instruction. A dry run found only
the new due index missing; additive apply created it and a second dry run found all
indexes present with no review data modified. The new worker, provider-failure/
retry/crash behavior and live admin activity are separate acceptance gates. Confirm
provider message counts when a saved project
update happens during a Redis outage, destination disconnect/mute and worker restart.
Do not claim at-most-once remote delivery; lease recovery is at-least-once.
