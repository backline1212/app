# TDR-0157: First-run workspace step and client search

Date: 2026-10-24. Source: new-account walk-through and backlog SUG-11.

## Decisions

- **First workspace.** A new account with no workspaces and no pending join request
  sees "Create your workspace" with a ready name ("Priya's studio", from the account
  name; renamable in Settings) and one primary button; joining with a room code is the
  secondary option. Previously it opened on "Your Workspaces — you don't belong to any
  workspaces yet" with an empty, disabled form below. Picker labels are sentence case.
- **Clients in search.** Workspace search also matches active clients by name, contact
  or email (`SearchResultOut.kind` gains `"client"`, additive) and opens the Clients
  page filtered to that client. Only members with `project:manage` - the Clients page's
  own permission - get client results; client contact records are never shown to
  other roles or guests.
- Search groups placed comments under "Tickets" (and the team's own tickets under
  "Team tickets"), matching the rest of the product. Plan card pluralizes "project".

## Verification

Workspace lint/typecheck/build; backend ruff/format/mypy/scoping. Chromium: signup →
"Create your workspace" prefilled → dashboard; search "acme" lists the client, which
opens `/clients?search=Acme%20Corp`.
