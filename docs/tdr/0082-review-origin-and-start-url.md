# TDR-0082: Keep the website origin separate from its starting URL

Date: 2026-10-20. Scope: audit F16 and the user's site-loading flow repair.

## Decision

Preserve the existing create/update request field `target_origin` accepting a full
HTTP(S) review address. New writes store the canonical security origin in
`target_origin` and the normalized full address in additive `start_url`. Read models
derive both from legacy full-address records without a backfill. Assets retain an
empty origin/no starting URL. Duplication retains the starting page. New writes
validate ports/hostnames, forbid credentials/backslashes/control characters, preserve
path trailing slashes and query/hash, normalize host casing/IDNA/default ports and
accept addresses without a scheme even when their query contains `://`.

Proxy URL/header/referer/redirect logic uses only the security origin. Widget page
registration also derives an actual origin rather than concatenating onto a path or
query. Portal canvas and guest preview handoff use the initial path/query/hash;
native launch, edit form, cards/search/details and MCP summaries retain the full
starting address. Canvas control query parameters are inserted before the hash.
Opening a project without an explicit saved-page selection starts at its configured
address, instead of silently choosing the first page from a previous project URL.
Explicit older-page links keep their feedback context, explain an origin mismatch
and offer Open current website rather than launching the extension on a foreign site.
Changing the project's source URL resets widget readiness and remounts its preview,
so the preceding website's ready state cannot enable the new page's tools.
Preview capture/cache identity and the disabled cloud-login initial address retain
the starting URL. No browser isolation flag or proxy capability promise changes.

Extension auto-detection matches canonical and common legacy full URLs at an origin
boundary, with case/default-port compatibility; tenant/access checks stay in place.
The sample exemption now considers the starting URL, so converting it to a real
page on the same host still checks project capacity transactionally (TDR-0080).

## Compatibility and acceptance

No destructive migration, page/comment rewrite or production project change. Old
invalid-port/IDNA host records remain displayable for correction; this does not make
their network address loadable. Existing page URL normalization still omits fragments:
loading an initial hash route is supported in source, but distinct hash-route comment
identity/reproduction is not implemented by this slice. Review URLs still have their
existing request-length ceiling. SSO/redirect-origin, streaming and multi-domain
limitations remain explicit; native fallback is still needed on affected sites.

Static checks pass: frontend lint/typecheck/build (12/12 Turbo tasks before the
final web flow refinements; affected web checks/build pass again afterward), backend
Ruff, full mypy (204 files), affected-module follow-up mypy, workspace scoping (20
repositories), generated contracts and diff checks. Existing chunk advisory remains.
No suite written/run per Codex instructions. Pending manual acceptance: create/edit/duplicate
and reopen `/app/`, query and hash starts; legacy `/app/app/login` reproduction;
proxy links/forms/referers/page identity; native guest/member launch; default/nondefault
ports; sample conversion at the limit; signed preview cache changes and MCP output.
No live project/feedback was created and browser use remains unavailable.
