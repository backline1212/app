# TDR-0240: Client emails open the client's own thread

Date: 2026-11-08. Source: navigation audit, "client returns days later to see replies".

Reply and resolved emails linked to `/review/{token}` only. A website reviewer joined,
landed on the start page and had to find the right page and their pin again.

- The email link now carries `?comment=<thread id>` and, for website projects, the
  comment's page path (`&page=/pricing`). Only a path is sent; the review page resolves
  it against the review's own site and ignores anything else.
- The review page opens that page (preview or extension) with `backline_comment=<id>`;
  the widget takes it off the address before registering the page and opens the
  thread with the same logic as the dashboard's "scroll to comment". The extension
  already accepted `focusCommentId`. File reviews already open `?comment=`.
- The client board shows the ticket number (`#14`, the one the team uses) instead of
  the raw record id: `GuestBoardItemOut.ticket_number` (additive).
