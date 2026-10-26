# TDR-0208: The team hears about new client feedback; clients return as themselves

Date: 2026-10-27. Source: end-to-end walkthrough (client comments, team replies).

## Findings

- A client left feedback and the dashboard still said "Nothing is waiting on a reply from
  you"; the bell stayed empty. "Waiting on you" only listed threads where someone was
  explicitly set as owing a reply, and no notification existed for new client feedback.
- Comments a member makes through the dashboard canvas are stored as guest-authored, so
  "client comment" can't be read from `author_type` alone.
- A client who followed the team's "new reply" email (a new tab) had to join again as a
  new reviewer: the review identity lives in sessionStorage. Their earlier comments were
  then no longer theirs to edit or resolve.
- The sample project's client showed as "Guest".

## Decisions

- **New from clients**: open root comments by a reviewer that are still "Not started"
  and unassigned. A tickets view (`view=new`), a dashboard count (`new_from_clients`),
  and the dashboard's "Waiting on you" lists them after threads owed a reply, marked
  "New from client". The greeting says "N new client comments need an owner" when nothing
  else is owed.
- Canvas comments get `by_team: true` and are excluded.
  `python -m scripts.migrate_canvas_comment_authors` (dry run first, `--apply`) marks
  older ones.
- **Notification** `client_feedback` ("Kim Lee left feedback on Northwind site"): to the
  project's creator, its managers and the workspace owners/admins, at most once per
  person and project every 10 minutes; also for a client's reply on a thread nobody owns.
  Page and file comments. Preference "New client feedback" (default on; email follows the
  existing email setting).
- **Remember me on this device** on the review join form (default on): the session, name
  and email for that link are also kept in localStorage; "Leave review" clears them. The
  privacy notice says so.
- The sample client is "Jordan (sample client)".
