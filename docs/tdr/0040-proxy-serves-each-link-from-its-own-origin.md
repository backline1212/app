# TDR-0040: The review proxy serves each share link from its own origin

Date: 2026-09-27
Status: Accepted

## Context

Sites with a login still broke in the canvas after TDR-0026 and TDR-0035. The reported
case: `instagram.com/accounts/login/` rendered Instagram's own "Page isn't available… the
profile may have been removed". The proxy did reach Instagram; the page then ran at
`{api}/proxy/{token}/accounts/login/`, and Instagram's client-side router read
`location.pathname`, took `proxy` as a username and showed its profile-not-found screen.
`window.location` can't be patched from page script, so no amount of URL rewriting fixes
this: every single-page-app router (React Router, Next, Vue, Angular) without a
configured basename breaks the same way.

Serving every site under a path prefix on the API's own origin caused three more
login breakers and one security problem:

- **Renamed cookies.** Cookies were relayed as `blp_{token}_{name}`. Login code that reads
  its CSRF cookie by name from `document.cookie` (Django/Instagram `csrftoken`,
  Laravel/axios/Angular `XSRF-TOKEN`) never found it, so the login POST failed CSRF.
  Cookies a page set from script were never prefixed, so they never reached the site.
- **Redirects followed server-side.** A `/` → `/login` redirect was resolved on the
  server, so the browser stayed on `/` while showing `/login`, and a router rendered the
  wrong route.
- **Cookie deletions lost.** Cookies were re-emitted from an httpx jar, which drops
  expired cookies, so a site's sign-out never cleared anything.
- **Shared origin with the API.** Every reviewed site's scripts, including third-party
  tags on it, ran same-origin with Backline's API, where the refresh cookie
  (`/api/v1/auth`) lives, and all proxied sites shared one localStorage.

## Decision

**Each proxy-mode link gets its own origin: `{label}.{PROXY_PREVIEW_DOMAIN}`.**

- `label` is the base32 of the share token (`modules/proxy/preview_host.py`): lowercase,
  DNS-safe, reversible. Share tokens are mixed-case and hostnames are not, so the token
  can't be used directly. Reversible means no stored field and no migration; every
  existing proxy link gets a preview origin immediately.
- `PreviewHostMiddleware` (outermost) re-addresses *every* request on a preview host to
  `/proxy/{token}{path}`, so no API route, widget file, MCP mount or `/ws` socket can be
  reached from a preview origin. A malformed preview label is a 404; websockets on a
  preview host are closed.
- On a preview origin the proxy (`service.py`):
  - forwards the browser's `Cookie` header unchanged (the origin belongs to one link);
  - relays each upstream `Set-Cookie` under its **real name**, keeping Path, expiry and
    HttpOnly, dropping Domain, and setting `Secure; SameSite=None; Partitioned` so the
    cookie survives the cross-site canvas iframe (CHIPS). Relaying headers carries
    deletions through;
  - returns redirects to the browser with a root-relative `Location` (absolute when
    off-site), so the address bar always matches the page shown;
  - maps `Referer` by swapping only the origin, and drops a Referer from elsewhere (the
    dashboard framing the canvas).
- The HTML rewriter and interceptor run with an empty prefix: root-relative URLs are left
  alone, and absolute URLs naming the site lose their origin. The interceptor also rewrites
  cookies written through `document.cookie` to the same attributes as the server relay.
- Proxy requests now forward `sec-ch-ua*` and `upgrade-insecure-requests`, plus
  `Sec-Fetch-*` normalised to a direct visit (`dest=document`, `site=none` for the framed
  navigation). A UA claiming Chrome without client hints, or a cross-site iframe
  navigation, is what Fetch-Metadata policies and WAFs refuse.
- `ShareLinkOut.preview_origin` / `ReviewResolveOut.preview_origin` (nullable, additive)
  tell the dashboard canvas and the guest handoff where to go. The dashboard addresses
  postMessage to the iframe's actual origin (`canvas-origin.ts`).
- Config: `PROXY_PREVIEW_DOMAIN` / `PROXY_PREVIEW_SCHEME`. Unset means
  `preview.localhost:8000` locally (browsers resolve `*.localhost` to loopback with no
  setup) and **off** in every other environment, so deploying this before wildcard DNS
  exists changes nothing. Off (or `null` `preview_origin`) keeps the legacy
  `/proxy/{token}/` mode, which is unchanged and still served.

## Consequences

- SPA routers, root-relative assets, CSS `url()`, `srcset` and web workers now resolve
  natively on the preview origin, with no rewriting involved.
- Production needs a wildcard DNS record and a wildcard TLS certificate. The preview
  domain should be a registrable domain separate from the dashboard's, so a reviewed site
  can never set cookies on Backline's own domain. Follow-up: list the preview domain on
  the Public Suffix List, so one link's page can't set a parent-domain cookie that another
  link's origin would receive.
- Not yet covered, unchanged from TDR-0035: a site's API on a different subdomain
  (`api.site.com`, still direct from the browser and so subject to CORS), the site's own
  WebSockets/SSE (the proxy still buffers whole responses), and framed third-party SSO
  (Google/Microsoft/Okta refuse to be framed; a redirect there leaves the canvas).
- Bot-gated sites (Instagram, Google properties, banks) can still refuse a datacenter IP
  with a non-browser TLS fingerprint. Expect the Instagram login itself to stay blocked;
  what this fixes is the class of site Backline's customers review.

## Follow-ups, in priority order

1. **Session handoff from the reviewer's own browser.** The reviewer signs in on the real
   site in a normal tab (any SSO, 2FA or passkey works there), and the Backline extension
   exports that site's cookies (`chrome.cookies`, HttpOnly included) and localStorage. The
   dashboard passes them into the canvas, and a preview-origin endpoint re-issues them as
   partitioned cookies. Nothing is stored server-side. This is what makes Google SSO work
   in the canvas, and it depends on this TDR (real cookie names, one origin per link).
   Limit: sessions bound to IP or device are rejected when replayed from the server's IP.
2. **Snapshot mode with a Sync button** for sites that stay blocked: the extension captures
   the signed-in page's DOM and the canvas shows it for pinning comments. Not
   interactive, but works for any page the reviewer can see.
3. **Cloud login browser** (no extension): a streamed server-side Chromium used only for
   the sign-in step, whose `storageState()` feeds the same import as (1). Its egress IP
   matches the proxy's, which suits IP-bound sessions. Google blocks sign-in from automated
   Chromium, so this doesn't replace (1) for Google SSO.
4. Proxy the site's own subdomains (host mapping) and stream responses/WebSockets.
