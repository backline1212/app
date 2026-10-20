# TDR-0096: Distinct review pages for #/ and #!/ routes

Date: 2026-10-21. Scope: F16/FD-08/09 navigation and deploy capture.

## Problem

Normalization discarded every fragment. A website using #/settings and #/checkout
therefore registered the same page, combining comments, revisions and approvals.
The standalone widget also omitted fragments from its route follower. Ordinary
same-page hash navigation could leave its registered document URL stale and reject
later comment capture even though the page identity was intentionally unchanged.

## Decision

Recognize fragments beginning / or !/ as page routes. Preserve their exact case,
encoding and query-like suffix in normalized page identity. Ordinary #section and
unrecognized fragments still use the established fragment-less identity; arbitrary
fragment routers are not claimed supported. Ordinary non-route OAuth callback
fragments remain omitted from page registration. Route/query parameters are preserved;
this slice does not add sensitive-URL redaction. Existing scheme/host/path/query
normalization is otherwise kept.

Widget registration includes recognized route fragments. It checks the returned
canonical fragment before accepting a route's page ID, refusing an older server's
collapsed root response before posting feedback/capturing a version against it.
Native review shares that registration helper. The standalone route follower also
tracks the raw document URL independently from its page identity, so same-page
anchor navigation can rebind its capture URL. Track the last observed document URL
separately from the registered URL to avoid indefinitely rearming its debounce.
Draft protection and registration-race checks from TDR-0093 remain in place.

Card headers stay bound to the registered page while a draft holds an earlier route.
Portal page labels, grouped comments, new-ticket page choices and ticket paths
include route/query context. Identical page titles no longer hide distinct routes.
The existing canvas URL builder already carries page URL fragments into the iframe;
the website's own browser/router still performs its route rendering.

Deploy capture uses the same canonical route identity, so notifications/captures for
different supported hash routes cannot match each other or the fragment-less root.
Keep other fragment formats unavailable. Add server-reported hash_routes_supported
to DeploySyncOut and gate hash credential creation against that capability; an older
backend must not be treated as supporting the new identity. Existing signing,
ordering, role, environment/start-page and snapshot association rules are retained.
Receipt/capture still does not attest deployed code, application state or a fix.

## Legacy and rollout

No existing pages/comments/revisions/approvals are moved or deleted. New hash routes
have distinct URL strings under the existing tenant/project unique index. Old merged
feedback stays on its legacy page, since its original route cannot be inferred
reliably. It remains available through that page and the portal's saved-feedback
list. Migration/reassignment would need an explicit reviewed mapping, not a guessed
backfill. Non-fragment registration continues to find existing page IDs.

Widget/backend ship together; extension source is 0.4.9. The returned-fragment check
and deploy capability protect new clients talking to an old/mixed backend. Rollback
does not remove new page records, but supported route registration requires the
matching server/SDK behavior. Backend rollout is still subject to Railway's pause;
installed Chrome remains 0.4.3. No extension permission or server-browser change.

## Verification

Backend Ruff app/scripts, strict mypy app (214 files) and scope checks (23 repositories)
pass. Exported OpenAPI from Pydantic and regenerated packages/types, including the
additive deploy capability. Full frontend lint/typecheck/build passes 12/12 after
the route/debounce/old-server guards. Existing web chunk advisory remains and diff
checks pass. No test suite, live route registration,
production notification, feedback write or migration run.

Acceptance remains open: #/ and #!/ navigation/query/case/encoding, root versus
route identity, ordinary anchors, legacy feedback visibility, hash-selected portal
reload/return, late registration/draft races, independent version/approval histories,
old-server rejection, deploy route mismatch and guest/current-role/access negatives.
Also retain existing non-hash page parity. No universal SPA/SSO compatibility claim.
