# TDR-0125: Show screenshot outcome in website review

Date: 2026-10-24. Status: source implemented; rollout and browser acceptance pending.

## Problem and decision

Point and region comments already save a `capture_status` when automatic
screenshot capture or upload fails. The on-site composer nevertheless said only
"Comment posted," then disappeared after 1.2 seconds. A reviewer could assume
the screenshot was saved, and an existing pin offered no way to inspect the
capture outcome. The portal shows failed captures, but the reviewer may remain
on the target website.

The website widget and native extension now use the returned comment state for
the post confirmation. A failed automatic capture explicitly says that the
comment text and location were saved without it, and remains visible for four
seconds. The on-site thread card shows a link to a saved screenshot, or a
persistent failure notice when `capture_status` is `failed`. Older records that
omit the evidence fields receive neither a fabricated screenshot claim nor a
failure warning. The existing private, scoped screenshot URL comes from the
authorized comment response; this does not introduce a new public evidence
route or change Pydantic/API contracts.

The extension package is version 0.4.11 and the portal's versioned download
points to that package. The 0.4.10 static asset remains for rollback. The
Chrome Web Store draft is still 0.4.9 until replaced and accepted.

## Verification boundary

Widget, extension and web lint/typecheck/build passed (9/9 Turbo tasks).
The source, portal-public and built-web ZIPs match at SHA-256
`4239C81E53A9CB17E6D0C1B2B7C93956C383C3E0AA427F456C5A0F59E59E89E8`.
The 51,458-byte ZIP contains manifest 0.4.11, the three scripts and popup.
After rollout, verify an actual native
capture and a deliberately failed capture on a controlled site, including
post confirmation, saved pin, portal display and attachment behavior. This
change reports the outcome; it does not add screenshot preview, retry, or
attachment editing to an already-saved comment. Those remain in FLOW-06.
No test suite is written or run under the Codex task instruction.
