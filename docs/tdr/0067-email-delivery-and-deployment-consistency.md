# TDR-0067: Email delivery and deployment consistency

Date: 2026-10-19. Status: implementation and rollout in progress.

## Context

Verified signup makes real email delivery a release requirement. F11 allowed a
missing/failing Apps Script provider to log OTP bodies and report success outside
local development. Railway inspection also found the API still on `52f611b` and
the worker on `311ddf5`, while cloud-login was on `1eba944`: API watch paths only
included widget sources and worker paths only extension sources. A Git push was
therefore insufficient evidence that backend fixes were deployed.

## Decision

- Preserve Apps Script then Resend delivery order. Return a standard 502 when no
  configured provider accepts the message. Only explicit local mode with no
  provider may log a development inbox preview. Provider outages never fall back
  to a fake success. Provider errors log their class only, excluding recipient,
  HTML, codes, credentials and provider response bodies.
- Check in all Docker build inputs for each service in
  `infra/railway/service-watch-paths.json`. The PowerShell configuration command
  defaults to a read-only diff; `-Apply` changes only build watch paths, validating
  the existing repository source and using exact production service IDs. Preserve
  service variables, databases, scaling, start commands and GitHub integrations.
- Keep `SERVER_BROWSER_ENABLED=false` on API, worker and cloud-login until actual
  egress isolation exists. Read-only ticket/evidence access remains available.
- Verify actual Railway deployment status and commit, Vercel deployment commit
  when available, public health/OpenAPI, SDK/extension artifacts and route guards.
  Static checks or an HTTP 200 alone do not establish login/review acceptance.

## Rollout evidence and limits

Read-only preflight found nine legacy accounts needing their first inbox proof,
zero passwords to retire on proof, twelve unrevoked refresh records, four
unrevoked extension credentials and no MCP credentials. No data was modified.
Legacy members must sign in once by email code/Google, then reconnect tools.

Production has Apps Script, Resend and Google OAuth settings. The Resend domain
inventory request returned HTTP 401; this is not a successful email-delivery check.
The Apps Script URL is reachable but GET is not evidence of mail acceptance or
receipt. Browser automation is disabled in Work settings, so browser login/SSO and
full guest/review journeys require a subsequent interactive acceptance pass.

This decision does not implement CR-02/03 connected installation/launch, worker
network isolation or other open findings. Record final checks/deployment IDs and
any blockers in `docs/implementation/06-delivery.md`.
