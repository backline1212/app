# TDR-0169: Extension review and an embedded snippet on the same page

Date: 2026-10-25. Source: end-to-end run of the unpacked extension in Chromium against a
site that also embeds the Backline snippet (backlog FLOW-04 "one overlay when widget and
extension coexist").

## Finding

With "Open with extension", the site's own snippet still started: its "Your name"
prompt appeared over the extension toolbar - two Backline UIs on one page.

## Decisions

- While the extension reviews a tab, its content script sets
  `data-backline-extension-review="active"` on `<html>` (cleared when the review ends or
  fails to start). The DOM attribute is visible to the page's own scripts.
- The widget SDK doesn't start when the attribute is present, and a running embed
  watches for it and removes itself quietly (no notice; its stored session is kept).
  Its interrupted start-up is not reported as an error.
- Extension 0.5.3 (dashboard download and store package); 0.4.13+ keep working.

## Verification

Workspace lint/typecheck/build. Chromium with the unpacked extension: the Browser
extension page reports "Extension 0.5.3 is ready" (0.5.2 before the bump); Open with
extension opened the site with only the extension toolbar (one Backline root); Comment →
click → save created ticket #15 as the member with `capture_status: ok`.
