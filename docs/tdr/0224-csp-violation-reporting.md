# TDR-0224: Dashboard CSP violations reported to Sentry

Date: 2026-10-27. Source: pending suggestion "CSP reporting" (pending-and-suggestions).

## Context

The dashboard's Content-Security-Policy is a static header in `apps/web/vercel.json`. A
`report-uri`/`report-to` there would need the API's absolute host hard-coded for every
environment (the dashboard and API are on different origins), and a new public endpoint.

## Decision

- With `VITE_SENTRY_DSN` set, the app listens for the browser's
  `securitypolicyviolation` event and sends a warning to Sentry: "CSP blocked
  <directive>: <origin>", tagged with the directive and disposition.
- Only the blocked origin (or keyword such as `inline`) is sent, never the full URL,
  which could carry tokens. Each directive/origin pair is sent once per page load, at
  most ten per page.
- Without a DSN nothing is listened for or loaded.
