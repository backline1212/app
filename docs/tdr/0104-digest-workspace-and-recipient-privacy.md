# TDR-0104: Fail closed on digest project and recipient access

Date: 2026-10-22. Backlog item: BUG-01.

## Plan and decision

Remove the Unknown project disclosure fallback. Resolve every page and project
through workspace-scoped repository queries, and omit missing, archived, foreign or
inconsistent project mappings. Preserve valid legacy comments that lack an explicit
project_id by checking their page's project; do not rewrite or delete records.

Read the current membership, user, verified-email state and daily-digest preference
for each recipient after previous recipients' provider waits. Rebuild project-access
lookups per recipient rather than sharing stale authority across those waits.
Both comment layers remain member-only and require positive current project access.
This does not authorize client digests or expose team information to guests.

No HTTP contract, generated types, migration/index, credentials or email preference
is changed. The earlier checkpoint/delivery bug is deliberately the next slice
(BUG-02); this privacy change does not claim durable digest retry or instantaneous
revocation during an already-started provider send.

## Verification

Affected Ruff format/check, mypy and workspace-scoping results are recorded in the
delivery ledger. No test suite per AGENTS.md, provider call, production email or
shared fixture. Manual acceptance remains: missing/foreign/mismatched references,
private/archived projects, valid legacy comments and standalone tickets, verified
versus unverified email, opt-out/removal/role change between recipients, and valid
authorized member delivery. Source completion is separate from rollout/acceptance.
