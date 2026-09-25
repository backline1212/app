# TDR-0035: The review proxy carries a page's own scripted requests, and loads faster

Date: 2026-09-26
Status: Accepted

## Context

Signing in to a reviewed site inside the canvas still failed for almost every modern
site. TDR-0026 carried real `<form method="POST">` logins, but a site that signs in from
its own JavaScript (a `fetch()`/`XMLHttpRequest` to its API, then `history.pushState` to
the next route) sent those requests from a page served at
`{api}/proxy/{token}/...`, so every relative URL resolved onto Backline's own API origin
and never reached the site at all. Separately, reviewers reported the canvas as slow,
reloading on its own, and sometimes showing "failed to load". Investigation found
concrete causes for each:

- **Blocking DNS.** The SSRF guard's `socket.getaddrinfo` ran on the event loop for every
  proxied request, so a page's dozens of concurrent asset requests were resolved one at a
  time and timed out under load.
- **A new TCP+TLS connection per asset.** Each proxied request built its own
  `httpx.AsyncClient`, so no connection to the reviewed site was ever reused.
- **Uncompressed responses.** httpx decompresses the upstream body, and the proxy sent it
  on as-is: every script and stylesheet reached the browser at full size.
- **No caching.** Only status, content type and body were returned, so every reload and
  navigation refetched every asset through the proxy.
- **Rate limit sized for pages, not requests.** 300/minute per IP, while one page load is
  every script, image and API call it makes - and an agency's reviewers commonly share
  one office IP.
- **Bot-looking requests.** A fixed `User-Agent: BacklineProxy/1.0` is refused outright by
  many WAFs/CDNs.
- **The canvas reloaded the page it was already showing.** When the reviewer navigated
  inside the frame, the widget reported the page, the dashboard wrote `?page=` to its URL,
  and that rebuilt the iframe `src` - remounting the frame (a second load, and a signed-in
  SPA's in-memory session thrown away) or, when the `src` didn't change, leaving a
  "loading" state no load event would clear, which the 30-second timer turned into an
  error.

## Decision

**A network interceptor is injected first in every proxied HTML page**
(`modules/proxy/interceptor.py`, placed right after `<head>` by `rewrite_html` so it runs
before any of the site's scripts). It wraps `fetch`, `XMLHttpRequest.open`,
`navigator.sendBeacon`, `history.pushState`/`replaceState`, and the `src`/`href`
setters and `setAttribute` of resource elements (script, link, img, iframe, media,
source, track, embed), rewriting a URL to `/proxy/{token}/...` when it targets the
reviewed site's host (with or without `www.`) or the proxy's own host (where relative
URLs and anything built from `location.origin` land). Other origins, `/proxy/` and
`/widget/` paths are never touched.

**Backline's widget bypasses the interceptor** by calling the original `fetch`, which the
interceptor keeps as `window.__backlineNativeFetch` (`apps/widget/src/api-client.ts`'s
`nativeFetch`). That is what makes it safe to rewrite even absolute proxy-host URLs for
network calls. Element setters still leave absolute proxy-host URLs alone, because the
widget has no equivalent bypass for elements. Values embedded in the script are encoded
as script-safe JS string literals, since `target_origin` is member-supplied.

**The server forwards what a scripted login needs.** An allowlist of request headers
reaches the site - `Authorization` (a bearer token the login handed back), `x-*` custom
headers (CSRF tokens), `Accept`/`Accept-Language`, conditional and range headers - but
never `Host`, `Cookie` (still the namespaced mechanism from TDR-0026), `x-forwarded-*`/
`x-real-ip` (the reviewer's IP) or `x-backline*`. The reviewer's real `User-Agent` is sent,
so sites serve the right variant and WAFs don't block the request. `PUT`, `PATCH` and
`DELETE` are proxied as well (kept out of the OpenAPI schema: they are pass-through, not
a Backline API contract). A JSON response to a scripted login already passed through with
its `Set-Cookie` re-namespaced; that path is unchanged.

**Faster, and less likely to fail:**
- DNS resolution for the SSRF guard runs in a worker thread, as `browser_render` already
  does.
- One shared connection pool (`httpx.AsyncHTTPTransport`, keyed to the running event loop
  and closed on shutdown) under a per-request client, so connections are reused while each
  request keeps its own cookie jar. The transport retries a failed *connect* once, which
  is safe for every method because nothing was sent. `trust_env=False`, so neither an
  environment proxy (which would bypass the SSRF guard's own resolution) nor `~/.netrc`
  credentials apply to a reviewed site. Connect timeout 8 s, overall 20 s.
- Compressible responses (text, JS, JSON, XML, SVG, 1 KiB and up) are gzipped when the
  browser accepts it - off the event loop above 64 KiB - except 206/304 responses and
  range responses, whose byte offsets refer to the uncompressed body.
- Non-HTML responses keep `Cache-Control`, `ETag`, `Last-Modified`, `Expires`,
  `Accept-Ranges`, `Content-Range` and `Content-Disposition`. HTML does not keep its
  validators, since it is rewritten and they would describe a different body.
- The proxy rate limit is keyed per share link *and* IP, and its default is raised to
  1200/minute.

**The canvas stops reloading pages the frame navigated to itself**
(`ProjectOverviewPage.tsx`). A page reported by the frame updates `?page=` but keeps the
iframe `src`, and does not re-enter the "loading" state. Picking a page from the tabs,
Manage pages or the keyboard, changing the capture browser, or pressing Reload still
reloads the frame - and Reload now reloads the page currently shown, not the first page
the frame was given.

**The widget follows SPA route changes** (`apps/widget/src/index.ts`). It watches the
page URL and, 400 ms after it settles, registers the new page, moves its pins, threads
and realtime subscription to that page, re-sets up the region drawer if it's active, and
reports the page to the dashboard. A comment always belongs to the page it was clicked
on, even if the route changes while the composer is open. A query-string change counts
as a new page exactly when a full load of that URL would (`pages/url_normalize.py`
keeps the query), and registered URLs no longer carry the canvas's own `blBrowser`
parameter (only `blMode` was stripped before).

## Consequences

- Same-origin sign-in flows (a form *or* a script posting to the site's own domain, with
  cookie or bearer-token sessions) now work inside the canvas, and so does navigating an
  SPA afterwards.
- **Browser-enforced limits no proxy can lift:** third-party SSO (Google, Microsoft,
  Okta, ...) refuses to render in any iframe via `X-Frame-Options`/`frame-ancestors`, and
  its callback returns to the site's real origin rather than the proxy.
- **Not yet covered:** a site whose API lives on a *different* domain (`api.acme.com`
  for `acme.com`) - a share link proxies one origin; WebSockets and streamed responses
  (SSE) - the proxy buffers whole responses; requests made from web workers and CSS
  `url()` references, which still reach the site through `fallback_router.py`'s Referer
  redirect (so they break on a site that sets `no-referrer`).
- The reviewed site now sees the reviewer's own browser `User-Agent` instead of
  `BacklineProxy/1.0`. Credentials still pass through Backline in transit and are never
  stored, as in TDR-0026.
- Pages already registered with `?blBrowser=...` in their URL stay as separate, readable
  records. Merging them into their clean counterparts would need an explicit,
  dry-run-first migration; none is included here.
- The widget and the interceptor must ship together - both are built into the same
  backend image (`backend/Dockerfile`), and the widget URL is cache-busted by build time.
