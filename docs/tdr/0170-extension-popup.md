# TDR-0170: Extension popup reflects the active review

Date: 2026-10-25. Source: end-to-end extension run (TDR-0169).

## Decisions

- During a review opened from Backline, clicking the extension icon showed "Connect your
  Backline account… paste your extension token" although the tab was already
  reviewing. The popup now reads the tab's stored review (`review:<tabId>` in
  `chrome.storage.session`, written by the background worker) and shows "Reviewing
  <project> in this tab" with a pointer to the toolbar.
- Otherwise it leads with the normal path - "open its project in Backline and choose
  Open with extension; you don't need a token" + Open Backline - and keeps the token
  connection under "Use the extension without opening a project first".
- Popup buttons use Backline's colours instead of a stock blue.
- In extension reviews the floating "Tap anywhere on the page…" hint is not shown: the
  toolbar already shows the current mode's hint, and the floating one overlapped the
  Draw composer. The snippet/proxy widget keeps it.
- Extension 0.5.4 (dashboard download and store package).

## Verification

Workspace lint/typecheck/build. Chromium with the unpacked extension: popup before
review shows the Open-with-extension guidance; during the review it shows "Reviewing
Example Project in this tab"; Draw shows the composer with no floating hint.
