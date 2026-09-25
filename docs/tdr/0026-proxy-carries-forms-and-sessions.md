# TDR-0026: The review proxy carries forms and the session they establish

Date: 2026-09-20
Status: Accepted

## Context

Reviewing anything behind the client's own login was impossible. `modules/proxy/router.py`
registered GET routes only, so submitting a login form inside the canvas produced a 405;
`service.py` called `client.get()` with no cookies in either direction and built its
response from status/content-type/body alone, so even a hypothetical POST would have
dropped the session on the next request. TDR-0008 scoped this out on purpose ("forms,
cookies ... a multi-week project"), which was the right call for that milestone but left
every members-area, staging-behind-basic-auth and logged-in-dashboard page unreviewable.

## Decision

**POST is proxied, and the session it establishes is kept.** GET and POST only - a login
is a form, and PUT/PATCH/DELETE only ever reach a site through its own JavaScript, which
this proxy doesn't rewrite anyway. Each method gets its own function rather than one
`api_route(methods=[...])`, because FastAPI derives an operation id from function name
plus path and a shared function produces a duplicate that openapi-typescript rejects -
the trap `fallback_router.py` already documents.

**Session cookies are namespaced and path-scoped, never copied through.** The site's
`Set-Cookie: sid=...` is re-emitted to the reviewer as
`blp_{share_token}_sid=...; Path=/proxy/{share_token}`, and on the way back up only
cookies carrying that exact prefix are forwarded, with the prefix stripped. Two
consequences, both load-bearing: Backline's own cookies on the API origin can never be
handed to a third-party site, and two share links cannot see each other's session even
in the same browser. The site's own `HttpOnly` flag is mirrored rather than imposed,
since its scripts may legitimately read its cookies.

**The cookies are `SameSite=None; Secure; Partitioned` outside local.** The canvas is an
iframe on the dashboard origin pointing at the API origin, which is cross-site in
production; without `SameSite=None` the cookie is never sent, and without `Partitioned`
(CHIPS) third-party cookie restrictions drop it. Partitioning also keys the session to
the dashboard page that opened it, which is the scope we want anyway. Locally both sides
are localhost, which is same-site, so `Lax` applies and there is no HTTPS to carry
`Secure`. Same environment split as the refresh cookie in `modules/auth/router.py`.

**`Origin` and `Referer` are rewritten to the site's own address.** The reviewer's
browser sends Backline's, which any CSRF check on the target would reject. The request
genuinely did originate from that site's own form one hop earlier.

**A form's redirect is handed to the browser, not followed server-side.** A POST that
answers 3xx returns a 303 to the equivalent `/proxy/{token}/...` path, carrying the
session cookie, so the frame's URL ends up matching the page it is showing. GET keeps
following redirects server-side exactly as before. A redirect to a different origin (an
SSO host) is returned as the absolute URL it is - Backline has no share link for that
origin and shouldn't invent one.

**Bodies are capped at 2 MiB**, checked against the declared `Content-Length` before
reading and against the bytes actually received afterwards. This is a review proxy, not
an upload relay.

## Consequences

- Credentials typed into the canvas pass through Backline's server in transit. Nothing
  is stored: no credential, no session, no cookie is persisted server-side, and the
  session lives only in the reviewer's own browser. Each reviewer logs in as themselves.
- The SSRF guard still runs before every hop, including the POST.
- Sites that gate login behind their own JavaScript (an XHR login, a SPA router) still
  won't work - that is the unchanged part of TDR-0008. *(2026-09-26: superseded by
  TDR-0035, which routes a page's own scripted requests through the proxy.)*
- A reviewer's session is bound to the share link's path, so rotating the link ends it.
