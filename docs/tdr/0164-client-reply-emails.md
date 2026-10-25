# TDR-0164: Clients hear back - reply and resolved emails

Date: 2026-10-25. Source: production-readiness review of the client feedback loop.

## Decisions

- **Email is offered on the review link.** The client join step has an optional email
  field ("Get an email when the team replies to or resolves your feedback"). It was
  already accepted by `POST /guest-sessions` but no screen asked for it, so the existing
  "feedback was addressed" email could never send.
- **Team replies reach the client.** A client-visible reply by the team (dashboard,
  member-backed preview session or an MCP agent) on a client's comment emails that
  client (`send_guest_reply_email_job`), at most once per thread every 15 minutes
  (Redis `SET NX EX`). Failures are logged and never fail the reply.
- **Both client emails** use the name clients see (client branding, else workspace
  name), name the project, link back to the review (the verified review domain when
  connected; none for revoked or canvas links) and say why the client gets them. All
  interpolated text is escaped. The resolved job's new arguments are optional so jobs
  queued by an older release still run.
- Team-only replies and replies on the team's own tickets never email clients.

## Verification

Workspace lint/typecheck/build; backend ruff/format/mypy/scoping. Local: two
client-visible replies on a client's ticket queued one reply email with brand, project
and review link; rendered HTML escapes names, text and URL.
