# TDR-0183: Daily digest with counts and due-date reminders

Date: 2026-10-25. Source: product review - the daily digest only said "New feedback is
available" with a link, and nothing ever reminded an assignee that a ticket was due.

## Decisions

- Still link-only: no comment text, names or project details in the email; access is
  checked again when the link is opened.
- The email now lists counts, each limited to projects the member can open at send time:
  new comments and replies in the window; the member's own open tickets that are
  overdue (linked to Overdue filtered to them) and due within 24 hours (linked to their
  tickets sorted by due date). The subject summarises the same counts.
- A member with no new feedback but an overdue or nearly due ticket still gets the
  digest (a reminder); with neither, nothing is sent, as before.
- Two workspace-scoped repository reads support this (`count_created_by_page`,
  `open_assigned_due_before`); the delivery leases, evidence checks and idempotency are
  unchanged. The account setting's description says what the digest now contains.

## Verification

Backend ruff/format/mypy/scoping; workspace lint/typecheck/build. Local delivery run
(email sender captured): with three days of feedback the subject was "Backline: 34 new
comments · 1 overdue ticket · 1 due soon" with both filtered links; with only the two
due tickets a reminder-only digest was sent; with neither the delivery was skipped.
