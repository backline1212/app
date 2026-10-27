# TDR-0218: Delete workspace

Date: 2026-10-27. Source: settings walkthrough - an owner could not delete a workspace;
the only way was deleting their account while being its sole member (TDR-0214).

## Decisions

- Settings → **Delete workspace**, owner only (`workspace:delete`), confirmed by typing
  the workspace's name (`POST /workspaces/{id}/delete {confirm_name}`).
- It uses the same close as account deletion, now one function
  (`workspaces.service.close_workspace`): projects archived, review links revoked, room
  code cleared, every membership removed (members lose access immediately),
  `workspace.closed` event with the reason, and the daily purge deletes the content 30
  days later. Billing and audit records are kept.
- After deleting, the owner lands on their next workspace, or on "Create your workspace"
  if it was their only one.
