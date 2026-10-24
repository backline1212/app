# TDR-0162: Review preview on sites that already embed Backline

Date: 2026-10-25. Source: verifying website/web-app projects end to end.

## Decisions

- **One toolbar in the preview.** When a site already has the Backline snippet (its own
  review link) and is opened in the dashboard preview or a client review link, the proxy
  injects its widget too. The site's copy started a second session; in the dashboard it
  then found the team's session belonged to another link and showed "Your review
  session ended" over the page. The proxy now sets `window.__backlineProxyToken` in a
  script that runs before the page's own scripts, and the SDK skips any other link's
  embed there and starts at most once per link (the SDK file can load twice).
- **Local development only:** `ALLOW_PRIVATE_NETWORK_TARGETS=true` lets the review
  proxy and outbound fetches reach localhost/private addresses so a local site can be
  previewed. Settings refuse it unless `ENVIRONMENT=local`; production keeps the
  TDR-0148 guard.
- A brand logo that fails to load is hidden instead of showing a broken image.

## Verification

Workspace lint/typecheck/build, backend ruff/format/mypy. Chromium: Example Project
(site with its own snippet) previews with one toolbar and no session notice (one
`/guest-sessions/current` call); the client review link opens the site with one widget.
