# Connected website review: implementation plan

Date: 2026-10-19. Status: implementation started; CR-01 partially implemented,
CR-02..06 planned. No live acceptance group is verified.
Read with [product brief](review-product-brief-2026-10-19.md),
[TDR-0060](../tdr/0060-connected-website-review.md) and
[open audit](site-gap-audit-2026-10-19.md).

The user subsequently authorized implementation. The first access/session/retry
subset is recorded in [TDR-0061](../tdr/0061-connected-review-access-foundation.md)
and [the delivery ledger](06-delivery.md). The primary widget launch and installation
flow are still pending; the existing project launch behavior has not been switched.
Google sign-in state protection is the subsequent CR-01 increment in
[TDR-0062](../tdr/0062-google-sign-in-state.md); provider acceptance remains open.
The next auth increment adds cross-tab refresh serialization where Web Locks are
supported, startup restore race protection and atomic OTP verification
([TDR-0063](../tdr/0063-auth-concurrency.md)). These remain live acceptance items.

## 1. Release boundary and product contract

Primary audience: teams reviewing websites/staging apps they can instrument.
The first release must complete connect -> review -> portal ticket -> open live
issue -> fix reference -> verify/reopen. Existing image/PDF and extension workflows
remain supported. Cloud browsers, a device lab, automatic deployments and a new
desktop browser are not prerequisites or claims of this release.

**Portal:** project overview and ticket evidence/discussion open inside Backline.
**Live website:** Start review and Open on site open the actual site's top-level
tab with a Backline panel. They never silently attempt proxy login or switch modes.
Show "Opens your website with Backline review tools" beside the primary action.
Keep the portal open and remember the selected ticket through URL parameters.
Use the same behavior for public and authenticated connected sites.

The configured project chooses the launch adapter. Reviewers do not choose a
technical mode on every visit. If the widget is absent, show a connection problem
and allow ticket/evidence access; offer extension setup only as an explicit alternate.
Existing legacy proxy projects retain a clearly identified legacy route until their
owner opts into migration. No existing project is silently rerouted or deleted.

## 2. Required flows and failure behavior

| Step | Successful behavior | Failure/recovery |
|---|---|---|
| Connect project | Manager registers exact review origins/start URL, installs a public integration ID and verifies the widget on a representative route | Show missing script, CSP/connectivity, unsupported SDK or configuration error. A checkbox/heartbeat alone never claims authentication works. Setup retries resume the same project. |
| Join review | Existing share-link name/passcode/expiry policy applies once; members retain their real identity | Expired/revoked links stop access. Invalid cached identity returns to a clear rejoin flow. No downgrade of a member to a guest. |
| Start review | Open actual website, preserve the requested page/ticket and connect its panel | Blocked popup gets an explicit Open review button. No widget acknowledgement within 15 seconds becomes an actionable connection state, not a successful load. |
| Website sign-in | User logs in using the site's normal flow; pending ticket resumes after return | Show "Sign in to this website, then continue review" where needed. Do not claim Backline can detect every site's login state. Missing return route offers Continue to reported page. |
| Add issue | Pin/region, text and available evidence become one durable ticket | Preserve draft on capture/upload/save failure; display missing/approximate evidence; allow retry or explicit submission without screenshot. Repeated submit must not duplicate the ticket. |
| Open portal ticket | Authorized member sees the same ticket regardless of widget/extension source | Missing/deleted screenshot shows a specific state; a refreshed signed URL must not require another website login. Guest/team filtering is server-side. |
| Open on site | After own website login, locate the selected ticket and open its discussion | Different role/data/deployment, absent route or anchor yields an honest mismatch state; keep original evidence and offer manual reanchor to an authorized member. Never replay mutations to reconstruct a page. |
| Fix and verify | Attach approved preview/deployment, move to In review, verify, resolve or reopen | Changed origin must be explicitly allowed before navigation; login is per environment. Missing preview or failed verification leaves the issue open/In review, never automatically resolved. |
| End/access loss | Stop session, clear protected UI/cache and detach review listeners | Revoke/expiry/archive/role removal must stop HTTP writes and active realtime. Target website itself continues to function. |

