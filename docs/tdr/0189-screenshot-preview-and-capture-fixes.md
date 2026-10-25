# TDR-0189: Screenshot preview, and captures that match the screen

Date: 2026-10-25. Source: FLOW-06 (capture control) - reviewers could leave the automatic
screenshot out (TDR-0176) but could not see it before posting. Checking the capture in
the browser exposed two existing defects in the snippet/review-link capture
(`captureScreenshot`, the DOM-to-canvas path; the extension's tab capture was fine):

- It always rendered from the top of the document, so a comment made after scrolling
  got a screenshot of the page header instead of the part the reviewer was looking at.
- A page without a body/root background colour (common) came out black below its content,
  because the transparent backdrop was exported to JPEG as black.

## Decisions

- The composer shows **Preview** next to "Add an automatic screenshot of this page". It
  captures with the same function used at post time (snippet: DOM capture; extension:
  tab capture with the overlay hidden) and shows the image under the option, with
  "This is what will be attached. Retake it after scrolling or changing the page."
  The button becomes **Retake**.
- A previewed image is attached exactly as shown; without a preview the post captures
  as before. Unticking the option hides the preview and attaches nothing. If the capture
  fails the composer says so and the comment can still be posted. If the site forbids
  `blob:` images the caption says the screenshot will still be attached.
- `captureScreenshot` shifts the cloned page by the scroll offset (relative offset, so
  fixed headers/footers stay where they are on screen), and paints the page's backdrop
  first: body background, else the root's, else white.
- Applies to point and Draw comments in the snippet, the review link, the dashboard
  canvas and the extension. The extension needs a new package for its preview.
  SDK bundle 34.5 kB gzipped (budget 40 kB).

## Verification

Widget/extension lint and typecheck, workspace build. Chromium, guest on the review link:
Preview showed a 1280x800 capture and Retake; unticking hid it, ticking restored it; after
the page was changed the posted comment's stored screenshot was byte-identical (SHA-256)
to the previewed one; a post without preview still captured (`ok`); the Draw composer
offered Preview, also at 390 px. A page scrolled to 1,400 px captured the scrolled view
(marker and fixed footer where they were on screen; before: the page top). A short page
captured white below its content (before: black). Extension (local build, signed-in
member): Preview showed a 1440x900 tab capture with the overlay kept out, the composer
stayed visible, and the comment saved with capture `ok`.
