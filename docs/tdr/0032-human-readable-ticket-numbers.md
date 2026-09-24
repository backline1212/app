# TDR-0032: Ticket numbers are per-workspace and stored, not derived

Date: 2026-09-22
Status: Accepted

## Context

Every ticket surface in the design refers to a ticket by a short number - `#14` on a
board card, an `ID` column in the table, `#14` in the detail header. The product had no
such number. A comment's only identifier was its 24-character ObjectId, which nobody
can read out in a call, and the review drawer printed a *position* ("3") computed in the
browser from the currently-loaded comments. That position was stable across filters but
not across anything else: it changed as the project gained comments, and the same
comment was "3" in the drawer and had no number at all on the board.

## Decision

`comments.ticket_number`: an integer assigned when a top-level comment or a standalone
ticket is created, and never changed afterwards.

- **Per workspace, not per project.** The tickets list, board, calendar and search all
  span every project in the workspace; two projects each owning a "#3" would make the
  number useless exactly where it is read most.
- **Replies do not get one.** A reply belongs to its thread's number.
- **Allocated by an atomic counter.** One `counters` document per workspace
  (`_id: "tickets:<workspace_id>"`), bumped with a single `find_one_and_update`
  (`CommentRepository.next_ticket_number`). A read-then-write over `max(ticket_number)`
  would hand two simultaneous writers the same number.
- **Backed by a unique partial index** (`comments_workspace_ticket_number`, additive,
  `ticket_number` of type int), so a hand-reset counter still cannot produce a
  duplicate.
- **Existing records are backfilled**, not renumbered on read:
  `scripts/migrate_ticket_numbers.py`, dry-run by default, walks each workspace in
  creation order so the oldest ticket becomes #1, skips anything already numbered, and
  raises each workspace's counter with `$max` so a number handed out while it runs is
  never reused. It is safe to re-run.

`CommentOut.ticket_number` is `int | None`. The frontend prints it through one helper,
`lib/ticket-ref.ts`, which falls back to the last four characters of the record's id
while a deployment is still waiting on the backfill - deliberately not a computed
sequence, which would collide with real numbers and shift under the reader.

## Consequences

- The same reference appears on the board, the list, the table, the calendar, the
  ticket detail and the project review drawer, and can be quoted in a message or a
  standup.
- One extra round trip to Mongo when a comment is created. It is a single indexed
  upsert on a collection with one small document per workspace.
- The number is not a URL: links still use the comment id. Looking a ticket up *by*
  number (a search box, `#14` in a command bar) is not built yet; the index is there
  for it.
- The widget's reviewer-facing comment card does not show the number. It is a team
  reference, and that card is what a client sees.
