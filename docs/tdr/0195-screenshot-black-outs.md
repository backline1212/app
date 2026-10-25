# TDR-0195: Black out parts of the screenshot before posting

Date: 2026-10-25. Source: BUG-08 privacy and FLOW-06 capture control. With Preview
(TDR-0189) a reviewer could see personal or client data in the automatic screenshot, but
the only choices were to post it or drop the screenshot entirely.

## Decisions

- In the preview, dragging across the image draws a black box; any number can be drawn,
  and "Clear black-outs" removes them. A tap does nothing (a box needs a few pixels of drag
  both ways). The caption says "Drag across it to black out anything private."
- Boxes are stored as fractions of the image and burned into a copy of the full-resolution
  capture (JPEG) in the browser; the original never leaves the page. The post waits for
  the copy to be ready. Retake starts over without boxes.
- Works with mouse and touch (`touch-action: none` on the image), in point and Draw
  comments, the snippet, the review link and the extension (next package). Box positions
  use the CSSOM, so a strict site CSP doesn't block them.
- SDK 36.0 kB gzipped (budget 40 kB).

## Verification

Widget lint/typecheck/build. Chromium on the review link: after Preview, a drag over the
page header added one box and showed "Clear black-outs"; a tap added none; the posted
comment's stored screenshot (downloaded from storage) had the header area filled black and
the rest of the page intact; capture `ok`.
