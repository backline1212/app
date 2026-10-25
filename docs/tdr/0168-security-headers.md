# TDR-0168: Security headers for the dashboard and API

Date: 2026-10-25. Source: production-readiness security review.

## Decisions

- **Dashboard (Vercel, all paths):** `X-Frame-Options: DENY` and
  `Content-Security-Policy: frame-ancestors 'none'` (nothing legitimately frames the
  dashboard; this blocks clickjacking of ticket/permission actions),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  and `Permissions-Policy` allowing only same-origin microphone and screen capture (used
  by comment recordings) and denying camera, geolocation, payment and USB. A full
  script CSP is not added yet (Google sign-in, Sentry and the inline theme script need
  a reviewed allowlist).
- **API (`/api/*` only):** `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  no-referrer` and `Cache-Control: no-store` unless the endpoint sets its own (file
  content keeps `private, no-store`). Proxied websites, the preview origin and the
  widget script are untouched - the preview is framed by design.

## Verification

Backend ruff/format/mypy; workspace lint/typecheck/build. curl shows the API headers;
file content keeps its own Cache-Control; the website preview iframe still loads.