Draft state is transient and scoped to actor/project/page. Warn before navigation
would discard it; do not use localStorage as a business-data queue. Server data uses
React Query; filters and selected ticket use URL parameters. Backend events reconcile
portal and panel after reconnect; stale requests cannot populate a new page/account.

## 3. Identity, installation and handoff contract

There are two independent identities: Backline reviewer and target-website user.
Backline never receives the target password, cookie jar or MFA secret. An invited
reviewer still needs any website credentials their site requires. Origin headers,
an installation ID and an unverified display name are not proof of member identity.

New installations embed a **public installation ID**, approved origins and SDK
configuration, not the permanent review/share credential used by TDR-0002. The
widget stays inactive for ordinary site visitors unless an authorized review starts.
Keep one share-link policy for guests; members use a project-bound session with live
membership/role checks. Public integration endpoints reveal no project content.

Proposed handoff protocol (final schemas are Pydantic-owned):

1. The portal creates a short-lived launch intent containing workspace, project,
   actor reference, permitted adapter/origin, page, optional ticket and return URL.
   The URL carries only an opaque, non-authorizing intent locator. Never put a
   reusable access token, name, website credential or arbitrary redirect in it.
2. The widget removes that locator from the visible URL immediately, retains the
   pending intent in tab session storage and creates a verifier/challenge pair.
   Installation must load early on the application's login/return routes. Protect
   the locator from logs/referrers where feasible; it must be harmless on its own.
3. A top-level Backline authorization window uses the current member/guest session
   to authorize the intent, with CSRF state and the widget's challenge. A blocked
   window has an explicit Continue review action. If identity is missing, rejoin
   there; do not grant access from the locator. Bind the response to the initiating
   window, exact registered origin, intent and challenge.
4. Return an expiring, single-use code through an exact-origin, source-checked
   message or registered callback. Redeem with the verifier and atomically consume
   the code. Issue only a short-lived, project-scoped review token. Initial design
   limits: intent 15 minutes, exchange code 60 seconds, review access 15 minutes;
   authorization/renewal must still enforce current link/member policy. Store code
   hashes; TTL deletion is cleanup, not the expiry check.
5. Keep bearer credentials in memory; tab storage holds only pending intent and
   the verifier until exchange. Reconnect/reload reauthorizes through Backline.
   Existing portal identity should be reused; expired guest identity returns to
   the gate. Target login redirects resume the saved intent; if a site strips it
   before the SDK runs, the user can return to Backline and reopen without losing
   the ticket. Never require copying website cookies.

Widget/extension messages and API calls use exact destination validation and live
resource authorization. A copied code, wrong origin/project, replay, expired intent
or removed member must fail closed. Same-origin website scripts are not a secure
vault: installed-widget tokens expose only permitted client-visible review data.
Team-only notes, contact records and administrative actions stay in the portal or
the extension's isolated sidebar. Do not send them into the customer's page.

## 4. Features, evidence and actual capability

| Surface | Required release behavior |
|---|---|
| Portal | All authorized tickets from all capture sources; immutable original evidence; replies/edit/status/assignment/tags/priority/due dates; Open on site; preview reference and verification history |
| Installed widget | Consistent Browse/Comment/Region panel; client-visible threads, own edits/deletes/replies and role-permitted workflow; current ticket highlight; Return to Backline; keyboard/mobile usability |
| Extension | Same core capture, thread and page identity contracts; existing member/guest access retained; native screenshots and snapshot submission; one active overlay when widget and extension coexist |
| Responsive review | Widget reports actual viewport; user can resize manually. Exact presets require an available browser-control adapter. Clearly distinguish requested preset from measured viewport. |
| Browser/device selection | Record the actual engine/device; labels never substitute for execution. Existing alternate-engine static renders remain explicitly unauthenticated screenshots, not interactive signed-in sessions or real-device results. |
| Later QA lab | Separate priced capability with actual engine/OS/device, private-network connectivity, session isolation and supported automation; no embedded provider integration promised before feasibility and commercial verification |

