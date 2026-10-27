# TDR-0219: Follow-ups from reviewing TDR-0206 to TDR-0218

Date: 2026-10-27. Source: code review of the changes merged since TDR-0205.

## Findings and decisions

- **Workspace purge stopped at the first failure.** One closed workspace whose project
  refused permanent deletion (or whose storage listing failed) ended the nightly run, and
  every workspace after it waited behind it forever. Each workspace is now purged on its
  own: a failure is logged, reported as `error` in the run report, recorded on the
  workspace as `purge_failed_at`/`purge_error` for the operator, and retried next night.
- **First-sign-in name was undone in the app.** Setting a password right after giving a
  name re-saved the user from the stale render copy, so the dashboard showed the
  email-derived name until reload. The saved name is carried into that update.
- **Edit project said "Checking the address…" forever** when the URL was unchanged (the
  saved address is deliberately not re-checked). An unchanged address is no longer
  "checking".
- **A returning reviewer's remembered name was cleared on load** by the link-change reset.
  The reset now refills the remembered name and email for that link.
- **Team canvas notes were marked "Waiting on client"** when a teammate replied, because
  canvas notes are stored guest-authored. Notes with `by_team` are not client threads.
- **Older single-assignee threads** didn't put the assignee on "Needs your reply" when the
  client answered; the legacy `assignee_id` is now used when `assignee_ids` is absent.
