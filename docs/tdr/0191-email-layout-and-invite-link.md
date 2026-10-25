# TDR-0191: One email layout; invitations link to sign-in

Date: 2026-10-25. Source: production-readiness review of outgoing email. Every email
(sign-in/sign-up/email-change codes, invitations, join approvals, feedback notifications,
digests, client reply/resolved emails) was a bare HTML fragment with no layout, no
plain-text part and no inbox preview line. The workspace invitation had no link at all
("Sign in with this email address") and didn't name the workspace or the inviter; and the
code sign-in an invited person needs sits behind "Forgot password?".

## Decisions

- `send_email` wraps every fragment in one shared shell (`app/core/email_layout.py`):
  table-based, inline styles only, 560 px card, sender line, hidden preview text, and a
  short Backline footer. A full HTML document is sent unchanged. Resend also receives a
  plain-text part derived from the fragment (links as "text (url)"). Local inbox logs keep
  the fragment, so they stay readable.
- Client-facing emails pass `brand=` (the workspace's client-facing name): the header shows
  that name and the Backline footer is omitted, so white-label emails stay white-label.
- Codes are shown large and spaced, with plain wording on why the email arrived and what
  to do if it wasn't you.
- The invitation names the inviter and workspace in the subject and body and links to
  `/login?use=code&email=...`, which opens the email-code step ("Sign in with an email
  code") with the address filled in. No password is needed; people with a password can
  still go back to the normal sign-in.
- Notification and digest content is unchanged (link-only by design).

## Verification

Backend ruff/mypy, web lint/typecheck. Rendered the real code paths (sign-in code,
invitation, digest, branded client reply) and viewed them at 700 px and 390 px in Chromium:
consistent card, readable code, white-label header for the client email. The invitation
link opened the code step with the email filled in; Back returned to normal sign-in; plain
`/login` unchanged. A full sign-in with an emailed code still worked against the restarted API.
