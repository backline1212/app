# TDR-0149: Web App and Mobile App projects

Date: 2026-10-24. Replaces the "Coming soon" Web App and Mobile App project types.

## Decision

Both ship as a review **variant** (`ProjectOut.variant`, `"webapp" | "mobile"`) on an
existing project type instead of new `project_type` values, so every website and file
review path - proxy, extension (including older 0.4.x builds), deploy sync, pages,
share links - works unchanged:

- **Web App** = website project + `variant: "webapp"`. The widget/extension composer
  adds an optional "Steps to reproduce" field (`ContextIn.steps_to_reproduce`, TDR-0147)
  next to console & network capture; details show both. Header shows a "Web app" pill.
- **Mobile App** = image project + `variant: "mobile"`. Screens carry optional
  `build_label`, `device` and `platform` (set for a batch on creation, editable per
  screen in Manage files). Review shows screens in a phone frame, the build/device in
  the header and tabs, and a build filter when there is more than one build.

The dashboard gains Web App / Mobile App tabs and creation cards; the Coming soon
panel and its art are removed. Fingerprints include `variant` only when set, so
classic project create replays are unchanged.

Not included: running a native app build or a device farm (FEAT-02/11), and
app-state navigation for Web Apps beyond steps + diagnostics.

Also fixed: the snapshot API rejected the spec's `sha256:<hex>` page hash the widget
and extension send, so page-version capture (and pin recovery) failed with 422 for
every review; it now accepts both forms and stores the prefixed one. The capture
notice no longer sits above the composer. Extension 0.5.1 carries the variant.

## Verification

ruff/mypy, lint/typecheck/build, regenerated types. Chromium: created a Mobile App
project with build/device and opened it in the device frame; created a Web App
project, posted a widget comment with steps (stored in context); snapshot POST now 201.
