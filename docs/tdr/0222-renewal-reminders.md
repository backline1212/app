# TDR-0222: Renewal reminders before a prepaid plan ends

Date: 2026-10-27. Source: product review of plan expiry.

## Finding

Plans are prepaid and don't renew automatically (TDR-0052). When a period ended, the
workspace dropped to Free Starter limits with no warning except a "N days left" chip on
the Billing page, which owners rarely visit.

## Decisions

- A daily worker job (10:07 UTC) emails the workspace owner 7 days and 1 day before
  `current_period_end`: the plan, the date, that it doesn't renew, what changes on Free
  (nothing deleted; new projects, seats and AI credits limited) and a link to Billing.
- Each reminder is claimed on the workspace as `renewal_reminders_sent` =
  `"<period end date>:<7d|1d>"` before sending, released if the provider fails, and sent
  with a matching idempotency key. A renewal moves the period end, so the next period
  gets its own reminders. Closed workspaces and unverified owners are skipped.
- The sidebar plan card shows "Plan ends in N days" in the last week, with "Renew plan"
  for the owner and "See plan" for everyone else.
- Billing emails are transactional, so they carry no unsubscribe link.
