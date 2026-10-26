# TDR-0198: Card pictures for every project type; share images shown whole

Date: 2026-10-27. Source: owner review of the projects grid - PDF, image, web app and
mobile app cards still showed sketches, and YouTube's card looked "zoomed in".

## Findings

- YouTube's card showed its share image (`og:image`: a large logo on white, 1200x630),
  cropped and top-aligned like a page screenshot - so it looked nothing like the page.
- File projects never had a card picture: captures existed for websites only. Web App
  projects are websites and already follow the website path.

## Decisions

- **File projects.** When a member views the project's first file (page 1 for a PDF) and
  the card doesn't already show it, the browser draws what it rendered - the image, or
  the PDF page pdf.js drew - into an up-to-800 px JPEG and offers it
  (`PUT /projects/{id}/preview/image` with `asset_id`; at most once per tab). The API
  checks the file is a current, non-archived file of the project and keeps the picture
  (`source: file`, `ref: asset:<id>`). The card shows it while that file stays current;
  a replaced or archived file shows the sketch until the new one is viewed. No PDF is
  parsed on the server.
- **Share images** (`preview_source: share-image`) are shown whole (`contain`) over a
  blurred, faded fill of the same image, so a logo banner isn't cropped. Screenshots
  (server, service, extension, comment) keep the top-aligned crop; file thumbnails are
  top-aligned too, so a tall mobile screen shows its header.
- **Optional real screenshots for public sites.** `PREVIEW_SCREENSHOT_URL` (a screenshot
  service URL with `{url}`, e.g. thum.io/Microlink) is tried before the share image when
  the server browser is off. Off by default: it sends each website project's start URL
  to that service, which is the operator's call. The request still goes through the
  SSRF-guarded client. With it set, a share-image refresh may replace an extension
  capture after the usual week.
- `ProjectOut` gains `preview_source` and `preview_ref`. The privacy notice covers file
  thumbnails and the optional service.

## Verification

Backend ruff/mypy and scoping; web lint/typecheck. Chromium against the local stack:
new image, mobile-app and PDF projects (files uploaded through the API) each offered a
thumbnail when opened (`200` x3) and the grid showed the banner, the app screen from its
top, and page 1 of the PDF; a website whose card uses its share image rendered whole
over the blurred fill; website screenshots unchanged.
