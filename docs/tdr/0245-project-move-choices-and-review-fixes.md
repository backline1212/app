# TDR-0245: Project move choices, screen follow-ups and move review fixes

Date: 2026-11-28. Amends TDR-0241 (review bar, board), TDR-0243 (project move) and
TDR-0244 (sign out).

## Context

Review of the 28 November work asked for more control over what a project move carries,
and for four screen changes. A code review of the move then found security and data-loss
defects, fixed in the same change.

## Move choices

`GET /projects/{id}/transfer-preview` reports what one destination would receive.
`POST /projects/{id}/transfer` takes the choices; left out, only the project moves.

| Choice | Options | Dashboard default |
|---|---|---|
| Client | Name and contact, name only, none. Link a same-named destination client or add another. An existing client is never overwritten; the source keeps its own. | Link if one exists, else name and contact |
| People | Add chosen people to the destination as members. Only people on the project who are still in the source, within the seat limit, in the move's transaction. They get an invitation email. Someone who saw a private project as owner or admin is listed on it as editor at most. | Nobody |
| Issue links | Keep filed links (replaces "dropped" in TDR-0243). TDR-0235 then stops a second issue in the same tracker type. Half-sent ones are dropped. | Keep |
| Past activity | Copy content events with the actor's name; the same entry is never copied twice. Access, credential and connection events are not copied. | Off |

The response lists who was taken off which tickets, under their new numbers.

The source keeps its activity. The move writes the project id, client reviewer names and
old ticket numbers onto those entries so they stay readable, and the feed says "Moved to
another workspace" instead of "Project deleted".

## Screens

- The review screen opens on the "Desktop" device, scaled to fit the canvas. Screens
  900px wide or less, and links carrying a dragged width, open on "Fit canvas"
  (`viewport=fit`). Any device frame is scaled to fit until a zoom is chosen.
- The All tickets board has no "Won't fix" column; those tickets sit under Resolved,
  marked. Dropping one back on Resolved leaves its status.
- All tickets' controls are tighter between 901px and 1600px, to fit one line at 1440px.
- Account security says that signing a device out leaves extension keys and MCP tokens.

## Fixes from the move code review

- A private project's history stays limited to its access list, and owners and admins,
  after it leaves (`payload_json.restricted_to`).
- The move lock is renewed while files copy. Copies are removed only while the failed
  move still holds the lock. A cancelled request deletes nothing.
- Roles, the destination being open, the people being added, uploads in progress and
  issues being filed are checked inside the transaction. A file appearing or vanishing
  during the copy aborts the move.
- A project with unfinished old-file cleanup in either workspace can't move yet. A
  five-minute sweep finishes cleanups whose job was lost.
- The deploy hook secret is removed and waiting deployments are cancelled.
- A render queued before the move stores nothing. Archiving, adding pages and filing
  tracker issues are refused while a move holds the project; archiving is workspace
  scoped. Closing a workspace marks it closed before archiving its projects.
- A moved ticket's primary assignee becomes the first remaining one. A creator of a
  project without an access list stays its manager.
- An abandoned lock's remembered archive state is ignored if the project changed since.

## Known limits, not fixed

- Large projects: one transaction with a round trip per file can exceed MongoDB's
  60-second limit; the move then fails each time. Moving it to a worker job, with bulk
  writes and a stored result, is the fix.
- A process that dies mid-copy leaves copies under the destination's paths that nothing
  counts or removes.
- A cancelled request leaves the project archived until the lock expires; restore it or
  move it again.
- Work already under way when the lock is taken (page recovery, snapshot commits, a
  comment or page being created) can still write under the old workspace. An orphan page
  left that way would block moving the project back.
- A move briefly frees an active-project slot in the source.
- Anyone who already holds a client review link or its passcode can still open it.
- An archived client is not offered.

## Verification

- Web typecheck, lint and build; ruff and mypy.
- Throwaway local workspaces in Edge: 51 checks on the choices and screens, 34 on the
  original move.
- 27 checks forcing the review's failures (failed, cancelled and overtaken moves,
  changes during the copy, stale locks, private history seen by a second user).
- Existing backend tests: the 38 that fail on `main` fail here. One more email digest
  test can fail for reasons outside this work: the first-run digest test before
  09:00 UTC, the guest-resolved test while a local worker is reading the same queue.
- Not verified: real Cloudflare R2, very large projects, a real tracker connection,
  invitation email delivery. The fixes themselves have had no second review.
