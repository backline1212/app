# TDR-0048: Review authenticated websites in their real browser tab

Date: 2026-09-29
Status: Implemented in draft PR; browser acceptance pending

## Problem

The review proxy changes a site's origin. Site login, OAuth state and PKCE callbacks,
first-party cookie scope, Web Storage partitions, third-party APIs, and provider
policies cannot all be repaired by copying cookies. TDR-0041's extension opens a
top-level preview-origin tab, but the dashboard embeds the preview as a third-party
frame: those contexts do not reliably share partitioned storage. The cloud login
service copies cookies and localStorage out of the remote browser, so it loses
IndexedDB, sessionStorage, and in-memory login state. Its success message does not
prove that the embedded canvas gained a working session.

## Decision

The primary review path for a website with authentication uses the site's existing
top-level tab in the user's Chrome/Edge profile, or opens that site's URL there. It
preserves the target's first-party origin and lets the site handle its own password,
Google/SSO, passkey and MFA steps. Backline installs a small toolbar and comment
overlay in the target tab via the extension's isolated content script. No target
cookies or passwords are copied to Backline.

The dashboard and guest review page launch an explicitly selected project through a
same-origin content-script bridge. The service worker validates the project and
identity against the API, stores the Backline credential in extension session storage
per tab, and relays only the page/comment/upload routes needed for that project.
Guest access uses the existing share-link guest token; member access uses a validated
extension token, generated from the dashboard only if needed. The site's DOM receives
no Backline credential. The overlay registers the current URL as a page, reloads
comments after SPA navigation, and captures the visible authenticated tab with the
browser's screenshot API for comments. An OAuth provider origin receives no review
toolbar; returning to the project origin resumes the toolbar.

The manual session-sync button, cookie permission, and cloud login entry point are
removed from user-facing flows. Older server routes remain for compatibility but are
not advertised as a successful review path. The embedded proxy remains available for
sites that work with it, and snippet mode remains available on sites that install it.

## Acceptance and limits

- Password login and a provider redirect return to an annotated first-party page.
- Member and guest comments persist under the selected project with their identities.
- SPA navigation registers a new Backline page; stale drafts cannot post to it.
- The captured screenshot belongs to the active reviewed tab; switching tabs during
  capture discards the image rather than recording another page.
- A revoked/expired Backline token produces an actionable reconnect error.
- The reviewer installs the extension once. Chrome restricted pages, provider pages,
  extension-disabled browsers, cross-origin child frames, and native browser UI cannot
  be annotated. The target website's own login must succeed in the user's browser.

## Verification gate

Typecheck, lint, production web/widget/extension build, worker message and DOM checks
passed locally. The real-browser journey in
`apps/e2e/tests/journeys/journey-native-review.spec.ts` is prepared but **not passed**:
the current execution sandbox denies the Unix socket calls used by Chromium and
MongoDB, and the requested escalation was automatically rejected. The owner opted
out of a GitHub Actions gate. No live Google account, third-party site, or production
deployment has been verified. Run the full journey and examine its persisted comments
and screenshot before treating the feature as production verified.
