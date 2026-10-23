# TDR-0128: Keep website review waiting state honest

Date: 2026-10-24. Status: web deployed; browser acceptance pending.

## Problem and decision

A native review launch may return `ready: false` after its first toolbar check,
or time out after dispatch while a target-site sign-in is still under way.
The portal previously marked either case connected and relabeled its trigger
"Open website review again." The trigger stayed enabled while the waiting
dialog was open, so another click could dispatch a second launch and issue a
new project token even though the first tab-bound review might still attach.

The portal now marks a review connected only after the extension confirms
readiness. While waiting, it keeps the website-opening step current, explains
how to finish sign-in and find the toolbar, and disables the launch trigger.
Closing the dialog allows an explicit retry from the same project if the
toolbar never appears. A subsequent launch resets the confirmation state.
This changes portal state and copy only; it does not discard a potentially
active tab-bound session or revoke its scoped token on an uncertain timeout.

## Verification boundary

Web lint/typecheck/build passed (3/3 Turbo tasks). Vercel reported success
for `4b38d2d`; the public root returned HTTP 200 and the served native-review
bundle contains the waiting-state copy. The API host still returned Railway
edge fallback 404, so installed browser acceptance could not be completed.
Installed
browser acceptance must cover slow password/SSO return, confirmed readiness,
uncertain timeout, explicit failure, closing/reopening and token cleanup.
The site and its sign-in provider can still prevent the toolbar; the portal
does not claim an unconditional ready signal after the first check.
No test suite is written or run under the Codex task instruction.
