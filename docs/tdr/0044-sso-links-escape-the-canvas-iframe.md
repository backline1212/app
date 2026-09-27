# TDR-0044: SSO clicks/submits escape the canvas into a real tab

Date: 2026-09-27
Status: Accepted

## Context

TDR-0040/0041/0042 fixed sites with their own login, and gave two ways to carry a session
from Google/Microsoft SSO into the canvas (extension sync, cloud login browser). Neither
addresses what happens the moment a reviewer clicks "Sign in with Google" **inside the
canvas itself**: the identity provider's own sign-in page refuses to render in any iframe
at all (`X-Frame-Options`/`frame-ancestors`, enforced by the browser - the same
browser-side restriction TDR-0040/0042 already document as unfixable by proxying). Left
alone, that click just fails - a blank frame or a browser error page, with no indication
of why or what to do instead.

This is not fixable by rewriting the request (there's nothing to rewrite - the provider's
own page is refusing to be framed, not asking for a different URL) and it is not something
any reverse proxy technique changes: this is true for every tool in this space, and true
regardless of what domain or certificate serves the canvas.

## Decision

**Open the identity provider's own sign-in page in a real, separate browser tab instead of
navigating it inside the canvas.** This is not a bypass of anything - it's exactly how the
provider's own sign-in is meant to be reached, and nothing stops it today: the canvas
iframe carries no `sandbox` attribute (confirmed in TDR-0040's original investigation), so
a plain `window.open()` already escapes it with the browser's full cooperation.

`modules/proxy/interceptor.py` gained two capturing listeners, installed in every proxied
page alongside its existing `fetch`/`XHR`/history patches:

- A `click` listener that finds the nearest `<a href>` ancestor of the click target. If its
  resolved host matches a short, explicit allowlist of real identity-provider domains
  (Google, Microsoft, Apple, Facebook, GitHub, Okta, Auth0, Yahoo - exact host or subdomain
  match only, not a substring test, so a lookalike domain like
  `accounts.google.com.evil.com` does not match) and the link doesn't already carry
  `target="_blank"`, the click is prevented and `window.open(href, "_blank")` runs instead.
- A `submit` listener with the same host check against the form's `action`. Because a POST
  form's fields (some possibly filled in by the page's own script right before submit)
  can't be reconstructed from a static URL, the handler opens a blank popup and clones each
  named field into a form built inside *that* window's own document (accessible
  same-origin before the popup navigates away), then submits it there.

The resulting sign-in happens entirely on the provider's/site's own real domain, exactly as
if the member had opened it themselves in a new tab - carrying that session into the canvas
afterward still goes through the extension's existing Sync action (docs/tdr/0041); nothing
here reads, stores, or transmits anything from the popup itself.

## Consequences

- A click or form-based "Sign in with Google/Microsoft/..." button now opens somewhere the
  sign-in can actually complete, instead of silently failing inside the canvas. This is
  worth it even before session sync is used: it stops the canvas from looking broken.
- Not caught: a bare `location.href = "..."` (or `location.assign`/`.replace`) JS
  assignment to an identity provider's domain, with no clickable link or form submit event
  behind it. Browsers expose no cancelable event for that - only a click or a form submit
  can be intercepted this way. In practice most "Sign in with X" buttons are one of the two
  covered patterns (a link, a form, or already `window.open()`, which needed no help to
  begin with).
- The provider allowlist is necessarily incomplete (any OAuth/SSO provider not on the list
  still hits the iframe restriction unhelped) - kept short and explicit rather than
  pattern-matching broadly, so a normal link to some unrelated site is never redirected
  into a popup by mistake.
- Still doesn't remove the need for TDR-0041's extension-based sync (or TDR-0042's cloud
  browser) to actually bring the resulting session into the canvas - this only fixes the
  sign-in *attempt* itself, not the handoff, which remains a deliberate one extra click
  (reading a cross-origin site's own session cookie is restricted by the browser
  specifically to prevent exactly this kind of automatic, silent cookie handoff; only the
  extension's `chrome.cookies` permission or Playwright's own browser-automation API can
  do it, both already built).
