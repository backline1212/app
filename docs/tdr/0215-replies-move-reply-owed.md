# TDR-0215: Replies move who owes the next reply

Date: 2026-10-27. Source: walkthrough of a client conversation on a ticket.

## Finding

"Needs your reply", "Waiting on client" and the dashboard's Waiting on you only changed
when someone ticked "Waiting for a reply from" / "Waiting on client" by hand, so a
client's answer to an assigned ticket didn't put it in front of the assignee, and a
question to the client didn't mark the ticket as waiting on them.

## Decisions

- A **client reply** (a real reviewer, not the dashboard canvas) on an open thread clears
  "Waiting on client" and adds the thread's assignees to "Waiting for a reply from"
  (anyone already there stays).
- A **teammate's reply** removes them from "Waiting for a reply from"; if it's visible to
  the client on a client thread, the thread is marked "Waiting on client".
- Closed (resolved / won't fix) threads are left alone; the checkboxes still work by
  hand and override until the next reply.
- The change touches `edited_at` (open boards refresh) but not `revision`, so it never
  turns a teammate's open edit into a conflict. The ticket dialog explains the rule
  under the checkboxes.
