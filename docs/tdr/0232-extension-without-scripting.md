# TDR-0232: Extension 0.5.16 drops the `scripting` permission

Date: 2026-11-07. Source: Chrome Web Store rejected 0.5.15 with Purple Potassium,
"Requesting but not using the following permission(s): scripting" (automated review).

## Decision

`chrome.scripting` was used in two places, neither of which needs it:

- **Content script for tabs opened before install.** The manifest's content script
  (`<all_urls>`) already runs on every page loaded after install. When a review targets
  an existing tab that has no content script (`tabs.sendMessage` fails), the tab is
  reloaded; the content script then starts the review from the stored session.
- **Page-diagnostics script** (`main-world.js`, console/network errors). The content
  script adds it as `<script src=chrome-extension://…/main-world.js>` - a packaged,
  web-accessible resource - once a review starts in the tab, as before only during a
  review. A page whose policy refuses the script (Trusted Types) offers no diagnostics.

0.5.16 requests `storage` and `<all_urls>` only.

## Found while testing

The composer's "Attach N console errors…" option never appeared, in the extension or
the website SDK: the diagnostics row was selected by class, and the screenshot option
above it shares that styling class. It is now selected through its own checkbox; with
the extension, a page's errors show as "Attach 2 console errors, 1 warning, 1 failed
request".
