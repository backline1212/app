# TDR-0192: Snippet install code, and screenshots that respect private content

Date: 2026-10-25. Sources: production-readiness review and BUG-08 (screenshots).

- A "Website tools" share link needs the review SDK on the client's site, but the
  dashboard never showed what to install ("existing installation required"). The only
  known install was two tags with an inline `Backline.init(...)`, which a site with a
  Content-Security-Policy blocks.
- `data-backline-private` keeps content out of page snapshots and anchors (TDR-0114), but
  screenshots ignored it, in both the SDK's DOM capture and the extension's tab capture.
- DOM captures came out with blank charts and players: a cloned `<canvas>` has no pixels
  and a cloned `<video>` no frame.

## Decisions

- **One-tag install.** `<script src="{API}/widget/sdk.js" data-share-token="TOKEN" async>`
  starts the SDK by itself (after the body exists), talking to the API that served the
  file; `data-api-base-url` can override it. No inline script, so a site's CSP only needs
  the API origin in `script-src`/`connect-src`. Pages calling `Backline.init` and the
  review proxy are unchanged (no attribute, no auto-start).
- **Install code dialog.** Creating a Website tools link opens "Install the website
  tools" with the tag, Copy code, and short notes: send reviewers the review link; anyone
  who can open a tagged page can comment (use staging or a passcode); mark private content
  with `data-backline-private`; the CSP origins; revoking switches it off. Every active
  Website tools link has an **Install code** action. The link-type option now reads
  "Website tools (add a tag to the site)".
- **Private content in screenshots.** DOM capture styles `[data-backline-private]` as a
  plain grey block with its contents hidden; the extension covers those elements with grey
  blocks for the instant of the tab capture and removes them straight after.
- **Charts and video.** DOM capture swaps each cloned canvas/video for an image of what is
  drawn now, when the browser allows reading it (cross-origin content is left as before).
  Private canvases are not copied.
- SDK 35.0 kB gzipped (budget 40 kB). The extension change ships in its next package.

## Verification

Workspace lint/typecheck. Chromium: creating a Website tools link opened the dialog with
`<script src="http://localhost:8000/widget/sdk.js" data-share-token="…" async></script>`;
rows offered Install code. A test page with only that tag, a strict meta CSP
(`script-src 'self' http://localhost:8000`), a canvas chart and a
`data-backline-private` card started the tools (toolbar, composer) with zero CSP
violations; the preview showed the chart, the private card as a grey block and the public
text; the comment saved with capture `ok`. Extension (local build) on the same page: the
page's own tag stood down, the tab capture showed the private card masked, and no mask
was left behind. The review-link proxy and the two-tag install still started one widget.
