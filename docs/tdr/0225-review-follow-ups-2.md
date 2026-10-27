# TDR-0225: Follow-ups from reviewing TDR-0219 to TDR-0224

Date: 2026-10-27. Source: code review of backline1212/app#151–#156.

## Findings and decisions

- **Renewal reminder wording and retries (TDR-0222).** Run once a day at 10:07 UTC, the
  1-day reminder for a period ending later that day said "ends tomorrow", and a failed
  or missed 1-day send was never retried (the next run was after the period ended). The
  job now runs hourly (the per-period claim keeps it to one email per stage), and
  "today / tomorrow / on <date>" comes from calendar dates.
- **Cancelled sends lost the reminder.** The claim was released only on `Exception`; a
  job timeout or shutdown (`CancelledError`) left it claimed. It is now released on any
  exit without a send.
- **Teammates on the dashboard canvas** got the client wording for an archived project;
  they keep "This project is archived. Restore it before reviewing."
- **The website preview** (proxy) still answered "Project not found." for an archived
  project, shown as "This website couldn't be loaded… may be down". It now gives the
  closed-review message, and the proxy error page shows "This review is closed".
- The shared message is now "The team archived this project, so its review is closed.
  Ask them if you still need to leave feedback." so it reads under that heading.
- **Purge reporting (TDR-0219):** the job logs purged and failed counts separately and
  returns only successes; `purge_error` stores the error type, not storage error text;
  a later successful purge clears `purge_failed_at`/`purge_error`.
