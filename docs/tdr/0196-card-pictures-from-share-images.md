# TDR-0196: Website project cards show the site's share image

Date: 2026-10-26. Source: owner request - website project cards should show the site
(its hero) instead of a generic sketch.

Card screenshots exist (TDR-0058) but only run with `SERVER_BROWSER_ENABLED`, which stays
off until the capture worker's network is isolated (TDR-0065): a headless browser
visiting user-supplied URLs could otherwise reach private infrastructure. So in
production every website card showed the sketch.

## Decisions

- When no server browser is available, or a browser capture fails, the worker uses the
  site's own share image: the `og:image` (then `og:image:secure_url`/`url`,
  `twitter:image`, `link rel=image_src`) declared in the start page's `<head>`. Sites
  publish it for link previews, so it is usually the hero or a designed banner.
- No browser and no scripts: only the start page's HTML (≤ 1.5 MB, HTML content type)
  and up to three candidate images (JPEG/PNG/WebP/GIF, ≤ 8 MB) are fetched, all through
  the SSRF-guarded client that connects only to checked public addresses on every hop.
  Images under 300×150 (logos, icons) or over 40 MP are skipped. Pillow decodes it into
  the same ≤ 800 px JPEG thumbnail a screenshot produces; transparent images go on white.
- Everything else is unchanged: same queueing, staleness, signed private storage and card
  UI. `preview.source` records `screenshot` or `share-image`. "Refresh preview" works
  without the server browser. A site with no share image keeps the sketch, and the
  failure reason is stored on the project.
- The privacy notice says the server reads the public start page and its share image for
  the card picture.

## Verification

Backend ruff/mypy and the workspace-scoping check; web lint/typecheck. Locally, with the
real Arq worker and `SERVER_BROWSER_ENABLED=false`: after clearing stored previews,
opening the projects grid queued captures; both local website projects showed the site's
share image within seconds (`ready`, `share-image`); the project whose host could not be
resolved here recorded the reason and kept its sketch. "Refresh preview" from the card
menu re-fetched the picture.
