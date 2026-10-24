# TDR-0151: Review-driven product fixes and multi-device sessions

Date: 2026-10-24. Source: a product-owner walk-through of every dashboard page plus a
backend review; each item was reproduced or confirmed in code first.

## Decisions

- **Sessions (replaces TDR-0034's single session).** Signing in no longer signs out
  every other device. The five most recently used sign-ins stay active; older ones are
  revoked (`revoke_families_beyond`). Password change and "sign out of all sessions"
  still end every other session (and extension tokens, TDR-0148). The session list
  stays short, which was TDR-0034's original reason.
- **Sign-in lands in the workspace.** Straight from sign-in, the picker opens the
  workspace used last on this browser (a per-browser preference) or the only one.
  Visiting `/` otherwise still shows the list.
- **Access-log redaction.** uvicorn's access/error logs printed the realtime socket's
  `?token=<access JWT>`; a log filter now redacts token/code/key/signature query values.
- **Proxy errors** return a readable HTML page to browser navigations instead of the
  API's JSON (which showed raw inside the review iframe).
- Fixes: notification clicks always 404'd (no single-comment GET; the project check
  suffices); file tickets showed a content hash as their location (now the file name);
  links to a reply opened the reply as a ticket (now its thread); sample tickets get
  real numbers (`scripts/migrate_ticket_numbers.py --apply` backfills existing ones);
  mobile dock covered the panel tabs; ticket tag chips stretched; 404/gate pages
  overflowed at 390px; Create project was disabled with no reason (now says what's
  missing and fills the name from the URL; a full plan is said on step one); seat-limit
  toast repeated itself (now one message with "See plans"); dead Privacy/Terms/Support
  links; real names/brands as placeholders; MCP token needed a name it suggested;
  Delete on an active project dead-ended; empty project tabs showed two empty states;
  ticket heading/plurals; internal/developer wording on settings, billing, share and
  page dialogs rewritten; unavailable settings rows removed.

## Verification

Workspace lint/typecheck/build, backend ruff/mypy. Chromium: sign-in opened the
workspace directly; tickets list shows file names; a notification opened its thread;
the new-project form named the missing fields and filled the name from the URL; the
proxy error page renders; access log shows `token=[redacted]`.
