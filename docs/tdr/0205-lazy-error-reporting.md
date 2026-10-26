# TDR-0205: Error reporting loads only with a DSN; honest error screen

Date: 2026-10-27. Source: bundle review in the production-readiness pass.

## Decisions

- The app's error boundary is a small component of our own (`AppErrorBoundary`) instead
  of `Sentry.ErrorBoundary`, so `@sentry/react` is no longer in the entry bundle. With
  `VITE_SENTRY_DSN` set it loads once the page is idle (or when an error is caught) and
  initialises as before; without one it is never downloaded. Entry bundle: 142.7 → 137.4
  KB gzip without a DSN; with a DSN Sentry is a separate chunk.
- The error screen says the error "was reported to the Backline team" and shows its ID
  only when Sentry returned an event id. It used to say "Our team has been notified"
  with "Error ID: unknown" even when nothing was reported.
- Trade-off: an error in the first moments before Sentry loads is reported once the
  module arrives (boundary errors wait for it); a non-render error that early is missed.
