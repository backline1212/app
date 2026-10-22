# TDR-0124: Show available review paths beside planned features

Date: 2026-10-23. Status: portal deployed; browser acceptance pending.

## Decision

The Mobile App tab no longer describes a TestFlight/APK runner, device-linked
comments or replay as though they can be used today. It names these as planned
and points reviewers to the existing Images/PDF project flow for pinned
feedback on screenshots and documents. Its actions open the Images or PDF tab,
where the existing upload/project-creation paths remain available. The Web App tab
continues to direct reviewers to Website projects for signed-in site review.

The pricing card displays a waiting icon instead of a checkmark for features
that the API marks `coming_soon`. The text badge remains explicit. This is a
presentation change, not a billing entitlement or price change; no roadmap
date or unavailable feature is promised.

## Verification

Web lint, typecheck and production build passed (3/3 Turbo tasks).
Vercel reported success for `955f6e8`; the public root and current project
bundle returned HTTP 200, and the served bundle contains both screenshot and
PDF actions with the planned native-app copy. The 0.4.10 extension ZIP remains
publicly available with its recorded SHA-256.
Browser acceptance of the tabs, action and pricing card remains open while
local browser use is disabled. No test suite was written or run under the
Codex task instruction.
