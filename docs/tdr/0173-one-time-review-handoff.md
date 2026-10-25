# TDR-0173: One-time code instead of the session token in the website URL

Date: 2026-10-25. Source: FLOW-01 (pending backlog 2026-10-24, "replace reusable URL
bearer handoff").

## Problem

"Open website review" sent the guest to the reviewed site (or its proxy) with
`?backline_guest=<session token>&backline_name=<name>`. The widget removed both from
the address bar, but only after it loaded: the site's own analytics, logs, a proxy or
the browser history could keep a working session token and the reviewer's name.

## Decisions

- `POST /api/v1/guest-sessions/current/handoff` (guest session) returns
  `{code, expires_in}`: a random code stored in Redis under its HMAC for 120 seconds.
  Only a client's own session is handed over; a member's canvas session is refused.
- `POST /api/v1/guest-sessions/handoff/redeem {code}` (IP rate-limited, no-store)
  consumes it with GETDEL, re-checks that the session and link are still active and
  returns a fresh guest token plus display name. A used or expired code is a 404.
- The review page mints the code when the reviewer clicks "Open website review" (the
  tab opens first so pop-up blockers allow it) and sends only `?backline_handoff=<code>`.
  If the API predates these routes (404/405) it falls back to the old parameters.
- The widget reads `backline_handoff`, strips it, redeems it and stores the session for
  the tab as before. A reload after redeeming uses the stored session; a replayed code
  gives nothing. `backline_guest` is still accepted from older dashboards.
- The proxy strips `backline_handoff` from upstream requests, like the old parameters.

Extension reviews already hand the session over through the extension, not the URL.

## Verification

Workspace lint/typecheck/build; backend ruff/format/mypy/scoping. Chromium (proxied
review): the only `backline_` request was `/?backline_handoff=<code>`; the widget
started without a name prompt and stored the session; the upstream site received
`GET /`; opening the same URL again in a new browser context recovered no session.