The separate TypeScript widget remains lightweight. Share headless thread/anchor
logic between adapters and use consistent design tokens; do not force React into
the SDK or duplicate authorization logic in each UI.

Capture records include canonical page, observed viewport/browser when permitted,
timestamp, capture source, SDK version, anchor/region, reproduction notes and optional
deployment/preview reference. Browser/device details honor the existing capture
preference; unavailable fields stay unknown. No full session replay in this release.

**Screenshot limitation must be addressed explicitly:** the current widget's DOM
rasterizer can omit cross-origin styles/images and cannot guarantee a faithful
authenticated screenshot. A successful JPEG encoding is not proof of fidelity.
Preview the result; label DOM captures approximate. Offer explicit screen capture
where browser-supported and permission-granted, or manual screenshot attachment.
The extension can supply native tab capture. Capture denial/failure must not erase
the draft or silently substitute a fresh unauthenticated server screenshot.

Exclude password inputs, configured private selectors and credential-bearing URLs
from DOM/text evidence. Provide preview/redaction before upload; do not assume
screenshots are automatically safe. Never record identity-provider pages. Screenshot
objects inherit ticket/project visibility and private signed access. A guest's
snapshot upload does not grant permission to read whole-page snapshots or team data.

Persist the original evidence immutably; reanchor and verification append events
and new evidence. A normalized DOM snapshot is not an archived runnable website.
Scope recovery by environment, page and compatible view context so a different
user's personalized DOM cannot overwrite the canonical revision for everyone.
Ambiguous/closed-shadow/canvas/third-party-frame targets fall back to evidence with
an explicit limited-anchor state, not a fabricated element position.

## 5. Backend contracts, storage and integration seams

Preserve React/Vite, FastAPI router -> service -> repository, MongoDB, Redis/Arq and
private S3-compatible storage. Suggested ownership: new `review_sessions` module
for launch/authorize/exchange/status/end; existing projects/share_links for setup
and policy; existing comments/pages/snapshot/recovery/realtime for review behavior.
Extend the current MCP module rather than creating another ticket system.

| Contract | Additive fields/behavior |
|---|---|
| Project review configuration | Installation ID, exact allowed origins, start URL, preferred adapter, SDK minimum version, readiness/capabilities and checked-at time. Separate URL origin from path/query (F16). Explicit localhost/private-site settings for client-only review never relax server fetch policy. |
| Review intent/session | Workspace/project, actor reference, share-link reference or member binding, page/ticket, exact destination/return URL, expiry, capability set, connection/end state; no website credentials |
| Ticket evidence | Source `widget/extension/legacy`, environment, actual viewport, optional browser metadata/deployment, capture method/quality/failure, immutable evidence references; defaults for old records |
| Verification | Ticket, attempt ID, actor/tool identity, preview/deployment, outcome, timestamp, evidence and note. Attach to existing In review/resolved/reopened workflow without new parallel status vocabulary. |
| Mutations/events | Idempotency scoped by actor + resource + operation, payload consistency, optimistic revision check for conflicting edits, standard event/activity path for portal/widget/extension/MCP |

Proposed routes are project-scoped create-launch/config/status plus intent
authorize/exchange/end operations. Identity comes from current auth, never request
workspace fields alone. Rate-limit creation, exchanges, captures and writes; apply
workspace/project checks to every query and referenced object. Session changes must
close sockets and clear cached sensitive data, not merely reject the next save.

Define contracts in Pydantic, export OpenAPI using `backend/scripts/export_openapi.py`,
then regenerate `packages/types` through its `generate:local` script. Do not hand-edit
generated declarations. Keep SDK transport types aligned through generated type-only
references or generated small contracts without adding a runtime framework.

Add `review_intents`/session records with scoped indexes and expiry, and additive
evidence/verification metadata using existing repositories where possible. Inventory
current indexes first. Migration must have a dry run, collision report and resumable
backfill; do not merge distinct pages merely because secret/query parameters are
removed. Default legacy capture source to unknown/legacy and preserve original IDs.
Use approved route/query keys and configured hash-router semantics for new page
identity; remove handoff/auth parameters before normalization. Sensitive query data
must not be retained in display URLs or logs.

