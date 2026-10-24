# TDR-0159: Recover from stale builds; phone touch targets

Date: 2026-10-25. Source: production report - opening a project on
backline-qa.vercel.app showed React Router's "Unexpected Application Error! Failed to
fetch dynamically imported module …/ProjectOverviewPage-<hash>.js".

## Decisions

- **Cause.** A tab loaded before a deploy requests the previous build's route chunk,
  which the new deployment doesn't serve; `vercel.json` also rewrote every missing path,
  including `/assets/*`, to `index.html`, so the import received HTML.
- **Hosting.** `/assets/*` is no longer rewritten (a missing chunk is a real 404) and is
  served `immutable` for a year; `index.html` is `no-cache`, so new visits always get the
  current build.
- **Client.** The root route has an error screen (`RouteError`) instead of the raw
  router page. For a stale-chunk error it reloads once at the page being opened (a 15 s
  `sessionStorage` guard prevents loops), landing on the new build; if the chunk still
  fails it shows "Backline was updated - Reload". The top-level error boundary does the
  same for lazily loaded parts of a page. Other errors show "Something went wrong" with
  Reload / Go to projects.
- **Phones.** The global 44px touch-target rule also stretched chips and tag filters
  into tall boxes; chips get 32px and tags/ticket numbers their natural height. Table
  chips no longer break names mid-word.

## Verification

Workspace lint/typecheck/build. Chromium with the project route's chunk blocked once:
the page reloaded into the project and loaded; blocked permanently: "Backline was
updated" screen. 390px: ticket tags 15px tall, no horizontal overflow on dashboard pages.
