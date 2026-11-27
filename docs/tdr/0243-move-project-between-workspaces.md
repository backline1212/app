# TDR-0243: Moving a project to another workspace

Date: 2026-11-28

## Context

A project, archived or active, sometimes belongs in a different workspace. Until now the
only choices were archive, delete, or recreate it by hand and lose its history.

## Decision

`POST /projects/{id}/transfer` moves it. The dashboard offers it in the project menu.

- Who: owner or admin in both workspaces, typing the project name to confirm.
- Order: lock the project (archived for the length of the move), copy its files to the
  destination's storage paths, re-home every record in one transaction under the
  destination's plan lock, then delete the old files. A failure before the commit leaves
  the project where it was and removes the copies. Old files that cannot be deleted are
  retried by `resume_project_transfer_cleanup_job`.
- The destination's active-project limit (for an active project) and storage allowance
  apply. An archived project arrives archived.
- Moves: project, pages, comments and replies, revisions, diffs, recovery logs, assets,
  uploads, browser renders, deployments, share links and client guest sessions.
- Changes: tickets take new numbers from the destination's sequence; assignees and
  project access are limited to destination members; the person moving it becomes a
  project manager; the client link is cleared.
- Dropped: project-scoped integrations, tracker links, pending integration posts,
  notifications. Extension connections for the project are revoked.
- Stays: audit events and AI usage. Each workspace records the move.
- The untouched example project cannot be moved.

## Consequences

- Client review links keep working and now show the destination's branding.
- Deploy hook addresses name the workspace, so they must be set up again.
- Ticket references like `#14` quoted elsewhere stop matching; links by id still work.
- A crashed move leaves a lock that expires after 15 minutes; the project may be left
  archived and can be restored.
- New collections that hold project data must be added to `transfer_repository.py` as
  well as the deletion graph.