Persist ticket text independently of optional screenshot success; pending uploads
have retry/cleanup and cannot yield a false completed snapshot. Use pending/ready
snapshot state and durable job retry (F22). Storage limits require byte accounting
and reservations before new evidence retention is advertised (F24).

## 6. Implementation slices and exit criteria

Execute in order, recording changed contracts, acceptance evidence and remaining
failures in `06-delivery.md` after each slice. Completion means the exit condition
is demonstrated, not that files compile.

| Slice | Work and main code areas | Exit condition / dependency |
|---|---|---|
| CR-01: Trust and persistence | Audit F01-F10/F22; auth, actor access, comments/storage, realtime and snapshot services. Also F12-F15/F33-F34 where they affect review identities. Disable unsafe optional server-browser paths until F09 is addressed. | Verified identities, object ownership, replay scope, revocation, cache clearing, workspace refresh and recoverable snapshots. Blocks external pilot. |
| CR-02: Connected project setup | Projects schemas/service, ProjectForm and setup view; canonical URLs; install ID/config, capabilities and signed launch intent. Handle F16/F18/F30. | New/resumed setup, path-based URLs, configured origins and actual SDK handshake work; partial setup creates no duplicates. CR-01 contracts stable. |
| CR-03: One launch and auth flow | ReviewEntryPage, ProjectOverviewPage, widget bootstrap/guest-session, review_sessions module; handshake above and widget-first launch. | Guest/member launch, password/SSO return, expiry, blocked popup and missing SDK produce explicit states; no URL bearer or iframe-only auth dependency. |
| CR-04: Capture and panel parity | Widget composer/threads/attachments/snapshot and extension relay/content scripts; fix F17/F20/F21/F27, idempotency and source normalization. | Widget and extension create the same ticket shape, permitted replies/edits work, screenshots identify quality, drafts survive errors, native snapshots feed recovery, no duplicate overlays. |
| CR-05: Portal evidence and reproduction | Project/ticket detail, route selection, locate-ticket handshake, private evidence viewer, preview/verification records. | An extension report and a widget report can each be read in Backline, opened after own website login, fixed, verified and reopened; missing anchors/data do not hide evidence. |
| CR-06: AI/MCP and rollout | Existing mcp/tools.py/server.py, verification services, migration/install guide, capabilities, measurement and feature flags. | Authorized agents read evidence and create/reply/update feedback with idempotency, link previews and request verification. Browsing requires a separately authorized adapter. Pilot/rollback gates below pass before promotion. |

The rest of F01-F35 remains tracked in the audit; this plan does not close unrelated
billing, notification or AI findings. Any existing path exposed in the new journey
must satisfy the same actor/event rules, including MCP/AI mutations (F29). Image/PDF
review remains in the portal; changes to its shared comment path must preserve it
and address its idempotency gap (F31) if that path is modified.

## 7. AI/MCP loop and limits

Existing code already lists projects/tickets, reads threads, generates implementation
briefs, replies and changes status/priority. It does not establish an end-to-end
browser verification loop. Add scoped tools for creating an anchored issue from
authorized capture evidence, retrieving complete evidence, attaching a fix/preview,
requesting verification and recording its outcome. All call normal services, not
repositories directly; record tool identity and retain member/guest visibility.

Ticket access does not authorize browser control. A local extension/agent bridge
must bind to an explicitly authorized project/tab/session; unattended checks use a
separate configured environment/test identity. No automatic access to a person's
signed-in account. Repository access and code/deploy execution belong to the
connected coding tool under its own permissions. Default AI completion is In review;
a reviewer resolves or reopens. Automated resolution is a later opt-in policy.

## 8. Acceptance, measurement and rollout

Do not write/run automated test suites for this Codex task. Application slices
follow the repository's lint/typecheck/build rule;
the following are product acceptance scenarios to record as live manual evidence,
not a claim that a suite exists or has passed.

