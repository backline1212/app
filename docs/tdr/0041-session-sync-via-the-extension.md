# TDR-0041: Sign in outside the canvas, sync the session in through the extension

Date: 2026-09-27
Status: Accepted

## Context

TDR-0040 made a proxy-mode link serve the reviewed site under its own real paths and real
cookie names, which fixed sites with their own login form. It doesn't help third-party
single sign-on (Google, Microsoft, Okta): those refuse to render inside any iframe at all
(`X-Frame-Options`/`frame-ancestors`, enforced by the browser, not by Backline's proxy),
and Google additionally blocks sign-in attempted from automated/server-side browsers. No
amount of proxying reaches a page that won't load in a frame in the first place.

The one place that already holds a real, signed-in session for any site is the member's
own browser - specifically the Backline extension, which since its first version reads a
page's cookies and localStorage would be the same data a site's own server already trusts.
`chrome.cookies` can read a site's cookies including `HttpOnly` ones (the flag a login
session cookie almost always carries), which neither a content script's
`document.cookie` nor a server-side proxy fetch can ever see.

## Decision

**The extension exports a signed-in tab's session; the proxy imports it as a one-time
ticket, redeemed on the link's own preview origin.**

1. In the popup, when the active tab's origin matches a project the member has access to,
   a "Sync this session to the canvas" button appears (`popup.ts`/`popup.html`).
2. Clicking it messages the background worker (`background.ts`), which:
   - reads every cookie for that origin via `chrome.cookies.getAll` (manifest now
     declares `"cookies"` + `"host_permissions": ["<all_urls>"]` - `content_scripts`
     matches alone don't grant the cookies API access);
   - reads `localStorage` via `chrome.scripting.executeScript` into the active tab (many
     SPA auth libraries, e.g. Firebase/Supabase, keep their session token there instead of
     a cookie);
   - `POST /api/v1/projects/{project_id}/session-sync` (new `modules/session_sync`,
     `project:manage`-gated, same permission `browser_render`'s dashboard-only actions
     use) with that payload. The service resolves the project's active proxy-mode share
     link, stores the payload in Redis under a random 24-byte ticket (`session_sync:*`,
     5-minute TTL), and returns `redeem_url` - the link's `preview_origin` (TDR-0040)
     plus `/__backline/session-sync?ticket=...`. **Refused outright when the project's
     link has no preview origin** (`PROXY_PREVIEW_DOMAIN` unset): the legacy
     `/proxy/{token}/` mode renames every cookie, so there's no way to carry a session
     under its real name there without either breaking that renaming or landing a
     reviewed site's cookies on Backline's own API domain.
   - opens `redeem_url` in a new, unfocused, short-lived tab (closed ~2.5s later). The
     member never sees it.
3. `GET /proxy/{share_token}/__backline/session-sync` (registered in
   `modules/proxy/router.py` **before** the catch-all `{path:path}` route, which would
   otherwise swallow this literal path and try to forward it upstream) is the redeem
   endpoint. It only ever answers on a link's preview origin (checked via the same
   `PreviewHostMiddleware` state TDR-0040 added; anywhere else it's a 422). It:
   - looks the ticket up in Redis and deletes it immediately - one-time, whether or not
     what follows succeeds, so a replayed or tampered ticket can never redeem twice;
   - emits each cookie as a real `Set-Cookie` (no renaming), with the same attributes
     TDR-0040's server-side relay already uses (`Secure; SameSite=None; Partitioned` when
     the preview origin is https/`*.localhost`, else `SameSite=Lax`);
   - returns a tiny HTML page whose inline script writes each localStorage entry (values
     escaped the same way `proxy/interceptor.py`'s injected script already is - `<`/`>`/
     `&`/line separators - since a cookie or storage value is attacker-adjacent input by
     the time it reaches an inline `<script>`) then `location.replace("/")`.
   - Since cookies and localStorage are both scoped per browser-origin, not per-tab, this
     redeem happening in an invisible background tab is enough: the canvas iframe, being
     the same preview origin, picks up both the next time it loads or reloads - no
     coordination with an open dashboard tab is needed.

## Consequences

- Works for anything a member can sign into themselves in a normal tab: Google/Microsoft/
  Okta SSO, 2FA, passkeys, magic links - all of it happens in the member's real browser,
  so whatever the identity provider requires already worked before Sync was ever clicked.
- Needs the extension and a project the member already has `project:manage` on; a guest
  reviewer with only a share link can't trigger this (by design - it carries the
  *member's own* session, not something a guest should be able to mint).
- Sessions bound to the signing-in device or IP (uncommon, but some banking/enterprise
  apps do this) will still be rejected once replayed through the proxy's own egress IP -
  no session-carrying mechanism changes what IP subsequent requests come from.
- Depends on TDR-0040's preview origin; a deployment that hasn't set
  `PROXY_PREVIEW_DOMAIN` yet sees a clear error asking for it, not a silent no-op.
- Extension permissions grew (`cookies`, `host_permissions: <all_urls>`) - worth calling
  out in the next Web Store listing/description update, since `chrome.cookies` is a
  sensitive permission class.

## Follow-ups

- A "Sync session" affordance directly in the dashboard canvas (today it's extension-only,
  in the popup) - would need the dashboard to detect a mismatched/expired session and
  prompt, rather than the member remembering to click Sync proactively.
- The cloud login browser (docs/tdr/0042) reuses this exact ticket/redeem pipeline for
  reviewers without the extension installed - it captures the same cookie+localStorage
  shape from a server-side browser and posts to the same `session-sync` endpoint.
