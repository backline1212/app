# TDR-0197: Screenshot view when the preview can't load; card picture plan B

Date: 2026-10-27. Source: owner report - (1) after commenting on a site with the
extension, the comments couldn't be found back in Backline (no pins, nothing on the
canvas); (2) a Figma project's card still showed the sketch after TDR-0196.

## Cause

Reproduced locally with a site behind Cloudflare-style bot protection (the real browser
passes; a datacenter fetch gets a "Just a moment..." challenge). Backline's review proxy
fetches the site from the server, so its preview received the challenge, never loaded
the comment tools, and the canvas waited on "Loading... wait for the comment tools to
connect" (then a bare error). The extension's comments existed but were only reachable by
opening the side panel. The card's share-image fetch hit the same challenge.

## Decisions

- **Blocked previews are recognised at once.** The proxy treats an upstream HTML response
  with `cf-mitigated: challenge`, or a 403/429/503 page with a known interstitial
  (Cloudflare, DDoS-Guard, Incapsula, PerimeterX), as a bot challenge and returns a small
  page that tells the dashboard (`backline:site-blocked`) instead of looping on it.
- **Screenshot view (plan B for the canvas).** When the preview fails (challenge, widget
  error or the 15 s timeout), the canvas shows every thread on the screenshot it was
  posted with - newest first, grouped by page, with status, text and author - under a
  notice with Open with extension / Retry preview / Open live page / Check URL. Selecting
  a card opens the thread in the comments panel. "Screenshots" in the canvas bar switches
  to this view at any time (`?canvas=shots`); "Back to live preview" returns.
- **Where the comment was.** New comments record `screenshot_marker`: the pin point
  (x, y) or drawn area (x, y, w, h) as fractions of their screenshot, measured when the
  screenshot is taken (so scrolling before posting doesn't shift it) and kept through
  black-outs. Snippet, review link, Draw mode and extension all send it; the screenshot
  view draws a numbered pin or an outlined area. Older comments show the screenshot only.
  The marker is outside `context`, so the device-details privacy setting doesn't strip it.
- **Card picture plan B.** In order: server screenshot (when enabled) → the site's share
  image (TDR-0196) → a member's own start-page screenshot from the extension
  (`PUT /projects/{id}/preview/image`, allowed for extension sessions; offered once a day
  per project when a member review opens on the start page; kept only while the card has
  no recent real screenshot; a share-image refresh never replaces it) → the newest
  comment screenshot on any of the project's pages → the sketch.
- The privacy notice describes the extension's start-page capture and the comment
  screenshot fallback.

## Verification

Backend ruff/mypy and the workspace-scoping check; web, widget and extension
lint/typecheck. Chromium, with a local bot-protected site (challenge to proxied and
server requests, real page to the browser after its cookie) and the local extension:
extension comments saved; back in Backline the dashboard showed the Screenshot view
0.4 s after loading ("This website couldn't open in the preview"), all five threads on
their screenshots, the newest with its marker exactly where it was placed; selecting it
opened the thread. The share-image fetch got the 403 challenge, the card fell back to the
newest comment screenshot, and after a member review the extension's start-page
capture replaced it (`source: extension`, card shows the site's top). A normal site kept
its live preview; the Screenshots toggle switched both ways with the canvas pins intact.
Markers recorded for review-link point (0.5, 0.25) and drawn-area comments matched the
click and drag exactly.
