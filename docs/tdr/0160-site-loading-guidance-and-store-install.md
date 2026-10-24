# TDR-0160: Site-loading guidance, opaque preview states, store install link

Date: 2026-10-25. Source: owner report (a YouTube website project; projects must at
least load, and offer the extension when a site blocks embedding or sign-in).

## Decisions

- **Sites that need the real browser.** For YouTube, Google, Facebook, Instagram, X,
  LinkedIn, TikTok, Amazon, Netflix, GitHub, Notion and Figma (`lib/real-browser-sites`),
  the project page always shows "<Site> works best with the extension" with an Open with
  extension button: these block embedded/proxied previews and third-party sign-in, so
  the preview can be blank or limited without failing outright. Other sites keep the
  "Trouble loading this site or signing in?" hint until the preview connects.
- **Preview states are opaque.** The loading/failed overlays were translucent, so the
  proxy's own error page inside the frame showed through and two messages overlapped.
- **Store install.** `VITE_EXTENSION_STORE_URL` (optional) switches setup to "Add to
  Chrome" from the Chrome Web Store, keeping the ZIP as the Edge/manual fallback. It is
  unset until Google approves the listing (item `kdijhbgnbpjoaalbpnimfomemeheokca`).
  The 0.5.2 store package and submission steps are in the Web Store handoff.
- **Repository hygiene.** A local Redis snapshot (`dump.rdb`) had been committed by
  mistake in #53-#55 (local development data only); it is removed and ignored.

Note: the proxy refuses loopback/private targets by design (TDR-0148), so a website
project for `localhost` shows the failure state with the extension option.

## Verification

Workspace lint/typecheck/build. Chromium: a youtube.com project loads with the
extension recommendation and a clean failure state; Open with extension shows setup with
Download extension. (This sandbox cannot reach youtube.com or the deployed site.)