| Acceptance | Required evidence |
|---|---|
| CR-A01: Setup and zero-extension guest | New project, public route and authenticated route; guest joins once; first issue persists after reload; absent/CSP-blocked SDK has a useful recovery path |
| CR-A02: Authentication | Actual supported password and SSO sites; login redirect and popup; pending ticket survives; sign-out, changed role/data and missing target return handled without borrowed sessions |
| CR-A03: Cross-source continuity | Extension creates issue; portal displays it; installed widget locates it, and the reverse. Existing page/ticket IDs remain stable. Viewer/guest/team restrictions hold. |
| CR-A04: Evidence and capture | DOM approximation, native capture, permission denial, manual upload, expired signed URL, missing object and redaction; no silent capture success |
| CR-A05: Failure and consistency | Offline/lost save response/retry, upload/queue failure, reload, two tabs, SPA/hash navigation, late element, conflicting edit and active draft on navigation |
| CR-A06: Isolation and lifecycle | Wrong project/tenant/object; launch replay/expiry/origin; private notes; account change; link revoke/expiry; project archive and role removal while HTTP/socket is active |
| CR-A07: Reproduction | Different user data, moved/deleted element, staging/live deployment mismatch, preview login and changed viewport; original evidence retained, no fake historical replay |
| CR-A08: Fix loop | Human and authorized MCP paths create evidence, attach preview, move In review, verify and reopen; read-only tokens cannot mutate and no browser access is inferred |
| CR-A09: Usability and regressions | Keyboard/focus/touch, mobile panel, slow connection, readable error states, no blocked website controls, image/PDF guest review and existing extension project |

Run appropriate static checks after application changes: `pnpm turbo run lint
typecheck build`; backend Ruff check/format, mypy, and workspace-scoping check as
affected. Record actual commands/results. Static success is not CR-A completion.

Rollout: additive schema -> internal flag -> migrate one controlled staging project
-> complete CR-A01..09 with real supported target sites -> limited agency pilot ->
promote new connected installs. Pin/version the SDK and support rollback to the
previous compatible bundle. Rollback disables new launches and preserves portal
tickets/evidence; it must not silently reactivate cookie export or proxy sign-in.
Do not remove legacy routes/install credentials until owners have a working migration.

Measure launch-to-ready, authentication-return-to-ready, save success, capture
quality, live-location success, time to first issue and rejoin frequency separately.
Start with a defined desktop Chrome/Edge plus connected-widget mobile support matrix;
broaden only with evidence. Report denominators, failure categories and supported
sites. A small hand-picked pilot cannot substantiate "99% of all websites."

Outstanding evidence, not hidden implementation decisions: actual failing target
URLs/login methods and representative customer sites; deployed SDK/config version;
CSP/capture support; cross-origin SSO return behavior; observed latency and capture
fidelity; install-free guest usability. Obtain these during CR-02/03 and do not
promote the affected capability until its acceptance row has evidence.

Infrastructure purchases, cloud/device provider choice, lab embedding rights, regional
capacity and lab pricing belong to a later lab decision. The core flow requires no
paid browser-session provider; ordinary API/storage/traffic costs still apply.

## 9. Planning verification

Source inspected: widget bootstrap/identity/capture/page registration; extension
launch/relay; project and share-link schemas; review entry/project canvas; MCP
server/tools; current architecture, acceptance, delivery and TDRs 0002/0042/0048/0057.
The original planning turn changed no product code, API contract, migration, live
provider or deployed behavior. Subsequent implementation and its verification are
recorded separately in the delivery ledger; this source inventory is planning evidence.

Reference constraints checked during this conversation:
- [Chrome extension installation](https://developer.chrome.com/docs/extensions/mv2/inline-faq): store confirmation is required; install-and-resume needs explicit UX.
- [Chrome debugging capability](https://developer.chrome.com/docs/extensions/reference/api/debugger): exact emulation/inspection needs browser permissions; a widget alone cannot provide it.
- [BrowserStack Live capabilities](https://www.browserstack.com/docs/live/get-started/test-websites): browser/device lab behavior is a separate infrastructure capability, not evidence that Backline already supports it.
- [Browser challenge compatibility](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/): a human operator does not make every browser environment compatible.
