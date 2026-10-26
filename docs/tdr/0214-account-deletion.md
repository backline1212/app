# TDR-0214: Delete my account

Date: 2026-10-27. Source: production-readiness review - there was no way for a person to
delete their account or the data in a workspace they alone used, and the privacy notice
said nothing about deletion.

## Decisions

- **Account → Security → Delete my account.** The page first shows what happens to each
  workspace (`GET /auth/me/delete`), then emails a 6-digit code
  (`POST /auth/me/delete/code`, 3 per 10 minutes) and deletes on confirmation
  (`POST /auth/me/delete {code}`), using the existing one-time-code store with its own
  purpose and the per-address wrong-code budget (TDR-0201).
- **Owner of a workspace other people use → blocked**, naming the workspaces: ownership
  must be transferred first, so a team never loses its workspace. Pending invites don't
  count as people.
- **Only member → the workspace closes**: projects archived, review links revoked, room
  code cleared, all memberships (incl. pending invites) removed, `closed_at` and
  `purge_after` (+30 days) set, `workspace.closed` event. Nobody can open it.
- **Elsewhere → they leave**, through the normal leave path (reports re-parented,
  project entries removed).
- **The account is anonymised** rather than removed, so threads keep their shape: name
  "Deleted user", email `deleted-<id>@deleted.invalid` (the real address can sign up
  again), no password/photo/providers, `email_verified_at` cleared (no credential can
  pass the identity check), digest/email off, `deleted_at` set. All sessions, extension,
  MCP and canvas tokens are revoked and the person's notifications deleted.
- **Purge**: a daily worker job (03:17 UTC) purges closed workspaces past `purge_after`
  using the existing permanent project deletion, then removes the workspace's clients,
  integrations, custom domains and join requests; the workspace record (marked
  `purged_at`), audit events and billing history are kept.
  `python -m scripts.purge_closed_workspaces` shows a dry run (`--apply` runs it now).
- The privacy notice describes all of this.
