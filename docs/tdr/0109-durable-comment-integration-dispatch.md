# TDR-0109: Persist comment integration events with comment writes

Date: 2026-10-22. Backlog item: BUG-05, comment-event slice.

## Plan and decision

Ticket creation, reply creation, member status changes and guest self-resolution
previously wrote the comment before asking Redis to enqueue notifier jobs. A Redis
outage could leave saved feedback without a notification intent. Use Mongo
transactions for each affected comment write, its activity event and one scoped
`integration_dispatches` row per currently connected notifier. Creation-request
replays remain idempotent: a duplicate-key race is resolved outside the aborted
transaction against the already committed comment. Ticket numbers may have gaps if
a transaction aborts, which is preferable to a duplicate ticket or notification.

The shared minute sweep and lease worker introduced in TDR-0108 also handles
`comment.created` and `comment.status_changed`. It checks the current workspace,
project, page, comment, connection, mute preference and project scope before a
provider call. A status-change row retains the status at the triggering write;
other comment fields are read at delivery time, as in the previous Arq path. A
deleted comment or disconnected/muted destination is skipped. Existing queued Arq
jobs keep their legacy handler during mixed rollout. Remote providers may still
receive a duplicate when they accepted a call before the worker crashed, and
different providers do not share an idempotency protocol.

This slice does not change HTTP contracts, generated API declarations or indexes.
The additive outbox due index was already applied dry-run-first in TDR-0108. Post-
commit realtime broadcasts, stakeholder notifications and guest email scheduling
are outside this integration-specific transaction; their own delivery contracts
remain separate follow-ups. Provider failure status is durable in the outbox but
is not yet displayed in the portal.

## Acceptance and verification

Run backend Ruff/format, strict mypy, repository workspace-scope checker and diff
checks. Codex does not add or run test suites under this task's AGENTS.md rule.
Live acceptance after matching API/worker rollout: create/reply/status saves during
Redis downtime, crash before/after provider acceptance, duplicate create requests,
cross-workspace references, muted/team-only comments, disconnected destinations,
and legacy queued jobs. Verify that a failed provider never changes a saved
comment response into an apparent failure.
