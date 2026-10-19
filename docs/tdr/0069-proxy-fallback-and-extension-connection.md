# TDR-0069: Explicit proxy recovery and extension connection

Date: 2026-10-19. Status: deployed in f568294; interactive browser acceptance open.

## Decision and evidence

The user identified Backline, YouTube and Notion as failing reviewed sites and asked
for a clear extension fallback. Keep the existing proxy canvas; add loading/sign-in
help, a 15-second missing-widget-acknowledgement state, Open with extension and Retry
proxy. A frame load alone doesn't declare tools connected. Match acknowledgement
source/origin; late readiness clears the notice. The action remains available after
connection because readiness cannot establish every site's login/application health.

Read-only HTTP checks on 2026-10-19: YouTube sends SAMEORIGIN; Notion landing/login
CSP restricts frame ancestors, and `www.notion.so/login` redirects to
`app.notion.com/login`. The deployed extension referenced
`https://app-production-f121.up.railway.app`, whose health endpoint returns 404.
The actual API is `https://backlinewidget-production.up.railway.app`.
These observations establish restrictions and a broken connection, not signed-in
browser acceptance. Proxy origin changes cannot reproduce the real site's session.

## Launch and identity

Ship extension 0.3.0 with the correct API default and protocol v2 reporting its API
URL and version. Reject stale/mismatched builds before issuing credentials; provide
the current download/update instructions. Tokens stay in extension storage/messages,
not target URLs/DOM. Open/reuse the real tab and preserve its login. The content
script creates its toolbar and reports a random launch ID; the background checks
current project/guest access before acknowledging. No acknowledgement within 15
seconds is an explicit error. The portal revokes newly issued failed credentials.
Target tabs remain open. Cross-origin redirects require a matching project address;
do not silently approve all subdomains or identity providers. SSO pages get no overlay.

Member launch credentials are project-bound, last eight hours, preserve original
authentication time/session family, and stop on family end or membership/proof loss.
Resource guards enforce the bound project. Keep them in tab session storage,
separate from the manual workspace connection. Manual tokens last 30 days (legacy
records derive expiry from creation). All extension tokens use an explicit review
route allowlist excluding account/billing/membership/credential management. This is
a partial F14 repair; broader recovery and MCP expiry remain open.

Native snapshots use the shared contract and project/page-scoped relay. Existing
portal tickets/evidence remain the same system. Full replies/edits/panel parity,
ticket locate after login, cross-origin migration, installed-site auth exchange
(CR-02/03), device lab and universal compatibility remain outside this slice.

## Verification

Regenerate Pydantic contracts and run lint/typecheck/build; inspect deployed commit,
extension manifest/API URL and route guards. Unpacked extensions require users to
download 0.3.0, replace/reload the extension and reload Backline once. Browser control
is disabled in Work settings: Chrome/Edge extension launch and signed-in target-site
acceptance remain manual. Never infer 99% reliability from headers/static checks.

Vercel and all three Railway services report success on f568294. Live dashboard
chunks contain the fallback, the extension ZIP/manifest report 0.3.0 and bundle the
correct API/protocol/readiness handler without the obsolete host. Health and route
guards pass; existing SDK bytes match the built source. Full signed-in site behavior
is still unverified for the reason above. See the delivery ledger for exact IDs.
