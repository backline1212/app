# TDR-0150: Client branding, review domains and white-label portals

Date: 2026-10-24. Replaces the pricing "Coming soon" rows "Custom branding & domains"
and "White-label client portals"; removes "Cloud login browser sessions".

## Decision

New `branding` module. Only what **clients** see changes; the team dashboard keeps
Backline's look.

- **Branding (Team, Enterprise):** client-facing name, accent colour, logo (PNG/JPG/
  WebP <= 512 KB, stored under `branding/{workspace}/`, signed on read) and support
  email, on `workspace.branding`. Returned publicly as `ReviewResolveOut.branding`;
  review gates show the logo/name/support email and the accent replaces Backline mint.
  A lapsed plan falls back to Backline's look without deleting settings.
- **White-label (Enterprise):** `hide_backline_branding` removes "Backline" from client
  review pages and the portal ("Powered by Backline", policy copy).
- **Review domains (Team, Enterprise):** up to 5 hosts per workspace in
  `custom_domains` (unique host index, additive). Ownership is proven with a TXT record
  `_backline-verify.<host>` = `backline-verify=<token>`, checked over DNS-over-HTTPS. A
  CNAME to `CUSTOM_DOMAIN_CNAME_TARGET` routes it. With `VERCEL_API_TOKEN` +
  `VERCEL_PROJECT_ID` (+ optional team) the API attaches the verified domain to the
  web project; otherwise the domain shows "Verified" until an operator attaches it.
  Once connected, every copied review link uses the domain, and its root shows a
  branded client portal ("paste your review link") instead of sign-in. Member sign-in
  stays on the dashboard origin (AuthOriginMiddleware is unchanged); guest APIs were
  already origin-agnostic.
- **Cloud login sessions** are removed from pricing rather than sold: they need the
  isolated server-browser infrastructure TDR-0065 keeps disabled. Native website
  sign-in through the extension is the supported path. The unused
  `CloudLoginModal` component is deleted.

## Verification

ruff/format/mypy/scoping, lint/typecheck/build, regenerated types. Chromium: saved
name/colour/support email and a logo on Team; added two domains (DoH is blocked in
this sandbox, so verification showed the DNS error state); the guest PDF review gate
and review screen showed the brand. `GET /branding/by-host` returned the brand for a
domain marked verified.
