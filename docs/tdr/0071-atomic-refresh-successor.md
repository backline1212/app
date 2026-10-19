# TDR-0071: Commit refresh rotation with its successor

Date: 2026-10-19. Status: implemented; live rollout verification pending.

## Context

During user-assisted Chrome verification of extension 0.4.1, the correct real
Backline tab opened and its website login was preserved. The toolbar did not stay
connected. API request evidence shows successful project access immediately before
launch followed by a 401 during readiness while the new tab restored its cookie.
Source tracing found a session-lifetime gap: `refresh_tokens` claimed/revoked the
old refresh token, then inserted the successor in a separate awaited write.
`validate_member_session` and bound extension access require a live family row;
a read between those writes sees the login family as signed out.

## Decision

Keep the existing opaque token hashes, family identity, verified sign-in metadata,
expiry and strict replay detection. Commit compare-and-swap rotation and successor
insertion in one Mongo transaction with snapshot reads and majority writes. The
repository methods accept an optional Motor session; the auth service orchestrates
the transaction, retaining router/service/repository boundaries. CAS checks both
revocation and expiry. Successor sign-in metadata comes from the actual claimed
record. Issue the access JWT and refresh cookie only after commit.

An insertion/transaction failure rolls back the old-token claim. Readers observe
the previous live family member or its committed successor. A lost CAS retains
existing family-revocation/theft behavior; no rotation grace period or permissive
401 retry is introduced. Concurrent refresh/replay, logout, lost responses and
database failures still need isolated acceptance; this is not a declaration that
every auth race is closed.

No API/schema/index/content migration is required. Existing documents remain
readable. Mongo must support sessions/transactions, already required by committed
snapshots. Read-only production `hello` confirms a replica set, logical sessions
and wire version 25. Credentials and topology names were not printed. No test
records were inserted. Extension 0.4.1 remains the required current build; this
server repair does not require another extension install.

## Verification

Backend Ruff lint/format, strict mypy and workspace-scoping checks pass. No test
suite is written/run under this Codex task's instructions. Deploy the coordinated
backend services, then repeat actual signed-in reload/new-tab launch and return.
Record exact commits, deployments and observed outcomes in the delivery ledger;
header/static checks cannot establish website sign-in or capture acceptance.
