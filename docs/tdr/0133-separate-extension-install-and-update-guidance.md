# TDR-0133: Separate extension installation from update guidance

Date: 2026-10-24. Status: web deployed; browser acceptance pending.

## Problem and decision

The website-review dialog used one setup state both when no browser extension
responded and when an installed extension reported an incompatible version or
API server. It offered first-time Load unpacked instructions and a Check again
button in both cases. A newly installed or reloaded extension does not inject
its content script into an already open Backline tab, so checking the same tab
can keep failing until the reviewer reloads it.

The portal now distinguishes missing installation from an installed but
incompatible extension. First-time setup explains Load unpacked; the update
state explains replacing existing unpacked files and reloading that extension
card. Both end with an explicit Backline tab reload, and the dialog offers a
Reload Backline action. A connection-invalidated state keeps its own reload
copy. When an extension is ready, the existing project-bound launch path is
unchanged. The Chrome Web Store draft is still unpublished, so this flow is
for the current versioned ZIP; it does not claim automatic store updates.

## Verification boundary

Web lint/typecheck/build passed (3/3 Turbo tasks); diff check passed. Vercel
reported success for `7f4d89b`; the public NativeReviewButton bundle contains
the separate update heading, reload guidance and Reload Backline action. No
test suite was written or run under the Codex task instruction. Browser
acceptance of missing, outdated, wrong-server and successfully reloaded
extension states remains pending while API `/health` returns Railway fallback
404 and the installed browser version is unverified.
