# TDR-0228: Backend audit fixes - access, delivery and read-only archives

Date: 2026-11-01. Source: backend logic/flow audit (16 findings, each verified in code).

## Fixed

- **Departed members keep no access.** Leaving or being removed from a workspace now
  revokes that workspace's MCP and extension tokens and ends canvas sessions. Before,
  they were only refused while no membership existed, so a re-invite revived a token
  left on an old laptop or CI config.
- **Dead integrations are reported.** A delivery that fails all 8 attempts logs
  `webhook.delivery_failed` to Activity and notifies whoever connected the integration
  (at most once a day per integration). The current outbox had dropped this when it
  replaced the old retry job.
- **Integration posts go out at once.** Dispatch rows are queued right after the comment
  transaction commits (same job id as the sweep, so nothing runs twice); the minute
  sweep is now the fallback and handles 500 rows per run instead of 50.
- **Page registration** accepts only http(s) URLs on website projects. A reviewer could
  register an internal `backline://` page and reach file comments outside the file
  checks.
- **File-comment attachments** go through the same check as other comments (issued to
  this reviewer, exists, declared type); attachment key/type lengths are bounded.
- **Archived projects are read-only for tickets.** Updates, layer changes, re-pins and
  moderated deletes answer "This project is archived. Restore it to change its tickets.";
  archived projects stage no Slack/webhook posts.
- **Moving a thread to team-only** clears "Waiting on client".
- **Canvas replies and approvals** don't notify the person who made them.
- **Raw errors** (signed storage URLs, internal hosts, Playwright traces, DNS errors) are
  replaced with fixed messages; details stay in the logs.
- **Snapshot delivery** backs off (1→60 min) and stops after 8 failures instead of
  re-running the recovery pipeline every minute forever.
- **Moderated delete** of a first message that has replies is refused (delete the thread).
- **Board text edits** set `body_edited_at`, so "edited" shows.
- **Digest "overdue"** uses the Overdue view's cutoff (due before today, UTC).

## Not changed

`max_jobs = 3` covering all jobs (renders vs email) and plain-text webhook URLs need an
operational decision (separate queue; encryption migration) and are listed as pending.
