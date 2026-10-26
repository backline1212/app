# Delivery and verification ledger

## 2026-10-24: Combined component smoke gate (TDR-0145)

The read-only post-deploy command now optionally checks the web alias's
`/release.json` JSON, full expected SHA and no-store cache policy alongside
the separate API/worker expected SHAs and saved OpenAPI contract. The public
command passed with API/worker `22999a0`, web `8f52330`, healthy MongoDB/
Redis, auth capabilities and 132-path contract equality. See
[TDR-0145](../tdr/0145-check-web-release-with-component-smoke.md).

The full local release gate passed: backend Ruff, strict mypy (221 files),
workspace scope (25 repository files), saved/current OpenAPI equality (132
paths), monorepo lint/typecheck/build (12/12, six cached) and diff whitespace.

This checks release identity and public routing only. Browser sign-in, review,
queue jobs and provider delivery remain open. No test suite was added or run
under AGENTS.md.

## 2026-10-24: Worker revision observation and live check (TDR-0144)

The Arq worker now schedules a short-lived Redis heartbeat with its validated
release SHA, deployment ID and UTC observation time. The additive Pydantic
`/health.worker` object reports a recent or unknown observation without
changing MongoDB/Redis-based HTTP health status. Saved OpenAPI and generated
TypeScript declarations were regenerated; the smoke command accepts an
independent expected worker SHA. See
[TDR-0144](../tdr/0144-observe-worker-release-in-health.md).

The local release gate passed: Ruff, strict mypy (221 source files),
workspace-scope lint (25 repository files), saved/current OpenAPI equality
(132 paths), monorepo lint/typecheck/build (12/12, five cached) and diff
whitespace. The new worker field and generated declarations typecheck.

GitHub reported successful API, worker, cloud-login and Vercel statuses for
`22999a07f5310ee00a17ea8e9f94b9f4ee5226b4`. Public `/health` returned
HTTP 200 with MongoDB/Redis `ok`, the exact API SHA, a `recent` worker
heartbeat with the same SHA and distinct worker deployment ID. The independent
API-plus-worker smoke gate passed auth capabilities and exact live/saved
OpenAPI equality (132 paths). A later read observed the heartbeat advance from
13:15:03 to 13:16:00 UTC, confirming the periodic report. The public QA web
alias also returned this full SHA in `/release.json` with
`Cache-Control: no-store`.

This proves the worker ran its reporting job; queue age, domain jobs, provider
delivery, degraded/expired-heartbeat behavior and rollback remain open. No
tenant data or migrations are involved. No test suite was added or run under
AGENTS.md.

## 2026-10-24: Current Chrome Web Store draft and publisher contact (TDR-0143)

The intended publisher `contact.dwarkesh@gmail.com` is signed in in the in-app
browser. Replaced draft item `kdijhbgnbpjoaalbpnimfomemeheokca` version 0.4.9 with
0.4.13; Google's Package table confirms the new version and unchanged permissions.
Saved the rendered public privacy/support URLs and source-backed collection
categories. Added the public contact email; the owner verified Google's link and
Settings now confirms Verified email address. Trader verification remains pending.

Created the separate Backline Store Demo workspace with its automatically created
Example Project, and saved a guest demonstration path in Google's private testing
instructions. An earlier demo-create attempt in `sd` hit its two-project limit;
no existing project was archived or changed. No private account credentials were
shared. The guest entry renders the name-only join form without a member login.

Extension/widget lint, typecheck and build pass (6/6 cached Turbo tasks). The
51,939-byte uploaded ZIP has manifest 0.4.13 and SHA-256
`704885DDCF562B877C0160118888648AF91CDBFF3F8CF12DEFB597740D8DB2D6`.
The full local release gate also passed on 2026-10-24: Ruff, mypy, workspace
scope, saved OpenAPI parity, and all 12 Turbo lint/typecheck/build tasks. No
suite added/run. See [TDR-0143](../tdr/0143-current-chrome-store-draft-and-reviewer-access.md).
The owner's Chrome screenshots revealed enabled Backline 0.4.3 with a
background-script error. After the owner loaded the current build, a live
example.com tab showed the native Backline toolbar and New comment composer.
A draft comment was entered for the store screenshot. After submission, a
Copy-tagged demo comment was posted in the isolated Example Project; the on-site
thread showed its text and a captured-screenshot link. Page-version capture
separately reported HTTP 422 and remains open. The owner explicitly confirmed
the three data-use statements and authorized their checkboxes; saved all three.

Captured and uploaded a genuine 1280x800 JPEG from the live Chrome tab as
Screenshot 1. Google enabled submission, then warned that broad host permissions
could lengthen review. Submitted with automatic publication after approval
selected. The dashboard confirmed Item submitted and Status: Pending review;
a later read still showed Pending review and Screenshot 1.
Publication remains open until Google approves and releases the item. No payment
was made or verified. Evidence: `.tools/verification/2026-10-24-extension-store-1280x800.jpg`
and `.tools/verification/2026-10-24-store-pending-review.jpg`.

## 2026-10-24: Public component release matrix after TDR-0142

| Component | Observed revision | Evidence and limit |
|---|---|---|
| API | `2730fcf351996caef5f1bbbaa86e69794d743557` | `/health` reports this SHA with MongoDB/Redis `ok`; the read-only smoke command passes capabilities and exact saved/live 132-path OpenAPI equality. |
| Public QA web alias | `1aeef63a037a57b3466507b84bf239b43d8de5f8` | `/release.json` returns HTTP 200 JSON with this full SHA and `Cache-Control: no-store`. This confirms the served web marker, not browser flow acceptance. |
| Arq worker / cloud-login | Runtime revision unconfirmed | GitHub reports successful deployment statuses for `1aeef63`, but no authenticated process/log/queue or job evidence was available. |
| Extension | Source/API/portal ZIP version 0.4.13 | Normalized ZIP contents match the source build; installed Chrome and Web Store draft remain unverified. |

The API gate correctly rejected the web commit SHA, then passed with the API
commit SHA. These components can remain on different Git revisions when only
web files change. The web HTML still references `index-C9_Lw8YS.js` while the
local build references `index-Bzwy8iv6.js`; build-time configuration can
change hashed output, so that difference alone was insufficient evidence that
the alias was stale. The release marker resolves its web source identity.
Old/new component compatibility, worker processing, sign-in, browser review
and rollback remain open. No test suite was added or run under AGENTS.md.

## 2026-10-24: Web release marker source (TDR-0142)

The Vite build now emits `release.json` with a validated Vercel Git commit SHA
or null when that build variable is unavailable; the Vercel configuration
requests `Cache-Control: no-store` for the marker. Turbo now hashes/passes the
public build-time SHA and web/extension configuration inputs. A local build with a
simulated 40-character Vercel SHA produced the exact JSON value. Web lint,
typecheck and production build pass; diff check passes. See
[TDR-0142](../tdr/0142-web-release-marker.md).

The full local release gate also passes: 218 backend source files under strict
types, 25 repository files under workspace-scope lint, 132 saved OpenAPI paths
and 12/12 Turbo tasks (five cached). Under Turbo, a simulated Vercel commit
SHA produced that exact marker value; without it, a fresh build produced
`{"release_sha":null}`. This confirms the build variable is passed through
and changes the build cache key.

At this source check before rollout,
`backline-qa.vercel.app/release.json` returned HTTP 200 SPA HTML rather than
the marker; the two project aliases redirected to Vercel SSO. The later live
result is recorded in the component matrix above. No test suite was added or
run under AGENTS.md.

## 2026-10-24: Repeatable release gates (TDR-0141)

Added `scripts/check-release.ps1` for the local offline lock, backend lint/
strict types/workspace-scope, current-vs-saved OpenAPI, monorepo lint/typecheck/
build and patch whitespace gate. The command passed: 218 backend source files,
25 repository files, 132 OpenAPI paths and 12/12 Turbo tasks (six cached).
The existing read-only smoke command now accepts a full expected API SHA and
saved OpenAPI contract. Against the public API it passed `/health` (healthy
MongoDB/Redis; exact `612e60a19f38dde8846fec941cae2439feb245c9`),
`/api/v1/auth/capabilities` and exact live-vs-saved OpenAPI equality (132
paths). See [TDR-0141](../tdr/0141-repeatable-release-checks.md).

Follow-up: the gate-only commit `2730fcf` reached GitHub `main`; GitHub
reported successful Vercel, Railway API, worker and cloud-login deployments.
The public smoke command then passed again with the exact `2730fcf` SHA and
the same 132-path contract. Deployment statuses do not verify worker jobs.

This verifies public API routing and source identity only. Authenticated
Railway logs/queue behavior, degraded 503, actual sign-in, browser flows and
rollback remain open. At this earlier observation, the public
`backline-qa.vercel.app` HTML referenced `index-C9_Lw8YS.js` while the local
checked build referenced `index-Bzwy8iv6.js`. That hash difference was not
proof of an older web deployment; the later web marker established its served
revision. Two project aliases redirected to Vercel SSO. No test suite was
added or run under AGENTS.md.

## 2026-10-24: API routing recovered and exact release confirmed

GitHub reports successful Railway deployment statuses for API, worker and
cloud-login at `612e60a`; Vercel also reports success. The
public API `/health` now returns HTTP 200 with MongoDB and Redis `ok`, release
SHA `612e60a19f38dde8846fec941cae2439feb245c9`, deployment ID
`076a2744-b278-4c77-81bb-406082fbdab2`, and `Cache-Control: no-store`.
`/api/v1/auth/capabilities` returns HTTP 200; live OpenAPI equals the saved
132-path contract. This confirms the running API source and restores routing.

The API-hosted extension ZIP and versioned portal ZIP both declare 0.4.13;
their ten normalized file contents match the local extension build. Archive
hashes differ because build metadata and Windows/Unix line endings differ.
The checked `backline-qa.vercel.app` alias still served an older main bundle
despite the successful Vercel commit status. Authenticated Railway inspection,
worker queues/jobs, cloud-login runtime behavior, web alias identity, actual sign-in,
installed extension and browser review remain unverified. No test suite was
added or run under AGENTS.md.

## 2026-10-24: API release identity in health (TDR-0140)

`/health` now has a Pydantic response model with optional validated Railway
commit SHA and deployment ID. The saved OpenAPI JSON and generated TypeScript
declarations were regenerated from that contract. Existing health status and
dependency fields remain, and health responses use `Cache-Control: no-store`.
The later live check above confirms the API rollout and its release identity;
worker runtime and degraded-health acceptance remain open. See
[TDR-0140](../tdr/0140-expose-api-release-identity-in-health.md).

Verification: backend Ruff and strict mypy (218 source files), workspace-scope
(25 repository files), offline lock check and wheel/sdist build pass. Current
OpenAPI equals the regenerated saved JSON (132 paths); `packages/types`
declarations were regenerated from it. Monorepo lint/typecheck/build passes
(12/12 tasks, five cached), and diff check passes. No test suite was added or
run under AGENTS.md.

## 2026-10-24: GitHub release state after this source batch

The current privacy, pricing, dependency and documentation slices reached
GitHub `main` as commit `f5b09fe`. The connected GitHub account published the
same tree as the locally verified commit after the terminal push waited for
credentials; the branch update used the expected old head `c583569`.
Publication confirms source availability, not service deployment. Public API
`/health` still returned Railway HTTP 404 `Application not found` at release
time. GitHub reported a successful Vercel status for `f5b09fe`, while the
public `backline-qa.vercel.app` alias still served its earlier main and ticket
bundles during the read-only check. Treat that alias's matching deployment and
browser acceptance as open. API/worker rollout and live acceptance also need
separate checks; Railway service access remains unavailable in this session.

## 2026-10-24: Historical delivery claims labeled (TDR-0139)

README no longer presents old CI/test/milestone badges or local OTP fallback
as current production evidence. It links to the current inventory and this
ledger, and the older launch-readiness/backend-plan pages carry historical
context. No application or deployment behavior changed. See
[TDR-0139](../tdr/0139-label-historical-delivery-claims.md).

Verification: all relative links in the 12 changed/current Markdown documents
resolve locally, obsolete README claims are absent, and diff check passes.
No test suite was added or run under AGENTS.md.

## 2026-10-24: Remove unused Google Gen AI dependency (TDR-0138)

The backend manifest and lockfile no longer include `google-genai==0.3.0`;
the AI module already calls Groq over `httpx`. Google sign-in and direct
Pillow use retain their dependencies. The offline lock resolution removed only
the unused package. API/worker container builds and live AI acceptance remain
open while API routing is unavailable. See
[TDR-0138](../tdr/0138-remove-unused-google-genai-dependency.md).

Verification: `uv lock --check --offline`, backend wheel/sdist build, Ruff,
strict mypy (217 source files), workspace-scope (25 repository files) and
diff checks pass.
No test suite was added or run under AGENTS.md.

## 2026-10-24: Qualified pricing capture and support copy (TDR-0137)

Plan comparison rows now say screenshot capture is conditional and browser/
device details are optional. The unverified four-hour enterprise support SLA
claim is replaced with support arrangements by agreement. Prices and
entitlements are unchanged. Matching API rollout and live pricing-page
acceptance remain open during the API outage; support operations and billing
policy decisions remain SUG-13 follow-ups. See
[TDR-0137](../tdr/0137-qualify-pricing-capture-and-support-claims.md).

Verification: backend Ruff and strict mypy pass (217 source files), workspace-
scope passes (25 repository files), and diff check passes. No test suite was
added or run under AGENTS.md.

## 2026-10-24: Ticket board/list page path redaction (TDR-0136)

Ticket board cards and dense list rows now format `page_path` through the
existing display-only URL redactor, closing two raw-path label gaps. Stored
page URLs, ticket navigation and API contracts are unchanged. Live browser
acceptance of query/hash credential labels and ordinary routes remains open
while the API hostname returns Railway's fallback response. See
[TDR-0136](../tdr/0136-redact-ticket-list-page-paths.md).

Verification: web lint, typecheck and production build pass. The first
typecheck surfaced an optional-path type mismatch; the helper was corrected
and all three checks passed on rerun. Diff check passes. No test suite was
added or run under AGENTS.md.

## 2026-10-24: Origin-only MCP page labels and implementation briefs (TDR-0135)

MCP project/ticket lists, ticket detail and both MCP/dashboard-generated
implementation briefs now use the existing HTTP(S) origin formatter for
reviewed-page labels. The authenticated Backline ticket link remains for exact
context; stored review URLs and API schemas are unchanged. This is a BUG-08
source slice. Matching API deployment and live verification with a credential-
bearing review URL remain pending while the API hostname returns Railway's
`Application not found` edge response. See
[TDR-0135](../tdr/0135-restrict-mcp-page-url-exports.md).

Verification: backend Ruff passes, strict mypy passes (217 source files),
workspace-scope passes (25 repository files), and diff check passes. No test
suite was added or run under AGENTS.md.

## 2026-10-24: Comprehensive pending-work and improvement review (TDR-0134)

Published [the current inventory](pending-backlog-2026-10-24.md), retaining all 53
tracked release/reliability/flow/optimization/feature/acceptance items and adding
15 labeled recommendations. These overlap and are not 68 unresolved bugs.
Reconciled stale privacy/support placeholders, deferred PDF bundles, real provider/
billing/AI/MCP implementations and the deliberate removal of GitHub Actions.
The current API `/health` and auth capabilities still return HTTP 404 Railway
`Application not found`; web login/privacy/support return the SPA HTML with HTTP 200.
No service-specific outage cause or browser acceptance is inferred.

Passed: `pnpm exec turbo run lint typecheck build` (12/12 tasks; 5 cached), backend
`ruff check app`, `mypy app` (217 source files), workspace-scoping check (25 repository
files), and read-only comparison of current OpenAPI JSON to the stored contract
(equal; 132 path entries). Documentation diff and local Markdown link checks passed;
the inventory contains 53 unique tracked IDs and 15 unique recommendation IDs.
No application source/generated declarations changed; no test suite was written or
run, and no deploy/provider/shared-data mutation or migration was performed.
Unfinished work and proposed execution order are explicit in the inventory.

## 2026-10-24: Extension install/update guidance (TDR-0133)

Website review now shows separate steps for first-time Load unpacked setup
and replacement of an installed outdated/wrong-server extension. Both states
offer Reload Backline after the browser's extension card is installed or
reloaded, avoiding a Check again action that cannot detect a newly injected
content script in the already open tab. Web lint/typecheck/build passed (3/3
Turbo tasks), and diff check passed. Vercel reported success for `7f4d89b`;
the served NativeReviewButton bundle contains the update heading and reload
guidance. Browser acceptance for
missing/incompatible/reloaded states remain pending while API `/health`
returns Railway fallback 404. See
[TDR-0133](../tdr/0133-separate-extension-install-and-update-guidance.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-24: Guest PDF/image transport isolation (TDR-0132)

Direct guest file metadata, comment, mutation and content requests now use
`credentials: omit` and `cache: no-store`; the guest session header remains
their only identity. This closes a same-origin/browser-cache transport gap
without changing member requests or backend authorization. Web lint/typecheck/
build passed (3/3 Turbo tasks), and diff check passed. Vercel reported success
for `c0e0bec`; the served main bundle contains the explicit guest header,
credential omission and no-store fetch options. No live leak is claimed.
Browser acceptance for guest/member coexistence and private file
access remain pending while API `/health` returns Railway fallback 404. See
[TDR-0132](../tdr/0132-isolate-guest-file-review-transport.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-24: Loaded PDF/image review through refresh errors (TDR-0131)

The file-review screen now keeps loaded files, pins, conversations and replies
visible when a later metadata/comment refresh fails. It labels the view as
possibly stale and offers retry, instead of disabling annotation or replacing
saved feedback with an error. API 401/403/404/409 still hide cached file and
comment content. Web lint/typecheck/build passed (3/3 Turbo tasks), and diff
check passed. Vercel reported success for `e57a0b3`; the served
`AssetReview-COEgUwSS.js` bundle contains both stale-data messages. Live
PDF/image outage/recovery and revocation acceptance remain
pending while the API host returns Railway fallback 404. See
[TDR-0131](../tdr/0131-keep-file-review-visible-through-refresh-errors.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-24: Native toolbar startup outage recovery (TDR-0130)

An initial API edge fallback or network failure no longer removes the website
review toolbar while leaving its tab session behind. The toolbar shows a
temporary outage message, preserves the session, and rechecks access on
visibility/focus or the existing 30-second cadence; real denials still end the
review. Extension 0.4.13 source/package and portal-public/built ZIPs match:
51,939 bytes, SHA-256
`62100C9FEFEDB1574891F71B74B40954C42DFC1EAB713630AFEEBC6E082C41C2`,
manifest 0.4.13. Widget/extension/web lint/typecheck/build passed (7/7 Turbo
tasks); web build passed again after the ZIP copy. Vercel reported success for
`16e4020`; the public 0.4.13 ZIP downloaded as 51,939 bytes with matching hash
and manifest, and the served portal bundle contains the unavailability mapping.
Installed-browser recovery and real-denial acceptance remain pending while API
`/health` returns Railway fallback 404. See
[TDR-0130](../tdr/0130-keep-native-toolbar-through-startup-outage.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-24: Portal guest access during API fallback (TDR-0129)

Direct portal guest requests for session status/end, board, and PDF/image
metadata/content now share the web client's Railway edge-fallback mapping.
The fallback 404 becomes retryable service unavailability instead of triggering
guest session expiry or file-review access cleanup; real application 401/403/404
responses keep their existing behavior. Web lint/typecheck/build passed (3/3
Turbo tasks), and `git diff --check` passed. Vercel reported success for
`bd1c780`; the later served bundle contains the unavailability mapping. The
API host still returned edge fallback 404 for `/health`. Live acceptance for outage,
recovery and genuine revocation remain pending. See
[TDR-0129](../tdr/0129-preserve-portal-guest-access-during-api-fallback.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-24: Honest website review waiting state (TDR-0128)

The portal now labels a native review connected only when toolbar readiness
was confirmed. Its waiting dialog keeps the website-opening step active,
explains how to continue sign-in and disables repeat launch clicks until the
reviewer closes it and deliberately retries. This prevents a duplicate
project-token launch from that dialog without cancelling an uncertain
tab-bound session. Web lint/typecheck/build passed (3/3 Turbo tasks).
Vercel reported success for `4b38d2d`; the public root returned HTTP 200 and
the served native-review bundle contains the waiting copy. The API host
still returned Railway edge fallback 404, so installed browser acceptance
remains pending. See
[TDR-0128](../tdr/0128-honest-website-review-waiting-state.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-24: Preserve review sessions through API fallback (TDR-0127)

Native review and the guest widget now distinguish Railway's edge fallback
404 from an application access denial. The former reports service
unavailability without clearing a valid tab-bound or guest session, while
real API 401/403/404/409 handling remains. The extension source and portal
download advance to 0.4.12; the Chrome Web Store draft remains 0.4.9.
Widget, extension and web lint/typecheck/build passed (9/9 Turbo tasks).
The 51,774-byte source, portal-public and built-web ZIPs have matching SHA-256
`437239BF7173B79132651EB128447CEACE8CF97B03F7BEB9EC59049B0F84607D`;
the archive has manifest 0.4.12, the three scripts and popup. API rollout and
browser acceptance remain pending. Vercel reported success for `917fd83`;
the public ZIP returned HTTP 200 as `application/zip`, 51,774 bytes, with
matching hash and manifest 0.4.12. The deployed portal bundle references
0.4.12. The API host still returned Railway edge fallback 404 for `/health`;
exact API/worker rollout and installed browser behavior remain unverified. See
[TDR-0127](../tdr/0127-preserve-reviews-through-api-edge-fallback.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-24: API outage messaging (TDR-0126)

The web client now treats Railway edge fallback 404 as temporary service
unavailability and does not dispatch workspace-access-lost for it. Browser
fetch failures now mention either a local connection or service interruption;
the login page no longer promises email sign-in when the capabilities check
failed because the service is unreachable. Ordinary application 404/403
behavior remains. Web lint/typecheck/build passed (3/3 Turbo tasks). Vercel
reported success for `917fd83`, and the served login bundle contains the
service-unreachable copy. The portal root returned HTTP 200. API `/health`
still returned Railway edge fallback 404. A signed-out in-app browser visit
to `/login` displayed the new service-unreachable message and Check again
control after capabilities failed. Live sign-in/authorization acceptance
remains pending. See
[TDR-0126](../tdr/0126-distinguish-api-outage-from-missing-account.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-24: Website screenshot outcome (TDR-0125)

Point and region comment confirmations now report whether the server returned
a saved screenshot or a failed automatic capture. A failure remains visible for
four seconds; the saved on-site thread card has a persistent failure notice or
a link to the private captured screenshot. Older responses without evidence
fields remain readable. Extension source and the portal download advance to
0.4.11; the Chrome Web Store draft is still 0.4.9. Widget, extension and web
lint/typecheck/build passed (9/9 Turbo tasks). The 51,458-byte source,
portal-public and built-web ZIPs have matching SHA-256
`4239C81E53A9CB17E6D0C1B2B7C93956C383C3E0AA427F456C5A0F59E59E89E8`;
its root manifest is 0.4.11 and the three scripts and popup are present.
Vercel reported success for `2bd0f87`; the public versioned ZIP returned
HTTP 200 as `application/zip`, 51,458 bytes, the matching hash and manifest
0.4.11. The deployed portal bundle references 0.4.11. The API host returned
Railway fallback 404 for `/health`, auth capabilities and its legacy extension
manifest, so login/comment/browser acceptance cannot be claimed. Railway's
[platform incident](https://status.railway.com/incident/QH8L8B3E) was in
monitoring, but the service-specific cause is unverified; Railway CLI access
was unauthorized and its dashboard required login. See
[TDR-0125](../tdr/0125-show-screenshot-outcome-in-site-review.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-23: Available review paths in product copy (TDR-0124)

The Mobile App panel now states that native device/build/replay review is
planned and points to the usable Images/PDF project flow. Its actions open the
Images or PDF tab. Pricing rows marked `coming_soon` use a waiting icon instead of a
checkmark while retaining their explicit label. This does not change
entitlements, billing, or availability. Web lint/typecheck/build passed (3/3
Turbo tasks). Vercel reported success for `955f6e8`; the public root and
project bundle returned HTTP 200, and the bundle contains both screenshot
and PDF actions plus the planned native-app copy. Browser acceptance is pending. See
[TDR-0124](../tdr/0124-available-review-paths-in-product-copy.md).
No test suite was written or run under the Codex task instruction.

## 2026-10-23: Website sign-in continuation (TDR-0123)

The native browser launch no longer removes its session just because the
initial toolbar check reached 15 seconds. It returns a waiting state so
ordinary password/SSO redirects can finish and attach the toolbar on return
to the project's origin. Explicit launch errors still roll back, and the
portal revokes an unaccepted project token. An uncertain portal response or
closed launch dialog preserves the potentially active, eight-hour scoped
token; it can be revoked in Browser Extension settings. The portal now
requires extension 0.4.10 and links to a source-matched 0.4.10 ZIP. Extension
and web lint/typecheck/build passed (7/7 Turbo tasks); source and portal ZIP
hashes match at
`82AA528F00701E885F39C6DF635BEDC1447B652F72ABBA0A05676D0F335DEE1A`.
The web production build was repeated after copying the ZIP; the built ZIP has
the same hash and root manifest 0.4.10. Vercel reported success for `ca6219f`;
the public versioned ZIP returned HTTP 200, 51,154 bytes, manifest 0.4.10 and
the same hash. The portal root returned HTTP 200. Installed login, toolbar,
comment and return acceptance
remain pending; the 0.4.9 Web Store draft requires replacement. See
[TDR-0123](../tdr/0123-keep-native-review-through-website-sign-in.md).
The API's legacy extension ZIP and manifest still returned 0.4.4 with a
cache-busting query after Railway posted app/worker success on `3cf6814`;
`/health` returned 200. Its service/build mapping remains unresolved.
No test suite was written or run under the Codex task instruction.

## 2026-10-23: Versioned portal extension download (TDR-0122)

The public API's ZIP still contains 0.4.4. Added the source-matched 0.4.9 ZIP
to the web app's public assets and pointed both portal installation flows at a
shared versioned URL, `/backline-extension-0.4.9.zip`. The source and public
package SHA-256 match, as does the built web-dist copy. Web lint/typecheck/build
passed (3/3 Turbo tasks). Vercel reported success for `71cd5f1`; the public
versioned URL returned HTTP 200, manifest 0.4.9 and the same SHA-256 as the
store draft. Browser installation/comment acceptance remains open. The old
API route remains externally reachable and its
Railway deployment discrepancy still needs investigation. See
[TDR-0122](../tdr/0122-versioned-portal-extension-download.md). No test suite
was written or run under the Codex task instruction.

## 2026-10-23: Public extension information and signup links (TDR-0121)

Added signed-out `/privacy` and `/support` routes with extension data collection,
use, sharing and support guidance. Signup and login footer now link to the live
routes rather than `#`; the signup checkbox acknowledges the privacy notice and
does not pretend that a missing Terms document exists. Web lint, typecheck and
build passed after the final notice copy (3/3 Turbo tasks). Browser use was
disabled in Work settings, so signed-out
route navigation and layout were not accepted in a browser. Vercel reported a
successful deployment for `8af3ce5`; `/privacy` and `/support` returned HTTP 200,
and the deployed JS referenced the public page chunk with the notice and support
address. The
publisher must verify live processors and certify service-wide data practices
before entering the privacy URL in Chrome Web Store. See [TDR-0121](../tdr/0121-public-extension-privacy-and-support-pages.md).
No test suite was written or run under this Codex task's instructions.

## 2026-10-23: Chrome Web Store draft item and pending trader verification (TDR-0120)

The owner reported submitting Google verification. The intended publisher
dashboard now says "Your verification is currently pending." Uploaded the
source-matched 0.4.9 ZIP to draft item `kdijhbgnbpjoaalbpnimfomemeheokca` and
saved its English description, Workflow & Planning category, 128-pixel icon,
homepage, single-purpose statement, all requested permission justifications and
No remote code. The dashboard confirmed "Item saved." Its current submit dialog
still calls for a screenshot/video, data-use certification, public contact email
and verification of that email. A public privacy URL, accurate collection
categories, reviewer access, installed 0.4.9 acceptance and backend/public ZIP
rollout remain open. The public API download still reported version 0.4.4 after
Railway posted successful app/worker statuses on `8af3ce5`; those statuses do
not establish a current extension artifact. Railway CLI access was unauthorized,
so the source of the stale ZIP could not be inspected. No fee payment, review
submission or publication is claimed.
This was a dashboard/configuration slice; no code test suite was written or run.

## 2026-10-23: Chrome Web Store publisher handoff (TDR-0120)

The intended Google publisher account `contact.dwarkesh@gmail.com` reached the
Chrome Web Store dashboard after owner sign-in verification. The owner chose
trader status for professional publishing. Google now requires publisher
verification using a payment profile and legal identity or organization evidence;
the owner must complete that sensitive flow. No fee amount, charge, identity
submission, ZIP upload, listing submission, review result or live listing is
verified. A public privacy/support route, real extension screenshot, reviewer
access, data-use certifications and installed 0.4.9 acceptance remain pending.

Rebuilt the current 0.4.9 ZIP; manifest at root, bundled scripts/popup and all
four PNG icon sizes inspected. The 118-character description fits Chrome's
132-character limit. Extension/widget lint, typecheck and build passed (6/6
Turbo tasks). The public API still serves a 0.4.4 ZIP; backend rollout and
public-artifact verification remain open. See [TDR-0120](../tdr/0120-chrome-web-store-publisher-verification.md)
and the [release handoff](chrome-web-store-release-2026-10-20.md). No test suite
was written or run under this Codex task's instructions.

## 2026-10-22: OPT-04 deferred file/PDF bundles (TDR-0119)

Website guest/member entry now loads the file reviewer only for file projects,
and image review loads pdf.js only for a PDF. React Suspense shows a file-review
loading state while its code arrives. Web lint, typecheck, production build and
diff checks pass. The former 514.27 kB native-review chunk becomes separate
6.18 kB native-review, 25.89 kB file-review and 483.14 kB PDF parser chunks;
the >500 kB build advisory clears. These sizes do not establish live speed.
GitHub reports Vercel success for `a86e919`, and the public root returns
HTTP 200. Signed-in network confirmation and full image/PDF/comment acceptance
remain.

## 2026-10-22: BUG-14 website preview HEAD requests (TDR-0118)

Preview root/path and legacy fallback routes now accept HEAD. The proxy keeps
normal link, rate, cookie, redirect and SSRF handling, but returns an empty
body without HTML injection or a false zero Content-Length. Backend
Ruff/format, mypy (217 files), workspace-scope (25 repository files) and diff
checks pass. No external target probe or live rollout is
claimed; example.com root cause and PDF/site acceptance remain open.

## 2026-10-22: FLOW-08 file-review keyboard focus (TDR-0117)

The PDF/image review's global arrow, zoom and rotation shortcuts now yield to
modified keys, already-handled events, editable controls, buttons, dialogs and
tablists. This avoids changing pages while the reviewer operates another
control. Web lint, typecheck, production build and diff checks pass. The build
still reports the tracked >500 kB chunk advisory (OPT-04). GitHub reports
Vercel success for source commit `bce57e8`; the public Vercel root returns
HTTP 200. Browser keyboard and full PDF acceptance remain open.

## 2026-10-22: BUG-08 guest handoff proxy egress (TDR-0116)

The proxy removes reserved `backline_guest` and `backline_name` parameters
before requesting the reviewed site or forwarding a mapped Referer. It keeps
other query bytes and order, while the widget can still receive the handoff on
Backline's preview URL. Backend Ruff and format pass, mypy passes on 217
source files, workspace-scope passes on 25 repositories, and diff checks pass.
No shared guest
session or external request was created for this change. Backend rollout and
an authorized upstream-request inspection remain pending. Initial Backline
URLs, browser history and direct snippet mode still need a separate exchange.

## 2026-10-22: BUG-12 legacy preview form redirects (TDR-0115)

Legacy `/proxy/{token}/` form requests now pass the website's 301/302/303/307/308
redirect status to the browser while rewriting same-origin Location and retaining
session cookie headers. A 307/308 can therefore replay its original method/body,
instead of the proxy converting it to a GET. Backend Ruff and format pass, mypy
passes on 217 source files, workspace-scope passes on 25 repository files, and
diff checks pass. No suite, external login or shared-data write is claimed. Backend
rollout and controlled 307/308/303 form acceptance remain pending; the
example.com preview failure has no proven cause yet.

## 2026-10-22: BUG-08 private DOM capture exclusions (TDR-0114)

The widget now excludes editable fields and marked-private subtrees from new DOM
snapshot text, attributes, accessible names, roles and descendants. Anchor hashes
share that exclusion; exact selector paths use structural indexes inside private
areas. Comments remain usable, while automatic recovery inside those excluded
subtrees may be weaker. Widget and extension lint/typecheck/build and diff checks
pass. The extension build used existing local store-preparation changes, which
remain unstaged. No suite, signed-in capture or shared-data write was run.
Widget SDK and extension rollout plus actual capture/anchor acceptance remain open.

## 2026-10-22: BUG-08 integration page-field privacy (TDR-0113)

Automatic notifier messages, tracker descriptions and signed webhook `page_url`
now export only a validated HTTP(S) target origin. They retain the Backline ticket
link for full authorized context; stored page identity remains exact. Invalid URLs
produce a neutral label/null field. Full backend Ruff, affected format, strict mypy
(217 files), workspace-scope (25 repositories) and diff checks pass. No contract
generation, migration, suite, shared comment or external provider call was run.
Backend rollout and an authorized provider/webhook acceptance remain pending.

## 2026-10-22: BUG-06/07 first-party review upload relay (TDR-0112)

Widget screenshot/attachment and portal reply/new-ticket attachment uploads now
use `/uploads/direct` without first requesting a signed R2 PUT. The extension
already used the relay. A failed widget attachment retains its chip/File with
Retry/Remove controls and blocks posting until resolved, so a comment cannot
silently omit that selected file. Widget/web lint, typecheck, production builds and
diff checks pass; the web build retains its existing >500 kB native review chunk
advisory. No suite, shared upload or quota write was performed. Mixed-version
acceptance remains: the relay exists on the older backend, but deterministic
retry reuse needs TDR-0111's pending backend rollout. Historical signed holds and
custom clients remain open. Source commit `285281e` was pushed; Vercel reports
success and the public web page returns HTTP 200. The widget SDK is bundled by
the backend Docker image, so its rollout remains pending. Read-only Railway CLI
status is currently unavailable because its saved login was rejected.

## 2026-10-22: BUG-07 direct review-upload replay (TDR-0111)

The same-origin screenshot/attachment upload relay now derives an actor- and
project-scoped key from validated file bytes and content type. A repeated request
after a lost response writes the same object and reuses the same quota hold; upload
reference insertion accepts only matching ownership and content. Legacy random
keys and signed PUTs remain readable and usable. Signed-grant expiry alone still
cannot safely release a hold. No HTTP contract, migration, object deletion or shared
fixture write was needed. Full backend Ruff, affected format, full strict mypy
(217 files), affected mypy (2 files), workspace-scope (25 repositories) and diff
checks pass. Live relay retry, quota and object acceptance await backend rollout.

## 2026-10-22: BUG-08 portal URL display redaction (TDR-0110)

Project, page, canvas and version labels now mask common token/auth/contact query
keys, URL userinfo and obvious secret path segments, including supported hash-route
queries. Registration, navigation and extension targets keep the original URL.
Backend evidence/log redaction and live browser acceptance remain open; this is a
display slice, not a complete privacy repair. Web lint, typecheck, production build
and diff checks pass. The build retains the existing >500 kB native review chunk
advisory; no test suite or shared-data write was run. Source commit `711a57a` was
pushed and its Vercel status reports success; browser acceptance remains open.

## 2026-10-22: BUG-05 comment integration dispatch (TDR-0109)

Ticket/reply creation and member/guest status changes now save the comment, audit
event and per-notifier delivery intent in one Mongo transaction. Create-request
replays resolve outside a duplicate-aborted transaction; the minute worker handles
both comment and project rows. A status-change row retains its event-time status.
Current project/comment/connection scope and mute checks precede provider calls.
Legacy Arq handlers remain for mixed rollout. Static checks, exact-SHA rollout and
live Redis/provider/crash acceptance are recorded separately as they complete.
Backend Ruff app/scripts, affected format, strict mypy (217 files), workspace scope
(25 repositories) and diff checks pass. No HTTP contract/index migration, suite,
shared comment write, provider call or email was performed. Production still serves
the older API/worker commit pending Railway rollout. Source commits `299aacb` and
`54b489f` were pushed. Vercel reports success for `54b489f`. Its exact-SHA Railway
dispatch was rejected as temporarily paused before an accepted deployment ID;
read-only status still shows app, worker and cloud-login on `7b25ac3`. Live
integration delivery remains unverified. A later exact-SHA dispatch of `711a57a`
was also rejected as temporarily paused before an accepted deployment ID; the
three live services still reported `7b25ac3` on read-only status.

## 2026-10-22: BUG-05 project integration dispatch (TDR-0108)

Project metadata and per-connected-notifier dispatch intents now commit together.
The new scoped outbox uses a minute sweep, atomic lease, bounded retries and
terminal sent/skipped/failed states. Delivery rechecks the current project and
connection before sending; it retains the event-time project name. Old queued Arq
jobs keep their handler during mixed rollout. Comment-event dispatch followed in
TDR-0109. Static checks, additive index dry-run/apply, exact-SHA rollout
and live failure/crash acceptance are recorded separately below as they complete.
Backend Ruff app/scripts, strict mypy (217 files), workspace scope (25 repositories)
and diff checks pass; no test suite or shared project/provider write. The production
index migration dry run found only `integration_dispatches_due` missing and no
conflicts. Additive apply created it; a second dry run found every persistence index
present, none missing, no conflicts and no review data modified. The new worker is
not live while Railway remains on `7b25ac3`. Crash/provider acceptance and any
user-visible failed-delivery status remain pending.

## 2026-10-22: BUG-04 comment/ticket/file edit conflicts (TDR-0107)

Pydantic comment and asset update contracts now accept an optional expected
revision; responses expose revision with a legacy 0 default. Scoped Mongo updates
compare and increment it atomically. Comment human/AI priority/file reanchor writes
advance the counter. File changes stay in the existing transaction, with linked
page title changed only after its revision check succeeds. A mismatch returns 409
before events or notifications. Old clients without an expectation remain accepted
during mixed rollout. New web ticket, board, comment, canvas status and file-manager
updates send their rendered revision. Conflict feedback retains form data and refreshes
lists where needed. No destructive migration or new index.

Generated OpenAPI JSON/TypeScript comes from Pydantic. Backend Ruff, strict mypy
(215 files), workspace scope (24 repositories), types typecheck and web lint/typecheck/
production build pass; diff checks pass. The existing >500 kB chunk advisory remains.
No suite or live two-editor/shared-data mutation. Source commit `d00d857` was
pushed. Its exact-SHA Railway dispatch was rejected as temporarily paused before
an accepted deployment ID; app, worker and cloud-login still reported `7b25ac3`.
The commit's Vercel status succeeded, and the public page/current JS returned 200.
Matching backend rollout and browser acceptance remain pending.

## 2026-10-22: BUG-03 coordinated draft navigation (TDR-0106)

One root-route blocker now aggregates draft registrations from reply/ticket details,
file review, new ticket/team note and file manager. It names affected drafts in a
single confirmation; pending saves/uploads cannot be discarded. Saving/unmounting
the final affected draft resumes the waiting route. Local close confirmations keep
their own action, with a one-navigation exemption only for that form. Native unload
consults the same transient registry. Identity/workspace loss bypasses draft blocking
so protected screens can clear. No HTTP schema, generated declaration or migration.

Affected web typecheck, lint and production build pass; the existing >500 kB chunk
advisory remains. Diff checks pass. Commit `82da7f4` was pushed; Vercel reports
success. The public page and its current `/assets/index-DXjt5DHG.js` both return
200, and that served bundle contains the new draft dialog. No test suite or shared
comment/ticket/file write. Browser use was disabled in Work settings during this
check, so live Back/Forward, nested, pending, local-close and access-loss acceptance
remains open.

## 2026-10-22: BUG-02 durable daily digest delivery (TDR-0105)

Workspace preparation windows retain immutable time bounds/day, lease and member
cursor; batches of 100 create deterministic scoped outbox rows before checkpoint
advance. Preparation resumes after failure and duplicate schedules share one day.
Legacy first runs do not backfill history, and a legacy checkpoint from today is
adopted without an extra rollout email. Checkpoint completion never moves backward.

Independent recipient leases and 80-second processing deadlines scan at most 200
feedback rows per attempt with saved cursor progress. Current verified recipient,
preference, membership and positive scoped project/evidence checks gate sending.
Digests now contain a portal link/window, without comment snippets/project names.
Envelopes/keys are frozen; failures back off, eight errors/expired retry windows
become retained failed records. Provider-accepted/sent, skipped and failed states
are distinct. Resend uses the existing supported key window; Apps Script remains
at least once. A minute sweep recovers missed preparation/queue/send work.

Full Ruff app/scripts, affected format checks, strict mypy app (215 files) and
workspace scope (24 repositories) pass. Four additive index definitions use the
existing dry-run-first migration path. Production inspection found no conflicts;
additive apply created all four indexes. A second dry run confirms all indexes
present, none missing and no review data modified. No new
HTTP schema, generated declaration, destructive migration, test suite, production
digest invocation or provider call. Legacy test expectations for inline digest
snippets/sending are not acceptance for this changed flow; no suites run per
AGENTS.md. The internal per-workspace entry point remains as a preparation wrapper.

Actual crash/concurrency/cursor/provider/recipient negatives remain pending. Rollout
must drain old digest workers before enabling the matching new worker/index set;
an old worker's already-advanced checkpoint cannot reconstruct lost historical
delivery. Frozen workspace-slug links across later rename remain an acceptance
case. The 52f6634 exact-commit dispatch was again rejected as temporarily
paused with no accepted deployment ID; backend/extension rollout remains open.

## 2026-10-22: BUG-01 digest privacy (TDR-0104)

Added workspace-scoped page/project lookups and removed the Unknown project email
fallback. Missing, foreign, archived and inconsistent mappings are omitted. Current
membership, verified email and daily-digest preference are read per recipient;
project access cache is rebuilt after earlier recipients' provider waits. Legacy
comments without project_id still use their verified page mapping. No HTTP schema,
migration/index, preference change, shared data mutation or provider call.

Affected Ruff format/check and strict mypy (4 files) pass; workspace-scoping passes
for 23 repositories and diff checks pass. No suite per
AGENTS.md. Actual delivery and role/reference negatives await release/acceptance.
The old early-checkpoint behavior remains BUG-02, the next planned slice.

## 2026-10-22: Categorized pending-work inventory

Added [the current backlog](pending-backlog-2026-10-22.md), reconciling historical
findings with later repairs and live acceptance. Read-only status again reports
all three Railway application services on 7b25ac3 with health/Mongo/Redis ok.
Public ZIP manifest is 0.4.4; source manifest is 0.4.9. Installed 0.4.3 is the
last observation, not a fresh installed-version check.

New source findings in `notifications/digest.py`: the checkpoint advances before
delivery, risking skipped windows on failure; missing page/project mappings fall
through to Unknown project instead of requiring positive project access before
including comment text. Both remain open, without live email/reproduction claims.
This slice changes documentation only; no deploy, shared mutation, migration,
package installation or suite. Existing local icon/store edits are preserved.

## 2026-10-22: Deployed portal draft acceptance follow-up

Vercel confirms successful web rollout of ad03bb4, including TDR-0098 through
TDR-0103. In the signed-in Chrome verification tab, New ticket opens with Create
ticket disabled on the empty form. Entering only a labelled unsent body and clicking
Cancel opens Keep your ticket draft. Stay preserves the exact text; a repeated
Cancel followed by Discard draft and close leaves no open dialog or textarea. The
existing Everyone ticket count remains five. Create ticket, screenshot upload,
Delete, role changes and provider sign-in were not invoked.

Earlier live checks in this continuation also verified portal reply and existing
ticket body draft Close/Stay/Discard without publishing/saving. They do not verify
actual POST/upload retries, mixed roles, induced failures or PDF rendering/pins.
Those acceptance gates and the feature inventory remain open. Railway's most recent
exact-source dispatch (4dda021) was rejected as temporarily paused with no accepted
deployment ID; API/worker/cloud-login last read remain 7b25ac3, health/Mongo/Redis ok.
Extension 0.4.9 source/served/installed rollout is still separate from web rollout.

## 2026-10-21: New ticket/team note and screenshot recovery (TDR-0103)

Creation captures the immutable original save before synchronous guarded dispatch,
with a 30-second deadline and original-request retry. Confirmed results remain saved
through refresh failure/stall and allow closing. Local close/Stay/Discard and native
unload protect drafts; pending work refuses close. Workspace/project keys and
unmount checks protect late callbacks. Screenshot selection enforces remaining
capacity before upload, retains each success, reports partial failures and owns blob
cleanup. The shared checked PUT/direct fallback now has a 120-second request bound,
caller cancellation and size preflight, including existing reply attachments.

Final affected web lint/typecheck/build pass 3/3; diff checks pass. The existing
chunk advisory remains. Evidence: `.tools/verification/2026-10-21-0103-final-web-checks.log`.
No suite, shared ticket/note/
upload, role change or provider call. Actual writes/failure acceptance, nested SPA
navigation protection and exactly-once attachment upload remain open. Local close/
unload protection is not a claim of full router protection.

## 2026-10-21: Ticket triage permissions and lifecycle (TDR-0102)

Ticket list/table/board/calendar mutation controls use project editor/manager access;
unknown/failed role data and archive state fail closed. Creation entry and access
retry explain availability. Quick edits serialize before dispatch, check permission
before optimism/write, pin rollback to its original filter key and skip rollback
after context change. Refetch failure cannot retain the edit lock. Disabled date
pickers hide portals/ignore callbacks. Delete confirmation checks its own role and
guards double submit; confirmed deletion remains completed if refetch stalls/fails.
Shared pending confirmation X/Escape/Cancel cannot imply cancellation of a write.

Final affected lint/typecheck/build pass 3/3; diff checks pass. The existing chunk
advisory remains. Evidence:
`.tools/verification/2026-10-21-0102-final-lifecycle-checks.log`.
No suite, production ticket update/delete/role change or provider call. Mixed-role,
failure/concurrency, filter/context rollback and deletion acceptance remain pending.
Same-field metadata CAS and the new-ticket form lifecycle remain open work.

## 2026-10-21: PDF worker recovery (TDR-0101)

PDF preparation and page parsing/rendering have independent 30-second deadlines.
Timeouts keep annotation readiness false, destroy/cancel the active task and expose
the existing fresh-document retry. Timer/late-callback cleanup covers replacement
and unmount. Finite positive page dimensions are required before bounded canvas
allocation. Actual decode/render/timeout/retry/pin acceptance remains pending.

Affected web lint/typecheck/build pass 3/3; diff checks pass. The existing chunk
advisory remains. Evidence: `.tools/verification/2026-10-21-0101-web-checks.log`.
No suite, shared file/upload/comment or permission change. Source 4dda021
(TDR-0100) is pushed. Its first push hit transient GitHub DNS failure; resolution
recovered and push succeeded. Exact-commit Railway deployment was then attempted
after the confirmed push and again rejected as temporarily paused, without an
accepted deployment ID. No backend/served-extension update is claimed.
Vercel confirms successful web rollout of 4dda021, including TDR-0100.

## 2026-10-21: File review save and upload recovery (TDR-0100)

Image/PDF review captures comment/reply request IDs before synchronous guarded
submission. Confirmed results update their page cache and remain saved if cache,
navigation or refresh work fails. Guest-session instances and unmount guards
protect late callbacks. Asset JSON/content/upload requests have 30/60/120-second
bounds with cancellation and explicit uncertain-write recovery. File-manager
submission guards and settlement release busy independently of refetch success;
partial upload replay keeps its existing per-File request ID. Local close/unload
protect renamed files and unconfirmed batches; pending operations refuse close.

Final lifecycle changes pass affected web lint/typecheck/build 3/3 and diff checks;
the existing chunk advisory remains. Local log:
`.tools/verification/2026-10-21-0100-final-web-checks.log`. A draft-dialog wording
refinement found during live verification is checked separately in
`.tools/verification/2026-10-21-0100-final-copy-checks.log`; those final affected
lint/typecheck/build checks also pass 3/3.
No suite, shared feedback/upload/file change, role change or provider request.
Actual PDF rendering/pins, guest/member writes and failure acceptance remain
pending. Browser access resumed October 21: the deployed TDR-0097 reply draft now
passes Close -> prompt, Stay -> preserved text and panel, repeated Close -> prompt,
Discard -> no dialog/textarea and panel=closed. Only an unsent labelled draft was
entered; no reply was posted and the existing count remained three comments.
The TDR-0098 ticket metadata-only draft also passes Close -> prompt, Stay -> text
preserved with the original selected ticket, repeated Close/Discard -> one completed
close, no open dialog/textarea and no selected comment URL parameter. Save changes
started disabled on the untouched ticket. Only an unsaved labelled body was entered;
Save changes, Delete and Post reply were not clicked. Other-role and failure paths
remain unverified.
Nested file-manager SPA router blocking,
metadata CAS, other attachment uploads and orphan reconciliation remain open.

Web rollout of 1a2f7ba (TDR-0099, including TDR-0098) is confirmed successful by
Vercel status. Latest read-only Railway state still reports API/worker/cloud-login
on 7b25ac3 with health/Mongo/Redis ok. Backend/served-extension rollout is separate.

## 2026-10-21: Bounded session recovery and retry ownership (TDR-0099)

Refresh lock acquisition and acquired HTTP work have independent 20-second bounds.
Caller abort ends its recovery wait without cancelling shared work. Workspace
recovery is bounded, revision-scoped and validates returned identity/context before
installing a token. Request retries stay tied to their initial account/workspace
and in-memory context revision, including logout/re-entry. Concurrent 401s reuse a
renewed token; failed sign-in credentials/codes are not automatically replayed.
Recovery errors remain explicit and transient 5xx does not announce access loss.

Final affected web lint/typecheck/build pass 3/3; diff checks pass. The existing
chunk advisory remains. Local evidence is
`.tools/verification/2026-10-21-0099-final-web-checks.log`. No new suite, backend
schema, credentials, provider sign-in or production feedback write. Browser use is
disabled, so multi-tab/abort/login acceptance remains pending. Initial API fetches,
uploads, cross-origin cookies and explicit login/switch UI sequencing retain their
separate verification and implementation boundaries.

## 2026-10-21: Ticket detail permissions and draft protection (TDR-0098)

Ticket details now gate reply/edit/delete by existing project roles. Read-only
text stays copyable. Ticket body and metadata participate in draft protection;
pending saves freeze controls and guard portaled picker callbacks. Saves capture
only changed fields with a synchronous submit guard, then establish the confirmed
response baseline. Refresh failure is separate from write failure. Metadata CAS
and exactly-once metadata retry remain open backend work.

Verification: final affected web lint/typecheck/build pass 3/3; diff checks pass.
The existing web chunk-size advisory remains. Evidence is recorded locally in
`.tools/verification/2026-10-21-0098-final-web-checks.log`.
No suite, shared feedback/upload/delete or permission change. Browser use is now
disabled in Work settings: an attempted unsent QA reply fill was rejected before
typing, so TDR-0097 Stay/Discard acceptance remains pending. Its ffe6957 Vercel
deployment succeeded and its new reply controls were visible before the block.
At 20:29 UTC on October 20 (October 21 IST), exact-SHA Railway dispatch for ffe6957
was again rejected as temporarily paused, without an accepted deployment ID.
Later source pushes must not be counted as backend or extension rollout.

## 2026-10-21: Portal reply replay and draft UX (TDR-0097)

Project comments, board threads and ticket replies use an immutable typed
parent/project/body/evidence/layer/mentions/request-ID save with synchronous double-
submit protection, 30-second bounded wait, explicit original retry and text recovery.
Confirmed API rows update the actual cache; post-save refresh failures remain saved.
Context-changing URL navigation, unload, modal close and ticket-delete entry protect
unsent/unconfirmed replies and refuse active-write/upload discard. Same-thread canvas
view changes stay usable. Partial uploads retain confirmed files and report failures;
board upload now checks PUT outcomes through the existing fallback. AI suggestions
require explicit application and cannot replace a frozen request. Read-only mentions
and dynamically disabled/nested-dialog focus are handled. No backend schema change.

Affected web checks repeatedly pass 3/3 through final submission/AI/navigation
refinement and the final focus changes; diff checks pass. No suite, shared reply/upload/permission
change or AI provider request. Live web flow checks follow deployment. Ticket metadata
dirty-state/CAS and role gating remain identified next work. The e476c76 exact Railway
dispatch again failed with the temporary pause; API/worker/cloud-login were still
7b25ac3 at the latest read-only check, with health/Mongo/Redis ok. Do not count later
source pushes or frontend rollout as the backend/extension rollout.

## 2026-10-21: Hash-route review identity (TDR-0096)

Recognized #/ and #!/ routes retain distinct canonical page URLs. Widget/native
registration verifies the returned route before accepting a page ID from an old
server. Standalone navigation tracks observed document URL separately, rebinding
ordinary anchors without endlessly resetting its debounce, and retains draft/race
guards. Registered-page card context stays stable while a draft holds a prior route.
Portal labels/pickers/ticket paths include route/query context. Deploy matching uses
the same identity and a server-reported capability gates hash credential creation.
Other fragment formats stay unavailable. Existing merged legacy history is retained
on its original page; no guessed reassignment, index change or migration.

Backend Ruff app/scripts, full mypy (214 files) and scope (23 repositories) pass;
Pydantic OpenAPI export and packages/types regeneration complete. Full frontend
checks pass 12/12 after final guards; existing web chunk advisory remains and diff
checks pass. No suite, shared route/comment/CI write
or provider sign-in. Extension 0.4.9 source still requires served/installed rollout;
Chrome remains 0.4.3. Read-only Railway status still reports all services on 7b25ac3,
health/Mongo/Redis ok. Targeted read-only project/service schema inspection exposed
no pause switch; the deploy rejection and its root cause remain unresolved.

## 2026-10-21: Native access cleanup and lifecycle races (TDR-0095)

Native access checks continue independently of drafts, every 30 seconds while
visible and on foreground return, with a 12-second probe bound. Authoritative
denials clear feedback/drafts/credentials/known IDs and disable modes while return/
close stays usable. Transient errors retain drafts and explain uncertainty. Role
changes reset held callbacks; viewer activation is blocked. Session writes are
serialized per tab with launch/ended-state checks and a connection-clear epoch,
preventing late responses from restoring cleared authority. Comment polls do not
overlap and their HTTP wait is bounded. Composer teardown releases its global
handle and text, including standalone widget auth loss. Toolbar pending-mode/close
races preserve the current review and ended notices. No request rollback is claimed.

Final affected widget/extension checks pass 6/6 after launch-waiter cleanup;
diff checks pass. No suite, production access/role change, extra shared feedback
or upload. No HTTP schema/migration/permission expansion. Extension 0.4.8 source
still needs deployment and installed acceptance; Chrome remains 0.4.3. Railway's
temporary pause is tracked separately and no live backend/extension update is claimed.

## 2026-10-21: Batched comment-list enrichment (TDR-0094)

Page/project comment lists and ticket lists use workspace-bound request-local
caches and batches of 100 for page references, member/guest labels, parent fallback
and private evidence signing. Missing references are cached too; guest queries load
only scoped display names. Existing access/layer and upload-key validation precede
serialization/signing, output order and legacy fields remain, and row batches yield
without unbounded per-comment task fan-out. No HTTP schema or migration changed.
This is a partial F32 repair: collection pagination/native deltas and measured load
acceptance remain open rather than silently truncating historical feedback.

Final Ruff app/scripts, full strict mypy app (214 files), scope check (23 repositories)
pass. No suite, shared feedback write or performance benchmark run. Frontend source
is unchanged since TDR-0093's successful 12/12 checks. Deployment remains pending.
The exact 44602d7 Railway dispatch was again rejected before any deployment ID;
continue backing off while the provider pause persists.

## 2026-10-21: Website-thread replies (TDR-0093)

Added native and standalone guest text replies through existing authorized/idempotent
API contracts. Native relay requires a known session comment and bounded exact
payload; project-role controls avoid offering viewer writes. Team visibility is
preserved. Draft form survives content refresh, uses an immutable request after first
submission and exposes waiting/retry/copy/discard states. Dirty/pending replies share
mode/pin protections, guard unload and delay SPA registration; revoked-access teardown
purges them. Embedded member replies stay in the signed-in portal. Remaining card
edit/delete/resolve/attachments/mentions are explicit open parity work.

Initial affected widget/extension lint/typecheck/build passes 6/6. Final source and
0.4.7 full frontend checks pass 12/12; existing web chunk advisory and diff checks
are recorded. No suite, additional shared reply/comment/upload or
backend schema/migration. Installed extension remains 0.4.3; rollout is pending the
Railway pause. The local store/icons work remains separate.

Post-deploy web evidence for TDR-0092: e2c35a9 reports Vercel success
`https://vercel.com/devbackline-7169/app-web/5LvF8czGkz1qKgXyf4VM1AjH95mJ`.
Fresh Chrome reload shows one failure recovery surface with extension/retry/live
page/URL correction and View saved feedback. That action opens the three existing
comments and writes panel=comments to the URL. Close removes the panel and sets
panel=closed, preserved after reload with the panel closed and recovery action still
available. No additional comment or credential saved. Signed-out IAB checks show
Google ready, sign-in recovery and signup navigation without submission. Found dead
Privacy/Terms/Support hash links; legal documents/destinations remain unresolved and
must not be invented or counted as working. No provider sign-in or OTP email sent.

## 2026-10-20: Live flow pass and preview recovery (TDR-0092)

Browser use resumed through a fresh Chrome tab. Baseline observations: extension
0.4.3 ready, PDF creation type/form/required-file gate and cancellation, existing
example.com fallback with three saved comments/prior approved screenshot accessible,
Deploy sync off/setup/empty history/close. No new project/file/comment/credential/CI
notification saved. CDP network inspection was unavailable during a paused document
response; no preview network root cause or broad-site success is inferred.

Consolidated duplicate fallback banners into one effective-readiness recovery surface,
with direct View saved feedback during loading/failure/origin mismatch. Panel choice
is URL state, preserving page/thread/filters and handling pin-open nonces once.
Affected web lint/typecheck/build passes 3/3 (supported ES2020 ownership check),
existing chunk advisory remains. No suite or backend contract. Rollout and final
browser acceptance remain pending. A second exact-commit Railway dispatch for
48e6d3e was rejected with the same temporary pause; no deployment ID accepted.

## 2026-10-20: Bounded page-version capture (TDR-0091)

Capture now has per-invocation counters, scan/node/depth/text/size/elapsed bounds,
periodic yielding, own-UI exclusion and registered-document URL checks. Failed
complete capture is explicit; no truncated snapshot enters recovery. Optional
retry/dismiss/waiting notices stay independent from feedback and suppress stale
page/generation outcomes. Widget and extension share the behavior (0.4.6 source).
Raw HTTP snapshot bodies are bounded before parsing; Pydantic validates bounded
viewport/hash/index and complete tree identity. Legacy revision reads stay intact.

Initial widget/extension checks pass 6/6 before final refinements. Backend Ruff
passes; final checks/contracts are in progress. No suite, production snapshot or
shared feedback write. Deployment remains subject to the Railway pause in TDR-0090;
installed-extension/browser/resource-limit acceptance remains open.

Final source checks pass: frontend lint/typecheck/build 12/12, backend Ruff/full
mypy (214 files), affected mypy (9), scope audit (23 repositories), codegen and
diff checks. Earlier widget/extension checks passed 6/6. Only the 0.4.6 version hunk
is staged from the manifest; unrelated local icon/store preparation is preserved.
Deployment and installed-extension acceptance remain pending.

## 2026-10-20: Railway dispatch pause (TDR-0090)

93acf9f is pushed to origin/main, but no automatic backend deployment was observed.
Read-only config confirms expected repo/main and matching watch paths. Dry-run of
the exact-commit deployment command passes for all three services. First API dispatch
was rejected with `Deploys have been paused temporarily`; no deployment ID returned,
other services not dispatched. Backend remains on 7b25ac3, so TDR-0089's version
guards are not counted live. No config/billing/business data changed. Continue source
work; retry rollout after the provider pause ends and verify actual SHA/health/contracts.

## 2026-10-20: Project settings/rename concurrency (TDR-0089)

Added legacy-zero metadata version and paired expected-version/request-ID updates.
Current project reload/permission, actor/body replay, stale-version rejection,
metadata/settings/client mutation, replay marker and audit share the transaction.
Applied retries skip another mutation/audit/integration dispatch. Direct metadata,
settings and archive writes increment the version; previews/deploy/file activity do
not. Legacy unversioned callers retain compatibility without a CAS guarantee.

Project settings and rename retain their initial base version and immutable retry
request. Conflicts expose draft copy and explicit latest reload/review; failed reload
retains the draft. Rename also guards pending close/concurrent saves. Source checks
and rollout are in progress. No production metadata/client save, integration send or
suite run. Actual concurrent/lost-response/browser acceptance remains pending.

Final checks pass: frontend lint/typecheck/build 12/12, affected final web 3/3 after
copy refinements, backend Ruff/full mypy (213 files), final affected mypy (9 files)
after current-membership validation and scope audit (23 repositories). Contracts
regenerated, diff checks pass. Existing large-chunk advisory remains. No suite or
production metadata/client mutation. Deployment/contract verification follows.

## 2026-10-20: PDF/image links and draft navigation (TDR-0088)

File/page/thread view now follows URL parameters, with bounded PDF page picker,
legacy link resolution, explicit unavailable-file/thread states and read retries.
Current drafts, replies and uncertain saves retain original context; data-router
leave/stay/discard and native unload guards prevent accidental navigation loss.
Reply text remains recoverable if its thread disappears; clipboard fallback and
project-keyed state avoid copy/navigation dead ends. New-comment cache uses the
actual confirmed API response. Retry continues to use the original asset/request.

Affected web lint/typecheck/build passes 3/3 before final picker/reply refinement;
final verification and deployment are in progress. No suite, backend contract or
production file/comment/screenshot write. Browser member/guest navigation,
concurrency, failure and role/session acceptance remain pending in the TDR/matrix.

Final affected web lint/typecheck/build passes 3/3 after the PDF picker/reply recovery
changes, and diff checks pass. Existing large-chunk advisory remains. No suite was
written or run; browser journeys remain pending.

PDF/image web rollout: 5db789c reports Vercel success
`https://vercel.com/devbackline-7169/app-web/5q457n4v9cXitajEc5RM8R2zbis9`.
Backend services remain on the preceding 7b25ac3 because this slice has no backend
source change. Browser navigation/draft/write acceptance remains pending.

## 2026-10-20: Deploy sync and guarded dialog close (TDR-0087)

Replaced the disabled footer control with manager credential create/replay/rotate/
revoke, no-store settings, signed bounded CI notifications, durable ordered records
and cursor history. Current issuer access, project/environment/start-page scope,
archive/deletion, stale signatures and mismatched body replay are enforced. Metadata
changes cancel pending captures. Member-backed snapshot submission associates the
current waiting delivery atomically with its revision; existing durable revision
delivery drives recovery. External guests cannot read settings/history/secrets or
complete the team capture. CI sender uses fixed bytes, bounded retries and no secret
logging; MCP exposes only scoped read history. Hard-delete includes delivery rows.

Dialog keeps immutable credential/revoke versions after uncertain responses, offers
copy fallback, explicit rotation/revoke confirmation and unsaved-secret close guard.
The shared Dialog now prevents native Escape close before consulting the caller's
guard. Starting-page navigation explains reload/reopen capture. Google readiness
copy/disabled styling is refined. Fragment-route and isolated background deploy
capture remain explicitly unavailable; receipt/capture cannot prove a commit/fix.

Contracts regenerated. Backend Ruff/full mypy (213 files), affected follow-up mypy
(20 files), scope audit (23 repositories), CI sender syntax and full frontend
lint/typecheck/build (12/12) pass before final navigation copy. Production read-only
index dry-run finds only deployments_project_history missing, no conflicts; no data
modified. Final affected checks/rollout are in progress. No suite or production
credential/CI event/upload/comment/deletion was run. Browser/live CI and negative/
failure acceptance remain pending; see the TDR and flow matrix.

Final affected web lint/typecheck/build passes 3/3 after navigation and close copy;
the full frontend graph passed 12/12. Backend Ruff/full mypy and affected MCP/deploy/
snapshot follow-up checks, scope audit, contract generation and diff checks pass.
Existing large-chunk advisory remains. Deployment is the next step; none of these
checks establishes a live CI or browser journey.

Deploy sync rollout confirmed: 7b25ac3948023ff213320f24af50c51a2e9b4d8a reports
SUCCESS on Railway API/worker/cloud-login and Vercel
`https://vercel.com/devbackline-7169/app-web/2s7WSaQDmpioEmy9cZ6316tkXQLC`.
Public OpenAPI exposes deploy settings/hooks. Public CI sender returns HTTP 200 and
contains signature handling. Read-only index dry-run finds deployments_project_history
present, no missing indexes/conflicts and no data modified. No live credential,
deployment notification or browser capture was created for acceptance.

## 2026-10-20: Google readiness and storage accounting rollout (TDR-0086/0085)

Login/signup now query a no-store capability boolean before offering Google. Both
credentials and a single allowed dashboard callback must be configured; the start
endpoint repeats this check. Checking/unavailable/failure/retry states keep email
available. Contracts regenerated. Auth Ruff/mypy (7 files), full backend mypy (208),
affected web lint/typecheck/build (3/3) and diff checks pass. Actual browser/provider
acceptance is pending; no account/OTP/provider request or shared feedback write.

Storage tracking 64639a7 reached SUCCESS on all three Railway services. Sequential
accounting import stopped with OperationFailure; enforcement stayed false. Replaced
per-object round trips with a workspace-locked bulk import. Storage/script mypy
(11 files), Ruff and scope audit (22 repositories) pass. Repeated dry-run matched;
batched apply imported accounting for 10 workspaces / 177 objects / 25,320,983 bytes,
zero unattributed objects. No objects deleted/business records changed. Read-only
report confirms all ten ready, matching object/byte totals, zero recent untracked
uploads. Index dry-run finds both storage indexes present, no conflicts/missing.
Enforcement enablement and final deployment/public contract verification follow.

Rollout confirmed: commit 1aa9a2e2346818d756f6aefd9f21de89bdcaf0fd reports
SUCCESS on Railway API, worker and cloud-login and Vercel
`https://vercel.com/devbackline-7169/app-web/F5s51hYtoZs1myG94kLBjoPDmd8e`.
Storage enforcement configuration is true for all three services. Read-only report
still confirms ten ready / 177 objects / 25,320,983 held bytes / zero recent untracked
uploads. Public health is status/mongo/redis ok. GET auth/capabilities returns
google_sign_in true with Cache-Control no-store. Configuration/contract rollout is
confirmed; actual Google/browser and quota write-path acceptance remain open.

## 2026-10-20: Audit F24 — storage reservations and inventory (TDR-0085)

Added bucket/object ledger reservations under the workspace plan transaction across
uploads, assets, snapshots, previews and renders. Count held/stored bytes before
writes, keep retained/archived content counted and release after confirmed deletion.
Server-upload reconciliation uses delayed HEAD and reservation-token checks. Signed
PUT reservations deliberately retain missing holds because URL expiry cannot stop
an already-running upload. Billing exposes actual known/unknown accounting and the
enforcement state. Expanded tenant-scope audit includes quota/deletion repositories.

Read-only production inventory: 10 workspaces, 177 attributable objects, 25,320,983
bytes, zero unattributed/unrelated objects, no changes. Read-only index dry-run finds
only two new storage indexes missing, no conflicts. Contracts regenerated. Backend
Ruff/full mypy (208 files), affected mypy (31), script mypy and scope audit (22) pass.
Frontend 12/12 passed before final copy refinement; final web checks/rollout are in
progress. Tracking deploy precedes inventory import and enforcement. No production
upload/deletion/provider call or suite run. See
[TDR-0085](../tdr/0085-storage-byte-reservations.md) for remaining manual acceptance.

Final affected web lint/typecheck/build passes 3/3 after copy refinement (full graph
12/12). Backend Ruff/mypy/scope/script checks and diff checks pass. Existing chunk
advisory remains. Rollout still needs tracking deployment, inventory import and
enforcement enablement; none is inferred from compilation.

## 2026-10-20: PDF/image upload response recovery (TDR-0084)

ID-backed asset uploads validate byte/name/type/project/creator replay before checking
capacity, returning the original active asset after a lost response. Repeated storage
uses the same actor/request/payload-derived object key. Page/asset/audit writes commit
together with the project's existing transaction guard, and current membership/
session/upload permission is rechecked after storage. Manage files retains a failed
batch, skips acknowledged files, and offers retry at capacity plus explicit close.

Contracts regenerated. Production read-only index dry-run reports the two creation
indexes present, the new asset request index missing, no conflicts/duplicates and
no business data modified. Full frontend checks passed 12/12 before the batch UX
follow-up; final affected checks are in progress. Storage orphans/byte quotas and
restart/reselection queue persistence are separate. No production file/comment or
screenshot write. See [TDR-0084](../tdr/0084-file-upload-replay.md).

Final source checks pass: full frontend 12/12 and affected web 3/3 after batch UX,
backend Ruff, affected mypy (6 files), scope audit (20 repositories), codegen and
diff checks. Existing large-chunk advisory remains. No suite written/run. Browser/
storage response-loss and role/session-loss acceptance remain pending.

Preceding metadata commit 8e2762eaee017e64e424d629f07b3fc084c9f13f reports
SUCCESS on Railway API/worker/cloud-login. Public OpenAPI exposes project/client
request IDs and nested-client create. Actual atomic/retry/browser acceptance remains open.

## 2026-10-20: Audit F30 — atomic project/client creation (TDR-0083)

Project + optional new client + default review link + their audit events now commit
together. Project/client request IDs and fingerprints return only the same live
creator/body/workspace record; project replay checks visibility. Resolve-by-origin
rechecks in the transaction. Settings can create/assign a client in their metadata
transaction. Both forms freeze original details after uncertain responses, retain
IDs, guard concurrent saves and offer copy/close recovery. A confirmed project is
retained before file uploads; lost file-upload responses remain a separate gap.

Pydantic/codegen updated. Production read-only index dry-run reports both new
partial unique indexes missing, no duplicates/conflicts and no business data
modified. Backend Ruff/full mypy (205 files), affected follow-up mypy (25 files)
and scope check (20 repositories) pass. Frontend initially passed 12/12; final web
checks after standalone-client/form refinements and rollout are in progress. No suite,
production client/project creation or shared comment. Live transactional rollback,
response-loss retry, client settings and form acceptance remain pending.
See [TDR-0083](../tdr/0083-atomic-project-and-client-creation.md).

Final affected web lint/typecheck/build passes 3/3 after the form refinements;
the full frontend graph passed 12/12. Backend Ruff/full mypy (205 files), follow-up
mypy/scope checks, codegen, index dry-run and diff checks pass. Existing chunk-size
advisory remains. No live create/rollback/upload/notification acceptance is claimed.

The preceding URL commit 401b29466fbeef0dad635ce4a90b9be0627bbbf4 reports
SUCCESS on Railway API/worker/cloud-login. Public OpenAPI exposes start_url on
project and guest review models. This confirms contract rollout, not browser acceptance.

## 2026-10-20: Audit F16 — website origin and starting address (TDR-0082)

Website writes now store canonical target_origin and full start_url separately.
Legacy rows derive them on read; no rewrite/backfill. Proxy and widget use actual
origins; portal/guest/native launch, edits, cards/search/details, previews and MCP
retain the starting address. Default-port/host normalization and strict new-write
validation avoid malformed bases; sample conversion still checks quota. Canvas
parameters stay before fragments. Initial hash launch does not implement separate
hash-route page/comment identities.

Contracts regenerated. Final checks/rollout are in progress. No production project,
page or feedback write. Browser/path/query/hash, proxy referer/page identity, native
launch and legacy acceptance remain pending. See
[TDR-0082](../tdr/0082-review-origin-and-start-url.md).

Final source checks pass: frontend lint/typecheck/build (12/12, then affected web
checks/build after flow refinements), backend Ruff/full mypy (204 files) and
affected-module follow-ups, scope audit (20 repositories), regenerated contracts
and diff checks. Existing chunk advisory remains. No suite written/run. Opening a
project defaults to its configured starting address; older explicit page links get
an origin-mismatch explanation and Open current website. Source changes reset
readiness and remount the frame. Browser acceptance remains pending.

Preceding notification commit ebfc8b1eb23e5d30c1906d2078606ccbe752f73f reports
SUCCESS on Railway API/worker/cloud-login and Vercel
`https://vercel.com/devbackline-7169/app-web/5sig9Fgy6WKki9n2akaNdCUGkekU`.
Public health is status/mongo/redis ok, and OpenAPI exposes email_notifications
default false. This confirms rollout/contract only, not actual inbox delivery.

## 2026-10-20: Audit F28 — feedback email and honest settings (TDR-0081)

Existing feedback switches now describe notifications accurately. A separate,
default-off email switch opts into assignments/replies/mentions/status email;
daily digest stays separate. New eligible rows persist an email outbox, with
immediate Arq jobs, a minute sweep, bounded batches/deadlines, leases, access/email/
preference rechecks and backoff/exhaustion. Initial envelopes persist for stable
Resend idempotency. Apps Script deduplication is unverified and remains at least
once. Provider requests use bounded async HTTP rather than the unbounded pinned
Resend SDK call. No new dependency or historical backfill.

Read-only production index dry-run succeeds: existing review indexes present,
notifications_email_due missing, no conflicts, no review data changes. Contracts
regenerated. Final static checks/rollout are in progress. No production preference,
feedback or email was sent for verification. Receipt, worker restarts/retries,
revocation/opt-out and settings/link acceptance remain pending. See
[TDR-0081](../tdr/0081-feedback-email-delivery.md).

Final source checks pass: full frontend lint/typecheck/build (12/12 Turbo tasks),
backend Ruff across app, mypy on affected modules (20 files), scope audit (20
repositories), regenerated contracts and diff checks. Existing large-chunk warning
remains. No suite written/run. Preceding capacity commit fd7effa reports SUCCESS
on Railway API, worker and cloud-login; live quota contention is still unverified.

## 2026-10-20: Audit F26 — atomic capacity (TDR-0080)

Project create/restore/sample conversion and member invite/direct join/approval
now serialize count + mutation on the workspace in a Mongo transaction. Approval
and seat insertion commit together. AI reserves credit before provider work,
completes on usable output, releases on failure/cancellation and expires abandoned
reservations after ten minutes. The sixty-second provider deadline stays within
the lease. Legacy usage rows remain counted. Usage/AI screens describe reservations,
actual credits, provider unavailability and bounded BugHunt coverage.

Backend Ruff, full mypy (201 files), scope check (20 repositories), web lint,
typecheck/build and diff checks pass; existing chunk warning remains. No suite,
production writes or provider requests. Live contention, rollback, cancellation,
rollover and restart acceptance remains pending. Storage quotas (F24), create
replay (F30) and notification delivery (F28) are still open. Extension/store files
from concurrent work remain excluded. See [TDR-0080](../tdr/0080-atomic-plan-capacity.md).

The preceding TDR-0079 commit 37c2c1a35c17546c27d4e5111bc7fc12c2346b6a now
reports SUCCESS for Railway API, worker and cloud-login. This is deployment
evidence only; no live AI mutation/concurrency acceptance is inferred.

## 2026-10-20: Audit F29 — preserve concurrent priority edits (TDR-0079)

BugHunt now passes its actor through the comments mutation service, rechecks
authorization after the provider request and applies a priority only while the
analyzed body/priority/edited_at/open/live/root/page/workspace snapshot still matches.
Actual writes emit the normal activity and realtime update. Responses report
updated/skipped IDs; the UI invalidates project/ticket/dashboard/activity data and
guards simultaneous Analyze actions. No live AI request/credit was consumed here.
The same source pass removes fabricated suggestion fallbacks: unconfigured AI is
explicitly unavailable, and empty/unusable summary/suggestion output fails clearly.

Source verification/codegen/rollout is in progress. Provider/human-edit/role-loss/
realtime acceptance remains pending, as do F24 storage quotas and F26 capacity
reservations. Unrelated extension manifest/build/icons and Chrome Web Store draft
documents appeared concurrently and are preserved; this slice excludes extension files.

Final source checks pass: web lint/typecheck/build (3/3, existing large-chunk
advisory), backend Ruff across app, mypy on affected AI/comments modules (12 files),
workspace scoping (20 repositories), regenerated contracts and diff checks. No suite
written/run. Live provider/concurrent-edit acceptance remains pending.

## 2026-10-20: Audit continuation — proxy bounds, logout cookies and claims (TDR-0078)

F23 now reads incoming forms within the 2 MiB cap and upstream responses within
16 MiB wire/decoded caps and a total request deadline. Gzip/deflate decompression
is output-bounded; unsupported compression/SSE/incomplete/oversized responses
fail with native-review guidance. F19 relays raw namespaced cookie deletions and
rotations across redirect hops, preserving expiry/Max-Age and cookie policy.
F17's extension Docker stage accepts explicit API/dashboard build inputs. F25
now explicitly preserves all-plan integrations/MCP access and aligns the comparison
instead of introducing a surprise paywall; disabled cloud sessions remain unshipped.
F35 states bounded BugHunt coverage and reconciles FD-22/23 with real provider paths.

Source verification/rollout is in progress. No gzip/cookie/logout/oversize browser
acceptance, custom-address Docker build or production mutation is claimed. The
browser tool remains disabled in Work settings; no workaround or questions were
used. Source work does not close F24 quotas, F26 reservations or F29 AI mutations.

Final checks pass: backend Ruff across app, mypy on affected proxy/billing/AI modules
(20 files), workspace scoping (20 repositories), web lint/typecheck/build (3/3) and
diff checks. Existing large-chunk advisory remains. No suite written/run. Docker
argument behavior is source-reviewed; a custom-address image build remains pending.

TDR-0078 source 217f9afde101860cd3b038b50f73e3e007cfc3d1 succeeds on all three
Railway services and Vercel
`https://vercel.com/devbackline-7169/app-web/EEhgSK71fL3rKMHHPKAVkzjmqetQ`.
Runtime cookie/compression acceptance remains open; deployment is not that evidence.

## 2026-10-20: Chrome Web Store release preparation (TDR-0078)

The user requested publishing Backline's extension and the one-time developer
registration. Prepared extension 0.4.5 with 16/32/48/128-pixel icons from the
existing favicon, toolbar icons, a Chrome 110 minimum matching the bundle target,
and icon inclusion in the upload ZIP. No permissions/API behavior change. Existing
unrelated working-tree changes are preserved.

[TDR-0078](../tdr/0078-chrome-web-store-release-preparation.md) and the
[release handoff](chrome-web-store-release-2026-10-20.md) record source-backed store
copy, permission/data disclosures and missing policy/account/screenshot inputs.
Chrome settings visibly report installed extension 0.4.3. Existing-tab reads work;
creating the developer-dashboard tab returns `Not allowed`. Asked the user to open
it. No account registration, payment, upload, store submission, production rollout
or installed-0.4.5 browser acceptance has occurred. Extension/widget lint,
typecheck and build passed (6/6 Turbo tasks); rebuilt after final icon rendering
and inspected the ZIP for root manifest, scripts and all four icon sizes. Icons
were visually inspected. No suite written/run. A subsequent Chrome inventory shows
Google sign-in for the Web Store; asked the user to finish sign-in themselves.

## 2026-10-20: PDF/image commenting and preview repairs (TDR-0077)

Continued the user's PDF/image and audit-gap request. Added a typed file-region
endpoint preserving the asset/page anchor instead of sending regions through the
website-anchor contract. The older website endpoint rejects file anchors. Added
authenticated/rate-limited/bounded private file reads with closed storage bodies,
no-store/nosniff headers and escaped filenames. Frontend preview loads stable file
bytes through React Query and renders PDF pages from one document with a bounded
canvas, actual readiness and loading/error/retry states. Signed metadata polling
no longer resets the PDF document. Requested tickets resolve to their asset/page;
drafts are retained across navigation and pin location changes report failures.

See [TDR-0077](../tdr/0077-reliable-pdf-image-review.md). Regenerate API declarations
and finish affected static checks before publishing. Browser work is blocked by
Work browser-use settings, so no PDF/image upload, comment or pin movement has been
submitted to production in this pass. Real rendering/storage, guest/role, duplicate
retry, page changes, replacement-version mapping and mobile acceptance remain open.
Do not infer working PDF journeys solely from compile checks.

TDR-0075's Vercel rollout 6366103 reports SUCCESS at
`https://vercel.com/devbackline-7169/app-web/9T1AVxgBU7J2CpcTzLHTiVS212BK`.
Downloaded public extension ZIP reports 0.4.4; all five normalized text entries
match the local build (background/content script/manifest/popup HTML/popup JS).
This proves the served artifact, not installation or browser acceptance. The
latest backend Ruff/mypy (201 files) and workspace scoping (20 repositories) pass
after the PDF content/region additions. Final frontend checks remain in progress.

**Final source checks:** frontend lint/typecheck/build passes 12/12 after all PDF
and file-reply changes. The existing large-chunk advisory remains. Backend Ruff,
strict mypy (201 source files), scope audit (20 repositories), formatting and diff
checks pass. No suite written/run. Public API `/health` reports status/mongo/redis
all ok. These results permit a source rollout; browser/storage write/concurrency
acceptance remains open and is not replaced by the health check.

## 2026-10-20: Site-wide roadmap work, first feature slice (TDR-0076)

The full source inventory and remaining implementation boundaries live in
[Coming soon delivery](coming-soon-delivery-2026-10-20.md). This continuation
implements active/archived file management with upload/rename/archive/restore,
transactional file capacity, latest-captured-version page approval/reopen with
stale/conflict handling, and a current-project/page Team note entry backed by
member-only team tickets. It also adds request IDs/fingerprint replay to standalone
tickets and image/PDF comments, pending edit locks and draft recovery. Private DOM
pinning, deploy capture coordination, native mobile execution, console/network
recording, video/audio and custom/white-label domains remain open, not shipped.

Pydantic contracts are additive and packages/types are regenerated. No destructive
migration or shared fixture. Verification/rollout is in progress; do not claim
actual save/concurrency/role/guest acceptance until recorded. Earlier intermediate
frontend graph passed 12/12; backend Ruff/mypy passed before the latest ticket/file
replay changes. Final checks and browser evidence will follow; no suite written/run.

TDR-0075 source 6366103 is pushed. Railway API deployment
9edb37c6-d3ed-426b-8c43-6de1bbef7a38 and worker deployment
520b276d-ffd4-485d-8cf8-949ab04c263d both report SUCCESS on that exact commit.
Extension 0.4.4 is built/published there, but installed Chrome remains 0.4.3 and
updated-extension retry/copy/failure acceptance is still pending. Cloud-login
remains on 960c32a; shared server browser isolation is not enabled.

**Verification before final review:** full frontend graph passes 12/12. Backend
Ruff, strict mypy (201 files) and workspace scoping (20 repository files) pass.
No suite written/run. A subsequent review adds file-reply IDs/draft locks, refuses
silent fallback to a different file after archive, and retains API status codes for
guest safe-rejection recovery; affected frontend checks are repeated before release.
Chrome manual acceptance is currently blocked: the browser tool reports local
browser use disabled in Work settings. No browser-setting workaround, new shared
comment, approval, file upload/archive or account change was performed. Keep actual
write/concurrency/guest-negative and installed-0.4.4 acceptance open.

Pricing also now marks cloud login sessions unshipped, matching the retained server
browser isolation gate rather than selling disabled infrastructure as available.

**TDR-0076/77 rollout:** commit b92e54ad88ceae35a0bd639b5148fc84851463d8
succeeds on Railway API (55b03d03-9793-45a7-8db2-4ada726e774b), worker
(d69626e2-ebf3-4e98-be6d-3085173dac33) and cloud-login
(dd0c248f-7164-4c36-91a2-e89069d6f652), and Vercel
`https://vercel.com/devbackline-7169/app-web/FkAAxm7hJpiCtkNCrjeqA1y8Rga1`.
Public OpenAPI exposes file-content, file-region and page-approval endpoints;
health reports status/mongo/redis all ok. No production data mutation or browser
functional acceptance is inferred from route availability/deployment success.

## 2026-10-19: Comment retry and sign-in continuity (TDR-0075)

Point/region callbacks now share one serialized in-memory CommentCreate submission
and exact request ID/evidence across retry, while retaining server replay guards.
Pending/ambiguous text, tag and attachment changes are locked; Copy comment text,
Retry save and Close preserve an honest recovery path. Document URL guards prevent
new-page captures being saved against the previous registered page. Sign-in uses
wall-clock code deadlines, synchronous pending guards and one-time return-path
consumption; protected URLs retain fragments and unsafe path characters fail closed.

See [TDR-0075](../tdr/0075-comment-retry-and-sign-in-continuity.md). Full frontend
lint/typecheck/build graph passed 12/12, including widget/extension/web, before the
final conservative authentication-loss classification; repeat affected checks
before publishing. Existing web chunk-size advisory remains. No suite written/run,
API contract change, backend permission change or migration. Extension version is
consolidated at 0.4.4; installed Chrome is still 0.4.3. Deployment, installed copy,
ambiguous-response replay, attachment locking, changed-page and actual OTP/provider
journeys are pending; no extra comment/reply/attachment has been posted.

The user additionally authorized implementation of the site's Coming soon scope
without clarification questions. Inventory and delivery of that larger scope
continue after this repair; do not equate removing a label with feature completion.

## 2026-10-19: Product review guidance and readiness (TDR-0074)

User requested a smoother end-to-end product flow. Extension settings now guide
install/update -> actual browser check -> choose project -> automatic launch.
Standalone token generation is optional/collapsed; the access list distinguishes
scope/expiry and excludes expired records instead of labelling them Connected.
No new credentials are created by the readiness check. Shared bridge validation
keeps exact source/origin/request matching, cancellation and compatibility checks.
Invalidated-context recovery offers an explicit Reload Backline action.

Canvas readiness now updates React state. Mode/dock controls and shortcuts reject
interaction until real widget acknowledgement, during failure or on static renders.
The project has one native launcher/dialog; recovery actions delegate to it. The
failed preview explains that saved feedback remains available and offers direct
extension launch/retry. Diagnostic details are disclosed on demand. Guest choice
and board-return/empty-state guidance now describe their actual next steps.

See [TDR-0074](../tdr/0074-review-guidance-and-readiness.md). This is web-only: no
API/schema/data migration, extension update or backend behavior change. Web lint,
typecheck and production build pass (3/3), with the existing large-chunk advisory;
diff checks pass. No test suite written/run. Deployment and browser evidence will
follow. Full CR-02/03, native panel parity,
induced errors and broad guest/provider coverage remain open.

Initial rollout `a9de5a6` succeeds on Vercel
`https://vercel.com/devbackline-7169/app-web/Eb4XGeZ44RsPSGVjcJ1zN1x1yyNk`.
Chrome detects installed 0.4.3 and repeats the readiness check successfully.
Standalone Generate token is initially hidden, becomes visible only on opening
the optional disclosure, and is not used; the seven access records remain seven
across checking. Choose a project reaches the workspace.

The actual Example Project preview fails on this run, including one retry; this
is recorded as failure rather than a successful live-preview check. Initial and
failed Comment/Draw/dock buttons are disabled. Existing Comments (3) remain
readable. The recovery action inside the failed preview opens exactly one dialog,
launches the real example.com page and reaches acknowledged native connection.
The live visual check also caught a horizontal layout inherited by the new Step 2
content; a follow-up stacks its instructions and sizes the project action normally,
and increases install-list legibility. Final web lint/typecheck/build again pass
3/3. The corrected layout's rollout/browser evidence will follow.

The new-project walkthrough also found contradictory roadmap copy: Web App Coming
soon implied signed-in website review was not available and promised a shared
login session. Clarified that Website already supports native signed-in review
using each reviewer's own account. The roadmap describes planned state/diagnostic
work and offers Review a website now back to the URL-owned Website filter. No
project was created or existing project changed during this walkthrough.
The actual type/details/back/close path is usable without saving. The final copy
follow-up again passes web lint/typecheck/build (3/3), retaining the same advisory.

The f02786a roadmap follow-up succeeds on Vercel
`https://vercel.com/devbackline-7169/app-web/2HcuC7fyhVVGC7VYrQ6AdBoSH3SK`.
Live Chrome confirms the new Web App wording and Review a website now changes the
URL to `?type=website`. The new-project Website description explicitly covers
sign-in pages. No project/client/account setting was saved. Native recovery also
returns to the original portal with its newly selected QA thread intact; the
failed-preview D shortcut leaves that URL unchanged. Tools close cleanly. YouTube
also reaches the honest failure state with disabled Comment and existing feedback
access. No additional comment/reply/attachment/workflow update was submitted.

Final visual polish scopes inherited settings styles so emphasized instruction
text stays inline and the access list stacks below its explanation. Final web
lint/typecheck/build passes 3/3 again; no suites written/run. Healthy embedded
readiness re-enable, induced invalidation/old/wrong-server/offline checks and guest
board/provider journeys remain unverified in this pass. Successful native recovery
is recorded separately from the failed preview; no universal compatibility claim.

**Final rollout and visual check:** source
`c945bcfb8764ef4d6241cb819367f3c89bdcdeb4` succeeds on Vercel
`https://vercel.com/devbackline-7169/app-web/8rqfA2fHH885Ev3u1dsAH43cA9ec`.
Reloaded Chrome renders the corrected stacked instructions, inline emphasis,
normally sized Choose a project action (130.19×46 CSS pixels), collapsed optional
standalone setup and actual extension 0.4.3 readiness. Visual proof is saved at
`.tools/verification/2026-10-19-project-first-extension-setup.png`. A separate fresh
public review renders the name/Join review gate and no-account copy; no identity
was created. Closed that temporary guest tab.

Backend/worker remain successful on 679c1c1 and cloud-login on 960c32a; unchanged
backend inputs did not require redeployment. The installed 0.4.3 extension remains
usable; no new extension download or permission change is required. Final source
lint/typecheck/build is 3/3 and diff checks pass. Remaining acceptance is stated
above and in TDR-0074; this delivery does not complete CR-02/03.

## 2026-10-19: Installed 0.4.3 short-window layout acceptance

The user confirmed the updated extension was installed and connected. The original
portal tab still held an invalidated extension context; a normal portal reload
restored connection and the real website toolbar acknowledged launch. No settings
access or installation bypass was attempted.

The corrected native composer now places Post at 485.55–519.675 CSS pixels, above
the toolbar's 544.4-pixel top. The previous overlapping Post bottom was 613.875.
A real pointer click on Post with an empty body shows "Write a comment before
posting" locally, without submitting. A 60-line draft stays bounded at
12.4–532.8 pixels (height 520.4); switching to Draw preserves it and shows the
finish/cancel guidance. Pointer Cancel removes the composer. Return to Backline
retains the existing page/thread URL; the comment count remains three. Closing
tools removes the toolbar; closed only the new verification website tab.

Visual evidence: `.tools/verification/2026-10-19-extension-0.4.3-layout.png`.
This verifies the observed short-window overlap repair on the updated extension,
including long-draft cancellation. No additional comment, reply, attachment or
workflow mutation was submitted. Induced capture/upload rejection, wrapped/narrow
windows, guest native lifecycle and broad password/SSO coverage remain open.
Product source is unchanged from deployed 679c1c1; this continuation updates
verification evidence only. No test suite written/run; prior source lint,
typecheck/build results remain applicable.

## 2026-10-19: Native draft/return acceptance and composer recovery (TDR-0072)

Browser use is available again. With the user's installed 0.4.1 extension, the
existing Example Project opens its exact real website tab and acknowledges the
toolbar. Comment placement opens the composer. A filled draft blocks a switch to
Browse with "Finish or cancel your current comment first"; its body remains
visible. Cancel removes the composer/ghost pin, and Browse resumes. Return to
Backline uses the original project tab without a duplicate. After selecting an
existing portal thread, returning again retains the exact `?thread=` URL. Closing
website tools removes the toolbar and leaves the target page usable. Existing
portal feedback remains readable during proxy failure; the two-comment count is
unchanged. No comment, reply, attachment or workflow mutation was submitted.

The existing YouTube project also opens its actual top-level website, retaining
the already signed-in YouTube account and receiving toolbar acknowledgement.
Return reaches the original project. Its proxy fails explicitly with extension
and retry actions and the footer reports "Preview unavailable". This verifies
native launch/session reuse for this site; it does not establish a fresh password,
Google/SSO, CAPTCHA or arbitrary-site login pass. Local visual evidence is saved at
`.tools/verification/2026-10-19-youtube-fallback.png` (ignored).

Fixed audit F21 in source: the shared composer now catches rejected promises and
synchronous adapter callback exceptions, restores Post/Cancel, preserves the draft
and shows a retryable error. It ignores completion after teardown. Extension
0.4.2 bundles the repair with unchanged permissions/protocol; minimum launch
compatibility remains 0.4.1. See [TDR-0072](../tdr/0072-composer-submit-recovery.md).
Full frontend lint/typecheck/build passes 12/12 (three cached), retaining the
existing large-chunk build advisory. No test suite written/run. Deployment
evidence will follow. A real induced failure on the
updated extension, comment/evidence persistence, guest native lifecycle and broad
site/auth acceptance remain open. CR-02/03 and native panel parity remain pending.

After explicit user approval for one labelled QA comment and a screenshot of the
public example.com page, posted exactly that comment via Ctrl+Enter. Native pin
and portal ticket #2 (`6ad60df94461891ca00808fe`) appear; total comments change
from two to three. The portal loads "Captured review context" at 1920×799 pixels.
Reload retains the exact page/thread URL, comment body and loaded screenshot.
No additional comment/reply, attachment selection, deletion or workflow change
was made. Evidence: `.tools/verification/2026-10-19-native-ticket-persisted.png`.
This is a normal native save/read/reload pass, not induced failure/concurrency or
guest acceptance.
Reloading the real website also restores its native toolbar in Browse mode.
Comment mode reloads the saved pin; opening it displays the same persisted QA
body and Bug tag. Closed the comment/tools and the two verification website tabs,
leaving the original portal on the saved ticket.

The prepared draft exposed a separate native toolbar overlap: toolbar top 544.4,
Post at 579.75–613.875, composer bottom 626.675 CSS pixels. Fixed measured bottom
space, card resize/inset/viewport updates, bounded scrollable card bodies and
observer cleanup in [TDR-0073](../tdr/0073-native-toolbar-card-layout.md). Extension
0.4.3 includes this and TDR-0072; permissions/protocol unchanged. The portal minimum
remains 0.4.1. Full frontend lint/typecheck/build passes 12/12 (six cached), and
diff checks pass; no test suite written/run. Actual corrected short-window visual
and rejection-path acceptance needs the updated/reloaded 0.4.3 extension.

**Final rollout:** source `679c1c1d444511122c931923c54044f953b32a41` is successful
on Vercel `https://vercel.com/devbackline-7169/app-web/Bacep5d2mJK9C3j4ABFViUKWVdGm`,
Railway API `669ac879-fcae-4649-b743-9b0615ccfc82` and worker
`b7daff69-5c22-4154-aacd-7964c1c338e8`. Cloud-login remains healthy on successful
`960c32a` / `429eabb3-0c74-4baf-a653-e6c66f853994`: its inputs did not change in
this slice. API/cloud health returns ok, including Mongo/Redis. The served SDK is
byte-identical to the local build. All five ZIP entries match local extension
output after text-newline normalization; manifest version is 0.4.3 with unchanged
storage/activeTab/scripting permissions. No API/schema/migration was introduced.

Asked the user to replace the existing unpacked extension files with the current
same-site download, Reload its card and reload Backline. Browser URL policy blocks
Chrome extension settings, so that final local update cannot be automated through
the available browser tool. The installed 0.4.1 native save/return results above do
not claim the 0.4.3 layout/rejection repair has already run in this browser.

## 2026-10-19: Refresh-family continuity during native launch (TDR-0071)

After the user updated to extension 0.4.1, minimum-version validation passed and
the real requested website tab opened, preserving its Backline login; the wrong
same-origin reuse is fixed. Toolbar readiness then failed. API evidence shows
project GET 200 at 11:58:19 UTC and 401 at 11:58:20 while the new tab restored its
member cookie. Source tracing found revocation and successor creation in separate
awaited writes, allowing `find_active_in_family` to see an empty live family.

Committed both writes in one Mongo transaction with snapshot/majority concerns,
an expiry/revocation CAS and unchanged replay/family guards. Repository sessions
remain optional for other callers; service owns orchestration. No API/schema,
index or content migration. Read-only production hello verifies replica set,
logical-session support and wire version 25, without printing credentials or
topology names. Ruff lint/format (218 files), strict mypy (201 files), workspace
scoping (20 repositories) and diff checks pass; no test suite written/run. Actual
database failure/replay/logout concurrency acceptance remains open. Rollout and
new-tab retest evidence will follow. The installed 0.4.1 extension needs no further
update for this server-side repair.

**Rollout and live retest:** `960c32a248de79a46dc6baca10c5de71b693107c` is successful
on Vercel `https://vercel.com/devbackline-7169/app-web/ELGJJcWZ8CBPh58ejDWdRAe35ysy`
and Railway API `05138d26-9338-4758-b2ef-1c51a2464176`, worker
`cadd2b4a-f6f8-4aef-a469-03c101fd0f7f`, cloud-login
`429eabb3-0c74-4baf-a653-e6c66f853994`. API/cloud health 200, Mongo/Redis ok,
all 123 OpenAPI paths/schemas equal generated source, extension ZIP version 0.4.1,
and missing-cookie refresh rejects with 401. No new API schema was introduced.

The actual Chrome retest passes extension minimum-version/protocol checks,
opens a new real target-site tab instead of an unrelated portal, preserves the
website login through its same-origin redirect to the workspace picker, and
acknowledges its visible toolbar. Project checks at 12:07:04/06 UTC both return
200; cookie refresh at 12:07:07 returns 200. Comment mode activates and displays
"Click an element to leave a comment." Page registration/snapshot may occur as
part of that normal activation; no comment body, attachment or workflow update
was submitted. Footer Access also verified to use the unified Share dialog.

At continuation, the browser tool reported local browser use disabled in Work
settings. Requested re-enable asynchronously; no alternative control mechanism
was used. Current-version draft/cancel, native return after query change, posting
and evidence persistence, guest native lifecycle and broad site password/SSO
acceptance remain open. The prior 0.4.0 return/close result does not substitute
for the complete 0.4.1 pass. This release is deployed, not universally verified.

## 2026-10-19: Guided reviewer flow and sharing safeguards (TDR-0070)

Implemented a website sign-in question, guided desktop extension setup/retry,
acknowledged connection steps and return instructions. Extension 0.4.0 forwards
HTTP errors and returns to the original matching portal tab, preserving tab-local
guest identity when available. Launch excludes the originating Backline tab even
when Backline itself is the target. Closing website tools and ending the guest
identity are labelled distinctly.

Guest recovery offers retry/rejoin without losing identity on transient failure.
The new authenticated, rate-limited `/guest-sessions/current/end` action persists
additive `ended_at`; shared access guards reject ended sessions. Leaving clears
portal storage/cache after acknowledged exit. Board loading errors offer retry;
permission loss hides previously loaded rows. Share-link/route changes guard late
join/leave completions.

Share dialogs/manager/project preview distinguish active, expired and revoked
links and recheck before copying. Creation advises a real first review before
sharing. New links cannot enable unavailable verified domain/export options;
legacy filters/flags remain readable and explicitly labelled, with replacement
guidance. New expiries require a timezone/future instant. Project edits use one
scoped document mutation for metadata/settings; null settings are ignored without
clearing unrelated keys. Cross-browser capture is visibly unavailable while the
server isolation gate remains disabled. See [TDR-0070](../tdr/0070-guided-review-and-sharing.md).

Verification passed: regenerated Pydantic OpenAPI/TypeScript contracts; final full
frontend lint/typecheck/build passed 12/12 (nine cached), Ruff lint/format (218 files),
strict mypy (201 files), workspace scoping (20 repositories) and `git diff --check`.
The build retains its large-chunk advisory.
No test suite written/run. Browser control became available:
Chrome opens Backline and reaches its signed-out login page; user sign-in was
requested asynchronously. Actual extension setup/login/return and session lifecycle acceptance
remain pending, as do CR-02/03, native panel parity, email receipt and isolated
storage/concurrency tests. F15 legacy migration and F30 creation/event delivery are
not declared closed.

Deployed product commit `8037aeb569a7f1bf2e71b9ce9526e3ff705cb1ef` to main.
Vercel reports success at
`https://vercel.com/devbackline-7169/app-web/9err4aKSA7wdQqntykD3F57MbZAA`.
Railway API `187cb5bd-d6b5-472f-921e-d32672c83a20`, worker
`3cd6cbb5-0e20-4c39-b614-bbbaa3f232f1` and cloud-login
`b128284a-2a12-4e18-b4ab-f433a22b5097` all report SUCCESS for this exact source.

Live verification: API/cloud health 200; Mongo/Redis ok; all 123 OpenAPI paths and
schemas match generated source exactly; SDK bytes match local build. Guest status,
guest end, project detail and guest board without credentials return 401. Extension
download is 0.4.0, has the current API/return handler/close-tools label, and all ZIP
entries match local build after normalizing Windows/Linux text newlines; manifest
JSON also matches structurally. Archive timestamps/newlines prevent byte-identical
ZIPs. Served frontend chunks contain setup/retry, sign-in question, rejoin and
expired/unavailable-policy copy. Chrome confirms the invalid-link recovery page,
Try again enters loading and returns to a usable recovery page. These checks do not
establish signed-in review, extension installation or site-login acceptance. Update
unpacked extensions to 0.4.0 and reload Backline to use the new toolbar return flow.
The verification sign-in tab is retained for user continuation. No production
review content or account fixture was created or modified for these checks.

Signed-in follow-up: the user completed login. Verified workspace selection,
existing Q/A Tool project, explicit proxy failure recovery, missing-extension
guided setup with current download, focus returning to the launcher on close,
and active sharing settings (no expiry/passcode/domain filter, guest export
unavailable). The browser pass found a footer still reporting Connecting proxy
after failure; the readiness fallback masked error state. Corrected precedence
to report Preview unavailable for frame/widget error or missing acknowledgement.
Affected web lint, typecheck and production build pass. This follow-up does not
require a backend change. Browser installation approval was obtained, but the
browser URL policy refuses `chrome://` settings; the user was asked to complete
the unpacked 0.4.0 installation manually. Further live results follow separately.

After the user installed the site download and connected the extension, a full
portal reload enabled protocol detection. Verified toolbar acknowledgement,
Return to Backline without a duplicate in that run, and closing the website tools.
The run also reproduced a wrong destination: 0.4.0 reused an unrelated Backline
review tab merely because its origin matched. Version 0.4.1 restricts that case to
an exact URL, otherwise opens the requested website page. The return action also
retains the originating portal on the same origin/path when its query changed,
without navigating away from its latest ticket/filter context.

A public review tab became blank after member session restoration. Source review
identified active public-query removal as a cache-lifetime gap. Preserve only the
public review resolver family during identity/workspace change/logout; protected
queries and the mutation cache are cleared. Missing resolver data gets an explicit
refetch recovery screen. Verified the real guest name gate, join, sign-in question
and same-tab identity recovery across reload using one clearly labelled flow-check
guest identity. No comment, attachment, contact or project-setting mutation has
been submitted in this pass. Final 0.4.1 checks and rollout follow below.

Guest exit now also verified live: POST current/end returns 204, reload displays a
fresh empty name gate, and the flow-check identity is no longer reused. Final
source lint/typecheck/build passes 12/12 (nine cached) after the public-query and
0.4.1 tab-selection/return repairs; backend source/contracts are unchanged from
the already verified 123-path deployment. `git diff --check` passes. Extension
permissions are unchanged. Signed-in site posting/evidence and full browser
acceptance of 0.4.1 still require the installed extension update.
The portal now checks a minimum extension version of 0.4.1 before issuing a launch
credential, with explicit update instructions for 0.4.0/older unpacked installs.
Affected web lint/typecheck/build pass after this minimum-version check. Live ZIP
reports 0.4.1 and contains both tab-selection and return-path repairs. API and
worker report SUCCESS for `108ea48f401787b9d52ddd3282c6b631f264fb7e`, respectively
`c4520e5d-940f-4f38-9df0-2661d31308d0` and
`7ef6a374-e628-4258-a72a-27ca73344741`. Cloud-login remains the successful
8037aeb build because none of its backend inputs changed. The corrected preview
footer now reports Preview unavailable during real failure. Existing project
comments remain accessible in the side panel while the preview fails.

Final flow consistency: footer Access now delegates to the primary Share dialog,
removing the legacy one-link revoke toggle that implied project-wide disable.
Project-menu copy also excludes expired links. Failure-screen URL editing and
settings rendering now respect manager access, matching the project menu/API;
editors see manager guidance. Web lint/typecheck/build pass. The minimum-version
portal release `31c3e58` is successful on Vercel
`https://vercel.com/devbackline-7169/app-web/CUx7c6hcsRtVKfK9QCwcS2oMgz1w`;
live chunks include 0.4.1 update guidance, mutation-cache cleanup and blank-data
recovery. Chrome confirms an installed 0.4.0 is refused before launch with clear
update instructions. The formerly blank public review renders its recovery screen
after reload/session restore. User was given the same-site 0.4.1 ZIP link and asked
to replace the already approved extension files/reload; final native checks await it.

## 2026-10-19: Proxy recovery, extension connection and evidence persistence

User examples: Backline itself, YouTube and Notion, followed by an explicit request
to offer extension review when the proxy fails. Added visible loading/sign-in help,
15-second missing-widget-acknowledgement recovery, Open with extension and Retry
proxy. Matching frame source/origin is required for readiness. Existing proxy
projects remain available. See [TDR-0069](../tdr/0069-proxy-fallback-and-extension-connection.md).

Read-only HTTP inspection found SAMEORIGIN/frame-ancestor restrictions on the
example sites, Notion's cross-domain redirect and an independent concrete defect:
the extension used obsolete `app-production-f121.up.railway.app` (health 404).
Version 0.3.0 now points at the actual API. Protocol v2 exposes API/version; stale
builds get update instructions before a token is issued. Launch waits for the real
tab's toolbar and current access acknowledgement. Member launch tokens are limited
to their project, original authentication/session family and eight hours. Manual
extension tokens expire after 30 days; account/admin routes reject extension
credentials. Native snapshot submission uses the existing page-scoped relay.

F03/F22 follow-up in [TDR-0068](../tdr/0068-review-evidence-persistence.md): issued
upload registry, actor/project checks, actual S3 metadata checks on new attachment
references; legacy persisted evidence remains readable. Snapshot JSON is written
before a transaction commits the revision/page pointer/durable delivery marker.
Minute sweeps and leased retries survive queue/process failures. Original records
and indexes are retained; no destructive fixture/content migration ran. Index
dry-run found two missing nonunique indexes and no conflicts. Failure/concurrency
acceptance remains open.
Explicit additive apply then created `revisions_delivery_due` and
`uploads_workspace_project`; no review data modified. Verified all three service
watch-path diffs are empty and server-browser settings are explicitly false.

Verification passed: Pydantic OpenAPI/types regenerated, full frontend
`pnpm turbo run lint typecheck build` 12/12 (one cached), backend Ruff lint/format
(218 files), strict mypy (201 files), workspace scoping (20 repositories) and
`git diff --check`. No test suites written/run. Browser control remains disabled
in Work settings; extension launch, website password/SSO and actual code receipt
are not claimed verified. Unpacked extension users must replace/reload 0.3.0 and
reload Backline. New connected installation/launch (CR-02/03) remains pending.

First release `4fcd618` already reached Vercel and all three Railway services:
API `a77e47ee-f51a-46df-acb4-1aa5bad881b9`, worker
`3622bf66-fe9f-4737-ad0e-552cfd7d0955`, cloud-login
`b4c9f647-6d49-409e-9dcb-961162a54a48`. Mongo/Redis health and 122-route
OpenAPI equality passed; SDK matched local output. Missing guest/refresh credentials
returned 401, untrusted auth origin 403, Google start 200 with no-store and secure
HttpOnly state cookie. The initial callback probe was schema-invalid (422), so it
does not establish valid-shape OAuth state rejection. API/worker/cloud-login now
all have explicit `SERVER_BROWSER_ENABLED=false`. Watch paths persisted only after
using the introspected service update API; script now verifies the resulting state.
Final follow-up deployment evidence will be appended after push.

**Follow-up rollout verified:** product commit `f5682946f86e24d9f0e8c5d18faf9378ef16988c`
pushed to main. Vercel reported success at
`https://vercel.com/devbackline-7169/app-web/8bf2KLMUK5qgrTiVrKoB8b6AXwn2`.
Railway API `d12c2b2c-3982-4c0f-9ee3-85b8123f84b1`, worker
`5b5bf012-c67c-472c-abcb-65342f520770` and cloud-login
`874368a0-91ee-47b9-bbb0-d9565da0c03c` all report SUCCESS for this exact commit.
Worker startup registers both snapshot delivery and sweep jobs. Read-only index
inspection now finds both indexes present, no conflicts or missing indexes.

Live HTTP checks: API and cloud-login health 200, Mongo/Redis ok, exact OpenAPI
equality with generated source, SDK exact equality, dashboard login 200 and served
project chunk contains recovery notice/Retry proxy. The extension ZIP returns 200,
contains version 0.3.0, the actual API URL, protocol v2/readiness, and no obsolete
API hostname. Missing guest/member/upload/project/refresh authentication returns
401; malformed signup 422; untrusted account origin 403. A valid-shape unsolicited
Google callback returns application `VALIDATION_ERROR` 422 before provider exchange.
These are deployed artifact/route checks, not browser/site login acceptance.

Remaining gates: actual email receipt and signup/login, Chrome/Edge extension
update/handshake, signed-in Backline/YouTube/Notion including Notion's new host,
capture/attachment persistence and induced storage/queue/concurrency failures on an
isolated stack. Browser use is disabled in Work settings. No promise that proxy or
extension supports every site; new connected installation/launch and full panel
parity remain pending. Final ledger update is a documentation-only follow-up commit.

## 2026-10-19: Production rollout preflight and email reliability (TDR-0067)

Fixed F11's false-success/logged-OTP fallback: only explicit local mode without a
provider uses inbox logs. Production and configured-provider failures return a
standard delivery error, with provider exception classes only in logs.

Preflight found Railway API on `52f611b`, worker on `311ddf5`, cloud-login on
`1eba944`: API watched only widget paths; worker watched only extension paths.
Added a checked-in build-input manifest and read-only-first PowerShell repair
command. Dry-run confirmed all three requested changes; no database writes.

Read-only production identity inventory: nine accounts require initial inbox
proof, zero existing passwords to retire, twelve unrevoked refresh records, four
extension tokens, zero MCP tokens. Member IDs and review data are preserved.
Apps Script/Resend/Google are configured; Resend domain listing returned 401 and
Apps Script GET reachability does not prove mail delivery. Actual code receipt
remains an acceptance item. Local browser control is disabled in Work settings.

Verification: full frontend lint/typecheck/build passed 12/12 (cached unchanged
frontend inputs); backend Ruff lint and format (214 files), strict mypy (198 files)
and workspace scoping (20 repositories) passed. `git diff --check` passed. No test
suite written/run. Deployment IDs, live checks and remaining blockers will be
recorded after rollout, without treating these preflight checks as live acceptance.

## 2026-10-19: Guest recovery and review lifetime (TDR-0066)

Added a no-store, guest-authenticated current-session endpoint using shared live
policy, and exact share-link identity/return metadata in public resolution. Portal
and widget validate stored/handoff identity before reuse, clear invalid cache entries,
tolerate unavailable storage, and preserve identity on transient failures. Member
identity is never silently downgraded to a guest.

The portal monitors active guest sessions, cancels/removes old guest-token query
data on access loss, returns to a clear rejoin gate and resets state on review-link
navigation. This covers its website choice, guest board and image/PDF flows. The
widget ends its client/listeners/route polling/region capture and clears protected
UI on authorization loss, with a visible return/dismiss notice. Reconnects detect
expired tokens and stop retrying revoked sessions. Shared transport type boundaries
remain compatible with the extension. See [TDR-0066](../tdr/0066-guest-session-recovery.md).

**Verification passed:** Pydantic OpenAPI/types regenerated; backend Ruff
lint/format (214 files), strict mypy (198 source files) and workspace-scoping lint
(20 repository files) passed. The frontend check found shared transport types that
required the new concrete widget `close` method; narrowed capture helper and extension
context types to their actual request/upload contract. Full
`pnpm turbo run lint typecheck build` passed all 12 tasks after that correction
(five cached). SDK output is 64.46 kB / 21.26 kB gzip. `git diff --check` passed with
only existing LF/CRLF conversion notices. No new test suite, live database/browser/provider
acceptance, data migration, deployment, commit or push in this increment.

**Still open:** all live acceptance groups, CR-01 upload registry (F03), general
tool credential lifecycle (F14), domain ownership (F15), snapshot durability (F22)
and actual server-browser isolation. F01/F34 have source repairs requiring real
identity/guest recovery verification. CR-02..06, including new installation and
safe launch/login return, are not completed by these changes. Legacy URL bearers
(F20) are still present until CR-03 replaces that handoff.

## 2026-10-19: Verified member identities and server capture gate (TDR-0064/0065)

Implemented a further CR-01 increment. Signup now returns an emailed-code challenge
(HTTP 202); `/auth/signup/verify` consumes its signup-purpose OTP and conditionally
activates the password identity before issuing a session. The login page includes
verification/resend/cancel, keeps the password in tab memory and supports existing
code/Google recovery. No account/password/session is created by the initial request.
Pydantic/OpenAPI/types have been regenerated for the changed signup contract.

First explicit code/Google proof on a legacy account retires its old password. JWT
families, refresh, extension/MCP tokens and member canvas sessions enforce an explicit
verification marker and reject credentials originating before proof. Account IDs,
memberships and feedback remain stored. Canvas session reuse excludes obsolete
records. Email changes record new proof and sign out old sessions with clear UI.
A read-only aggregate rollout inventory script is added; it has not been run against
a live/shared database and never marks historical accounts verified.

**Rollout behavior:** old members must verify once with an email code or Google and
reconnect older tools. Backend and frontend must deploy together; verify actual email
delivery before promotion. See [TDR-0064](../tdr/0064-verified-email-identities.md).

Added operator-only `SERVER_BROWSER_ENABLED=false` to environment examples and the
settings default. Unisolated environments reject fresh server render/manual preview
requests, skip automatic preview queuing and fail queued render/preview execution
before browser launch. The legacy cloud-login ticket/execution follows the gate.
Saved previews remain readable; user-browser review stays available. Preview errors
now surface the API's unavailable reason. This mitigates F09 but does not implement
network isolation; only enable after [TDR-0065](../tdr/0065-server-browser-isolation-gate.md)'s
infrastructure acceptance. No infrastructure purchase/change is performed.

**Verification:** full backend Ruff lint/format passed (214 files), mypy passed
(198 source files), and workspace-scoping lint passed (20 repository files).
Generated contracts succeeded. Full frontend lint/typecheck/build passed 12/12
(five cached); the final preview-error-message follow-up passed web-only lint,
typecheck and build (3/3). Guest-recovery follow-up verification is recorded above.
No automated suites are written or run per
the Codex repository instruction. No shared database changes, migration, deployment,
commit or push in this increment.

**Open:** live signup/invited/pre-registered account/code/Google recovery, credential
cutoff and ordinary-guest regressions; actual isolated browser-worker egress;
F03 upload registry/type/existence, F14 general tool credential lifecycle, F15 domain
ownership, F22 snapshot durability and F34 guest cache/rejoin. CR-01 remains open;
CR-02 installation and CR-03 launch/login handoff are next, followed by panel parity,
portal reproduction and MCP verification. All CR-A groups still require live evidence.

## 2026-10-19: Validation recovered; refresh and OTP concurrency (TDR-0063)

Local command execution recovered. Re-exported OpenAPI from the backend and
regenerated `packages/types/src/openapi.ts` with `generate:local`; generated files
were not hand-edited. The prior contract-generation hold is resolved.

Added origin-scoped Web Locks around refresh/workspace restoration where supported,
retaining per-tab token memory and the existing single-flight promise. A queued
operation checks its local session revision; each holder has a 20-second deadline.
Startup session restoration cannot overwrite a newer completed login/logout.
Browsers without Web Locks retain only the single-tab guard. No cross-origin or
all-browser concurrency guarantee is made.

OTP sign-in and email-change confirmation now reserve attempts and consume codes
with conditional MongoDB updates. Only a successful consumption proceeds to account
mutation/session issuance. The newest retained code is selected before checking its
state, preventing fallback to older retained codes after use/exhaustion. See
[TDR-0063](../tdr/0063-auth-concurrency.md) for the behavior and manual acceptance.

**Passed:** backend Ruff lint and format check (`app/ scripts/`, 211 files), strict
mypy (`196 source files`), workspace-scoping lint (`20 repository files`);
`pnpm turbo run lint typecheck build` (`12/12`, five cached). These checks include
the generated Google contracts, OAuth flow, atomic OTP and Web Locks changes.
A subsequent web-only lint/typecheck/build passed all three tasks for the startup
restore correction. Final web-only verification of the added refresh timeout also
passed all three tasks with no cache hits. `git diff --check` passed; the generated
TypeScript file only emits the repository's existing LF/CRLF conversion notice.

**Still open:** live Google/cookie acceptance, concurrent browser/database journeys,
all CR-A release acceptance groups, remaining CR-01 defects (including F01 verified
signup/linking, F03 upload registry, F09 browser isolation, F14/F15 credential/origin
lifecycle, F22 snapshot durability and F34 guest teardown/rejoin), and CR-02..06.
F02/F12/F13 have source repairs, not production closure. No test suites were written
or run per the Codex-specific repository instruction. No data migration, deployment,
purchase, commit or push was performed. Website launch modes are not switched.

## 2026-10-19: Google sign-in state protection — CR-01 follow-up (TDR-0062)

Implemented the F02 repair in source: a rate-limited backend start endpoint creates
the provider URL, random state, scoped HttpOnly browser cookie and ten-minute Redis
attempt. The callback requires state, verifies the cookie and atomically consumes
the attempt before provider exchange. Both login/signup buttons use this endpoint;
the callback handles denial and removes code/state from the visible URL. See
[TDR-0062](../tdr/0062-google-sign-in-state.md) for restart, concurrent-attempt and
cookie-policy behavior. Existing in-flight callbacks must restart after rollout.

**Verification:** the original command-runner interruption delayed export and
validation. That interruption is resolved: see the subsequent validation entry
above for regenerated Pydantic-owned contracts and passing static checks. No live
Google/provider/browser journey, migration or deployment has been run. F02 stays
open for live acceptance. CR-02..06 remain outstanding.

## 2026-10-19: Connected review implementation started — partial CR-01 (TDR-0061)

The user authorized implementation after reviewing the plan. This first slice
strengthens the existing shared review backend and member session handling; it
does not yet change how a website project launches. Scope and compatibility
decisions are in [TDR-0061](../tdr/0061-connected-review-access-foundation.md).

**Implemented, live acceptance pending:**
- F04: bind comment/reply request-ID replay to actor, page/parent, layer and payload,
  including duplicate insert races. Reject unsafe legacy/colliding IDs with 409;
  avoid repeating create side effects on successful duplicate recovery.
- F05: apply active link, expiry, archive, stored guest identity and member-binding
  checks to guest own-comment mutations. Reject hidden/deleted parents and nested replies.
- F06/F07: preserve/check member session family, authorize presence project, validate
  every outgoing socket delivery and recheck idle connections every 15 seconds.
- F08: server-side recipient/project filtering for realtime notifications; filter
  historical notification lists and unread counts by current project access.
- F10: restore workspace context before retrying after refresh; reject late refresh
  results after local session changes; reset the workspace-switch attempt on recovery.
- Partial F03: validate upload namespace on create/reply and before signing evidence,
  retaining legitimate legacy project screenshot keys. Suppressed screenshot URLs
  report failed capture. Upload-record/type/existence validation remains open.
- Partial F33: clear cached queries on token identity/role/workspace loss/change;
  reset cached data on live access changes and authorization-related socket closure.
  Member reconnect renews expired credentials and ignores obsolete socket callbacks.

**Verification:** the initial backend Ruff lint/format check passed (210 files).
The subsequent validation entry above records completed full backend/frontend
static checks, including the auth follow-ups.
No test suites were written or run, following the Codex-specific AGENTS.md instruction.
No browser/provider/database acceptance, migration, deployment, purchase or commit
has been performed. Pydantic/public API schemas are unchanged, so no generated
contract edit is required. Existing user audit/planning edits are preserved.

**Unfinished / next:** CR-01 remains open: F01/F02 identity verification/OAuth state,
F03 upload registry, F09 browser network isolation, F12-F15 identity lifecycle and
origin ownership, F22 snapshot durability and F34 guest expiry/rejoin. Durable event
delivery after a post-insert crash and guest whole-thread deletion policy remain
unresolved. Cache/access/refresh behavior needs live acceptance. Then implement
CR-02 installation/configuration and CR-03 safe launch/login-return exchange before
CR-04 panel parity, CR-05 reproduction and CR-06 MCP rollout. CR-A01..09 remain
unverified; no audit finding is declared production-closed by static checks.

## 2026-10-19: Connected website review product direction and plan (TDR-0060)

Saved the [product brief and conversation decisions](review-product-brief-2026-10-19.md)
and [implementation plan](connected-review-plan-2026-10-19.md). The accepted direction
prioritizes customer-controlled sites with an installed widget, no mandatory reviewer
extension, one consistent launch flow, shared widget/extension tickets, and Backline
as the central evidence and workflow portal. Live reproduction uses each person's
own website session; saved screenshots are not a live authenticated page.

The plan covers installation and readiness, scoped launch/authorization exchange,
login return, capture quality, draft/error recovery, thread parity, snapshots and
reanchoring, portal evidence, preview verification, MCP integration, additive
migration, rollout/rollback and capability boundaries. It records six implementation
slices (CR-01..06) and nine unverified acceptance groups (CR-A01..09). A browser/device
lab remains a later decision, not an approved provider purchase or existing feature.

**Open:** every implementation slice and live acceptance group. The 35 source-audit
findings remain open. Collect actual failing URLs/login methods and deployed settings
before claiming compatibility. No 99% success rate is established.

**Verification:** documentation-only changes; local Markdown link targets and
`git diff --check` checked in this turn. Application code, generated contracts,
dependencies and deployment state were not changed. Lint/typecheck/build were not
rerun for these documentation edits; the earlier audit's results remain historical.
No test suites, migrations, purchases, commits or deployments performed.

## 2026-10-19: Site compatibility and implementation gap audit (TDR-0059)

The user requested an audit before fixes, starting with reviewed-site login/signup
failures. The source-backed [audit report](site-gap-audit-2026-10-19.md) records
35 findings (11 P1, 22 P2, 2 P3) and 8 explicit capability limits against `main`
at `2daf5a7`. All findings remain open; no application behavior was changed.

Priority issues include unverified signup identities, missing Google OAuth state,
unchecked attachment object ownership, overbroad idempotency replays, guest mutations
after link revocation, WebSocket authorization lifetime, private notification
fanout, browser subresource SSRF, workspace context after refresh, and incomplete
snapshot persistence. Native review exists but does not establish universal login
compatibility; desktop extension configuration and mode parity remain limitations.

**Verification:** backend Ruff lint/format (209 formatted files), strict mypy
(194 source files), and workspace-scoping lint (20 repository files) passed.
`pnpm turbo run lint typecheck build` passed all 12 tasks without cache hits;
`git diff --check` passed. Locked local dependencies were installed without changing
manifests/lockfiles. No test suites, browser/provider/database integration checks,
migrations or deployments were run. Source-confirmed findings are not represented
as reproduced production exploits. See TDR-0059 for audit scope and the report's
acceptance mapping and repair order for unfinished work.

## 2026-10-02: Project cards show a screenshot of the site (TDR-0058)

The user asked for project cards to show each site's real hero section instead of the
same sketch on every card, and for the change to be pushed to `main`. The reasoning is
in TDR-0058.

**Built:**
- **Capture.**
  - The worker screenshots the top of each website project's site at 1280×800 in
    headless Chromium. It stores an 800 px JPEG privately under `previews/`.
  - Captures are queued when a project is created, when its URL changes, the first
    time the grid lists a project without one, weekly after that, and from the new
    "Refresh preview" menu item.
  - The SSRF guard checks the URL and every redirect hop.
- **API.**
  - `ProjectOut` gains `preview_url` (signed), `preview_status`,
    `preview_captured_at` and `preview_requested_at`.
  - New endpoint: `POST /projects/{id}/preview`.
  - Hard delete also removes the `previews/` prefix.
- **Cards.**
  - Each card shows the screenshot under its browser bar, in cards, compact and list
    layouts.
  - "Capturing preview…" shows while a capture is queued, and the grid polls until it
    lands.
  - Image and PDF projects, unreachable sites, and projects whose URL just changed
    keep the sketch.

**Verified:**
- `ruff check`, `ruff format --check` and `mypy app` are clean.
- Web `eslint`, `tsc -b` and `vite build` are clean. `packages/types` was regenerated
  from `openapi.json` and its typecheck is clean.
- Backend suite: 274 passed against local real MongoDB and Redis after rebasing onto
  `main` at 52f611b (PR #49).
- **Browser pass.** It ran on the real API and Arq worker against local MongoDB,
  Redis and moto S3, with 6 website projects and 1 PDF. All 10 checks passed:
  - each card showed "Capturing preview…" while queued;
  - five real screenshots arrived within 26 s, 4–16 s per capture, and each loaded
    from its signed URL at 800 px wide;
  - an unresolvable host failed at the guard and kept its sketch, and so did the PDF
    project;
  - "Refresh preview" returned 202 `queued` and kept the old picture until the new
    one landed;
  - there were no page errors in light or dark theme.
- **API checks.**
  - Changing Stripe's URL to linear.app hid the old picture at once. Linear's hero
    then arrived.
  - The replaced S3 objects were deleted: 5 objects for 5 ready projects.
  - Refreshing a PDF project returns 422.
  - `updated_at` was never changed by a capture.
## 2026-10-02: Member-bound canvas sessions (TDR-0057)

This closes TDR-0056's known limit: a viewer could copy the review link out of the canvas
and comment as a guest. Reasoning is in TDR-0057.

**Built:**
- **Canvas link.** Each project gets one system-managed canvas link, made on first use.
  It's never listed with client links and can't be revoked.
- **Canvas sessions.** `POST /projects/{id}/canvas-session` issues a guest token bound to
  the member, and the dashboard hands it to the widget. `POST /guest-sessions` refuses
  canvas links.
- **Live role checks.** Every guest-capable path checks a member-bound session against the
  member's current project role, and the realtime socket checks it on connect.
- **Client links** are listed to commenters and up (`share_link:view`). "Open review" is
  hidden for viewers.
- **Session sync and cloud login** target the canvas link.
- **Copied canvas links.** The review entry page and the widget explain that a canvas link
  only opens inside the dashboard.

**Verification:**
- **Backend.** 274 passed on local MongoDB and real Redis. Ruff, mypy (strict) and the
  scoping lint pass. `packages/types` was regenerated.
- **Scratch API checks.** 7 of 7 pass: the 5 TDR-0056 scenarios plus 2 new ones.
  - Canvas sessions: shared link, reused session, viewer read-only, commenter posts and
    replies, demotion and removal take effect at once, forged and copied tokens refused,
    the canvas link is unlisted and unrevokable, client guests unaffected.
  - Session sync lands on the canvas link.
- **`apps/web` and `apps/widget`.** Typecheck, lint and build pass.
- **Browser pass**, real API on local MongoDB and real Redis:
  - Canvas: 30 of 30. The canvas loads from the canvas link, not a client link. A viewer
    can't post through the API with their canvas session, and the copied token makes no
    guest session. The canvas URL opened alone asks for no name and explains why. The
    entry page explains a canvas link. An editor comments.
  - Live updates: a new pin reaches a viewer's open canvas live (~1.5s), and the access
    changes from TDR-0056 still pass.

**Open:**
- Canvas comments are still guest comments. Attributing them to the member is possible now
  that the session records the member, but isn't done.

## 2026-10-02: Project roles, org chart and room codes (TDR-0056)

Branch `feature/room-code-org-chart`, with `main` (TDR-0055) merged in. Reasoning is in
TDR-0056.

**Built:**
- **Project roles** (viewer, commenter, editor, manager) and private projects, enforced in:
  - every project, page, comment and share-link route;
  - tickets, search, activity, dashboard counts and client stats;
  - MCP, the email digest, notifications and realtime.
- **Team page** with four tabs:
  - People: filters and CSV export;
  - Org chart: pan and zoom, search and fly-to, project lens, drag to set reporting
    lines with Undo, collapse, minimap, full screen, keyboard navigation, dark mode;
  - Access: an editable role matrix;
  - Requests.
- Person drawer, profile dialog, leave workspace, transfer ownership.
- **Room codes:** generated or custom codes, a Join page with preview and `/join?code=`
  links, approval with a role, notes, withdraw, cooldown and seat limits.
- **Share dialogs** show who has access and let managers edit it. The create-project
  form gets an access step. Controls are gated by project role across the project menu,
  comment drawer, board and cards.

**Fixed from the branch:**
- membership ids being compared against user ids;
- members locked out of legacy projects;
- instant join bypassing the seat limit;
- members shown an invite form the API refuses;
- duplicate not copying the cross-browser render and Slack settings;
- N+1 queries when listing members and workspaces.

**Follow-up the same day:**
- **Viewer canvas.** The widget gains a `view` mode. Pins and their cards work, but no
  click or drag opens a composer.
  - For a project viewer the dashboard swaps Comment and Draw for "View comments". The
    dock's tools, the C and D shortcuts, `?mode=draw` and Browser review follow suit.
  - The canvas status menu now needs an editor on the project, not just any member,
    matching `comment:update_status`.
- **E2E login helper.** `loginViaOtp` predated TDR-0053's password-first login page. It
  now goes through "Forgot password?" and skips the set-password step, so every spec
  that signs in works again.
- **Stale backend tests.**
  - The four proxy tests mock the upstream at the transport and stub the DNS-resolving
    SSRF check.
  - The Jira rotation test uses `IntegrationContext`.
- **Project card favicons** are requested from the project's full origin. Before, a
  site on http or on a non-default port asked `https://host/` instead.

**Verification:**
- **Backend.**
  - On a real Redis (5.0, local): 269 passed, and the six pub/sub tests that only failed
    on fakeredis pass. The 5 remaining failures were the stale proxy and Jira tests;
    after fixing them, `test_proxy.py` passes 8/8 and `test_integrations.py` 25/25.
  - Ruff, mypy (strict) and the scoping lint pass.
- **Scratch checks.** 5 RBAC scenarios pass: access end to end, room codes, org chart
  with transfer and leave, the realtime filter, and MCP plus the digest.
- **`apps/web` and `apps/widget`.** Typecheck, lint and build pass.
- **E2E.** `workspace-join.spec.ts` passes against a live local stack: real API,
  MongoDB replica set, Vite and Playwright.
- **Migration.** `scripts/migrate_org_access.py` was run on seeded legacy rows:
  - the dry run wrote nothing;
  - `--apply` backfilled 2 events, normalized a room code and dropped
    `assigned_member_ids`;
  - it left a colliding pair of codes untouched and listed them;
  - a second run found nothing new.
- **Browser passes**, real API on local MongoDB and real Redis:
  - Team pages: 39 of 39, in light and dark.
  - Live access changes: a project appears and disappears on a member's open dashboard
    within ~350ms. After removal, their socket gets nothing about it while a member
    still on it does.
  - Review canvas: 21 of 21. A viewer sees pins and cards, gets no composer, Draw, status
    menu or Browser review, and can still browse. An editor comments and gets the status
    menu.

**Open:**
- Run `scripts/migrate_org_access.py` as a dry run, then `--apply`, on each environment.
- The canvas widget runs as a guest of the review link. Anyone holding that link, a
  viewer included, can open it outside the dashboard and comment as a guest, as any
  client can. Closed by TDR-0057 (member-bound canvas sessions, entry above).


## 2026-10-01: Dashboard sidebar groups, AI page and API keys (TDR-0055)

The user asked for `feature/dashboard-sidebar-updates` to be reviewed, fixed and
improved, then opened as a PR to `main`. The reasoning is in TDR-0055.

**Fixed:**
- **Rail.**
  - Members, AI usage, Billing, Settings and MCP server are reachable from the rail
    again, in new Tools and Workspace groups.
  - Only the current link has `aria-current="page"`. Before, all ticket views were
    marked, and "Projects" was marked on every page.
  - Groups remember whether they are open and open when you land on one of their
    pages. Collapsed links leave the tab order.
  - Toggles have `aria-controls`, and their chevrons point the right way.
- **AI page.**
  - Shows real credits, plan and reset date, and this month's count per feature.
  - Says whether AI is ready, paused or not connected.
  - The server `GROQ_MODEL` detail is gone.
  - The "where to find it" copy matches the real buttons.
- **API keys page.**
  - Lists API keys and MCP tokens together and revokes either kind.
  - No longer claims that API keys authenticate MCP.
  - Shows a copyable `curl` check.
  - Uses the shared classes, with no inline styles.
- **Icons.** The Integrations, Extensions, AI and Key icons are redrawn.
- **Tickets.** An unknown `?status=` no longer renders a blank filter chip with no React
  key.
- **Tests.** `journey-9` visits `/extensions`.

**Verification:**
- **`apps/web`.** `pnpm typecheck`, `pnpm lint` and `pnpm build` pass.
- **e2e specs.** `navigation-titles-routes.spec.ts` and `journey-9` compile and list
  under `playwright test --list`. They were not run: there is no local MongoDB or
  Redis.
- **Browser pass.** The real FastAPI app ran on mongomock/fakeredis with Vite and
  Playwright at 1440×1000 (light and dark) and 390×844. 39 of 40 checks passed. The
  40th, the desktop console check, flagged only the `ERR_ABORTED` noted under Console
  below. The checks covered:
  - one `aria-current` on each of 11 routes;
  - Tools collapses, stays collapsed after a reload and reopens on `/keys`;
  - `/extension` redirects to `/extensions`;
  - the AI chip, meter and three feature cards render, with no `GROQ_MODEL`;
  - an API key can be created, copied, used as a Bearer token on `whoami` (200) and
    revoked (then 401);
  - an MCP token made on `/mcp` is listed and revoked;
  - no horizontal overflow on a phone, and the drawer closes after navigating.
- **Console.** No errors apart from two known messages:
  - React Router's v7 future-flag warnings, which appear in dev only;
  - Chromium's `ERR_ABORTED` on 204 DELETE responses, which the unchanged Browser
    Extension page also shows.

## 2026-09-30: Page-by-page fix sweep (TDR-0053)

The user asked for the rest of the code to be fixed page by page, across UI, backend
and database, on the billing branch. The backend suite ran on a real MongoDB 7.0
replica set for the first time, from a scratch directory, so the repo's `.env` with its
live keys was never loaded. Reasoning is in TDR-0053.

**Fixed:**
- **Accounts.**
  - Sign-in emails are case-insensitive, so an invite with capitals no longer splits
    into a second account at Google or code sign-in.
  - "Set a password" needs a code sign-in from the last 15 minutes.
  - `/login` with a live session opens the app.
- **Plan limits.** The seeded "Example Project" no longer takes one of Free's two
  project slots.
- **AI Usage** is real: this month's credits against the plan, and breakdowns by
  feature, member, day and month (new `GET .../billing/ai-usage`). AI actions that hit
  the limit now say so.
- **Access.**
  - A changed or removed role reopens the workspace or routes to the picker, instead
    of failing every request.
  - ClickUp, Jira and Asana OAuth connect again: the callback waits for the session and
    switches workspace first, and all refreshes share one request.
  - Guest passcodes allow 25 wrong tries per link per 15 minutes.
- **Links and pages.**
  - Search, asset review and dashboard ticket links open the ticket.
  - Stale ticket page offsets clamp to the last page.
  - Blank workspace, comment, token and label names are rejected.
  - The filter boxes don't flood browser history.
  - Clients export moved to the header, and its archived toggle is in the URL.
  - Activity rows show their dates.
  - Settings is read-only for members, without the fake upload text.
  - Members, extension-token and MCP errors are shown, and revoking a token asks first.
  - CSV formula guards cover a leading tab or carriage return.

**Database:** additive fields `refresh_tokens.auth_method/authenticated_at`,
`projects.is_sample` and `ai_usage.user_id`. There are no new indexes. Two dry-run-first
scripts come with it:
- `migrate_lowercase_user_emails.py` reports case-only duplicates and never merges them;
- `migrate_mark_sample_projects.py`.

**Verification:**
- Backend `ruff`, format, `mypy` (205 files) and the scoping check pass.
- Backend suite: 270 passed, 11 failed. All 11 predate this work:
  - 6 are pub/sub tests the fake Redis can't deliver;
  - 5 are stale proxy and Jira tests (see TDR-0053).
- Scratch checks covered the auth, limit, usage and passcode changes, and both
  migrations.
- `pnpm turbo run lint typecheck build --force`: 12/12.

**Not verified:** a browser pass of the new AI Usage page, and live OAuth apps.

**Open:**
- Whether to enforce the pricing table's integration, cloud-login and MCP rows.
- Updating the 5 stale tests.

## 2026-09-30: Billing plans, Stripe, Razorpay/UPI and plan limits (TDR-0052)

The user asked for the billing branch's first cut to be verified against
`docs/BILLING_BRANCH_OVERVIEW.md`, then fixed, optimized and pushed. That first cut was
filed as TDR-0048; `main` has since used both 0048 and 0051, so this is TDR-0052.
`main` was merged in first, and again after PR #45 (route titles), whose
`[workspace, "Billing"]` page-title convention the billing page now follows. The
reasoning is in TDR-0052.

**Fixed:**
- **Free upgrades.**
  - Webhooks now check their Stripe/Razorpay signatures; Stripe's also has a 5-minute
    replay window.
  - Confirming a payment now activates only what a server-side checkout record says.
    Stripe sessions are re-read from Stripe, and Razorpay signatures are checked.
  - The sandbox is refused in production.
- **One payment, one invoice.** Activation is exactly-once across the browser confirm
  and webhooks. Invoice numbers come from a service-wide counter, so they no longer
  collide across workspaces.
- **Real gateway flows.** Razorpay Checkout (UPI QR/ID, RuPay, netbanking) and Stripe's
  return confirm both work. The fake card and UPI inputs, fake card digits and fake
  storage figure are gone.
- **Expiry.** Paid plans are prepaid and lapse to Free when their period ends.
  Renewing the same plan extends it.
- **Limits.**
  - Plans now match the spec.
  - AI credits are metered (one per Groq call, reset monthly) and enforced.
  - Restoring an archived project counts against the project limit.
  - A refused invite no longer creates a user.
  - Upgrade prompts key off `PLAN_LIMIT_EXCEEDED`, not the word "limit".
- **UI.**
  - The billing page, checkout, banner, comparison table and invoices were rebuilt on
    the app's own classes and tokens, so light/dark and phone width work.
  - The table's `<div>` inside `<tbody>` is gone.
  - Only owners see plan actions.
  - Features the product doesn't have yet are marked "Coming soon".

**Verification:**
- `ruff`, `ruff format --check`, `mypy` (201 files) and the workspace-scoping check pass.
- `pytest tests/test_billing.py tests/test_permissions.py`: 11 passed.
- Scratch backend pass on mongomock/fakeredis: 41/41 checks. It runs the transaction
  callback directly, because mongomock has no sessions.
- Headless browser pass in light, dark and at 390px: test-mode upgrade, invoice,
  deep link and URL filters. No console errors beyond React Router's existing notice.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

**Not verified:**
- Live Stripe/Razorpay keys.
- The rewritten billing e2e specs; they need the full stack.

**Open:**
- Taxes and receipt legal details are undecided.
- The comparison table's integration, cloud-login and MCP rows aren't enforced.

## 2026-09-30: Contextual page titles and project sub-route navigation (TDR-0051)

The user asked for the first commit on `feature/standardize-routes-titles-navigation`
to be verified against the requested changes, fixed and optimized. That commit's
`BRANCH_CHANGELOG.md` lists the requested changes. `origin/main` was merged in first
(6 commits, no conflicts). Reasoning is in TDR-0051.

**Delivered:**
- **Browser tab titles.**
  - Workspace pages read `{workspace} · {page} — Backline`.
  - Project pages read `{project} · Review`, `· Board` or `· Share Links`.
  - The guest review reads `{project} · Review`.
  - Sign-in, the sign-in and OAuth callbacks, and the 404 page have their own titles.
  - The canvas, board, guest review, 404 and callbacks had no title before.
- **Navigation between a project's pages.**
  - The board has a "← Back to {project}" link.
  - The share-links back link names the project.
  - The project ⋯ menu has "Manage share links" and "Ticket board".
  - The canvas Details tab has "Open board →" and "Share links →".

**Fixed in review of the first commit:**
- **TDR number.** The TDR was 0048, which `main` already uses, so it is now 0051. 0050
  is the open illustrations branch's number.
- **Sign-in title.** It read "Sign in to Backline — Backline" and now reads
  "Sign in — Backline".
- **Project query.** The same project query was declared in three pages. It is now one
  `useProject` hook.
- **Inline styles.** The board back link and the Details-tab links used inline styles.
  They now use a shared `.bl-back-link` class and Tailwind utilities.
- **Long project names.** The back link now ends a long name in an ellipsis. Before, it
  could widen the page on a phone.
- **Board header props.** The props are required; their optional-prop guard was dead.
- **Menu order.** "Manage share links" moved beside "Copy review link".

**Changed files:**
- `apps/web/src/lib/use-document-title.ts` and 19 of the 20 page components that call it
  (the workspace picker is unchanged).
- `features/projects/use-project.ts` (new).
- `features/board/components/BoardHeader.tsx`, `features/projects/ProjectMenu.tsx` and
  `features/projects/panel/DetailsTab.tsx`.
- `styles/backline.css`: one rule, `.bl-back-link`.
- No backend, contract or route change.

**Verification:**
- `pnpm turbo run lint typecheck build --force`: 12/12 passed with zero lint warnings.
- The existing `apps/e2e/tests/navigation-titles-routes.spec.ts` typechecks under
  `tsc --strict`, and `playwright test --list` lists its test.

**Not verified:** the Playwright suite was not run (no local MongoDB/Redis), nor was a
browser pass or a deployed stack checked. No test suite was written, per this
repository's Claude Code instruction.

**Resynced with `main` for a manual merge (same day).** GitHub reported the branch
could not merge automatically after PRs #43 and #44 (TDR-0050, illustrations) landed.
`origin/main` was merged in again, and three conflicts were resolved:
- `NotFoundPage.tsx` keeps both the `LostPinArt` import and the title import.
- `UsagePage.tsx` keeps `UsageChartArt` and the title and workspace imports. `ChartIcon`
  is dropped because `main` had replaced it.
- This ledger keeps both entries, newest first.

Lint, typecheck and build were re-run on the merged result.

**Open:** `BRANCH_CHANGELOG.md` sits at the repo root. This ledger and TDR-0051 record
the same changes, so it can be dropped before merging to `main`.

## 2026-09-29: Illustrations and interaction audit (TDR-0050)

The user asked for the pending findings from TDR-0049 to be finished. They had also
originally asked for custom SVG artwork and animation. The work is on a new branch from
`main` (PR #42 had merged). Reasoning is in TDR-0050.

**Delivered:**
- **Project card artwork** (`ProjectArtwork.tsx`):
  - a schematic page in three layouts, with the site's favicon in its header;
  - real pins, one per open comment (up to three, then "+N"), or a check when all are
    closed;
  - pins drop in on load and lift and pulse on hover;
  - dark-mode palettes, so there is no white slab;
  - the label reads just "Website", "Images" or "PDF".
- **Illustrations** (`components/illustrations.tsx`):
  - eight empty-state scenes (tickets, clients, projects, activity, members, share
    links, guest board, and "no matches");
  - a 404 lost-pin scene, a growing chart for AI Usage, an invoice with a "SOON" stamp
    for Billing, and a pinging brand mark for the loading screen.
  - Colors are theme tokens only, and every animation settles to a complete still frame
    under reduced motion.
- **In-page loaders.** Seven pages used the full-viewport loader inside their content;
  they now use `LoadingScreen inline`.
- **Tickets empty state:**
  - the message depends on whether filters are on, a tab is empty, or there are no
    tickets at all;
  - "Show all tickets" on an empty tab used to do nothing, and now switches to
    Everyone.
- **Activity:**
  - rows read as sentences with the object named, and the ticket's `#N` plus its first
    line;
  - "Open comment" when the row links to a thread.
  - Backend: additive `ticket_number` and `comment_excerpt` on `ActivityOut`, from one
    workspace-scoped bulk read (`CommentRepository.find_many_in_workspace`). OpenAPI and
    `packages/types` were regenerated.
- **Interaction fixes:**
  - The New ticket and Account dialog intros were half hidden under the sticky header.
  - Ticket detail priority showed raw values ("high").
  - The search box had a double focus ring.
  - Team-ticket search results said "Project tickets"; they now say "Team ticket"
    (backend).
  - "Mark all read" showed with nothing unread.
  - In the mobile drawer, the close button covered the workspace chevron.
- **Canvas shortcuts.** "?" opens the shortcuts list, and arrow keys show as ← →.
- **Follow-up fixes (same day, user-requested):**
  - **Activity links.** A link into an archived project now goes to the Archived list
    ("Project archived →"), since archived projects can't be opened. A deleted project
    shows "Project deleted" with no link.
  - **Search ignores the hidden "Project tickets" page title.** Global search and the
    Tickets search no longer match it, via one shared `page_title_match` in
    `dashboard/repository.py`. Harness check: "tickets" went from every team ticket to
    0 results, while "Hero" and "Acme" still match. Backend `ruff`, `mypy` and the
    scoping check passed, as did web `tsc` and `eslint`.

**Verification:**
- `pnpm turbo run lint typecheck build --force`: 12/12 passed with zero lint warnings,
  production builds included.
- Backend: `ruff check .`, `ruff format --check .` (233 files), strict
  `mypy app/ scripts/` (193 files) and `scripts/check_workspace_scoping.py` passed.
- OpenAPI re-exported; the `packages/types` diff is additive only (two optional fields).
- Scratch browser pass: the real API on `mongomock-motor` and `fakeredis`, with a
  `$toObjectId` shim added for global search.
  - Every illustration was captured in light and dark after animations settled, as was
    the loading screen mid-load.
  - 16 dialogs, popovers and drawers were opened in both themes.
  - Activity, search, bell and drawer were re-checked after the fixes.
  - No console errors other than unresolvable demo hosts and the canvas preview frame.

**Not verified:** the pytest suite and Playwright journeys (no local MongoDB/Redis). No
test suite was written, per this repository's Claude Code instruction.

## 2026-09-29: Whole-app polish pass (TDR-0049)

The user asked for open-ended improvement of the app and for bugs across the site to be
found and fixed. Every workspace route was rendered in headless Chromium against the
real API on in-memory fakes, at desktop and phone widths, in both themes. Each finding
was traced to source. The branch was first fast-forwarded to `origin/main` (15 commits,
no conflicts). Reasoning is in TDR-0049.

**Fixed:**
- **Canvas opened on a hidden page.** The project canvas could open on the hidden
  "Project tickets" page and show "outside the project URL". That page is no longer
  listed as a site page, whether on the canvas, in page management or in the New Ticket
  picker. It can't be renamed, and reorder ignores it.
- **Errors.**
  - Client errors (4xx) are no longer retried, so they appear immediately instead of
    after about 3s of "Loading…".
  - FastAPI validation errors and HTTP/2 responses with no status text now produce
    readable messages instead of "Unprocessable Entity" or a blank one.
  - Network failures read as such instead of "Failed to fetch".
- **Stale Tickets links.** Unknown values in the Tickets URL are ignored instead of
  failing the list with a 422.
- **Settings-style cards.** Settings, Billing, Share links and Extension lost the ~200px
  empty header band and are two-column again. AI Usage's placeholder, which was
  scattered across three columns, is a single centered column.
- **Every page.** The stray focus ring (a green line under the content) and the
  top-left shadow smudge are gone.
- **Phones.**
  - The Tickets table scrolls inside itself instead of scrolling the page sideways.
  - Ticket rows use two lines.
  - Filter tabs scroll sideways instead of wrapping.
  - The "New project" button shows its icon.
  - Row delete buttons show on touch screens.
- **Avatars.** Initials inside settings cards are legible again.
- **Clients.**
  - Names are left-aligned.
  - "New project" opens the project form with the client preselected (it was a
    "not wired up" toast).

**Changed files:**
- `backend/app/modules/pages/service.py` (no schema, index or contract change);
- `apps/web/src/lib/api-client.ts`, `app/providers.tsx`;
- `features/tickets/{use-tickets.ts,TicketsPage.tsx,components/TicketTable.tsx}`;
- `features/clients/ClientsPage.tsx`, `features/projects/ProjectForm.tsx`,
  `features/workspaces/UsagePage.tsx`;
- `styles/backline.css` (a labelled block at the end, plus five in-place fixes).

**Verification:**
- `pnpm turbo run lint typecheck build --force`: 12/12 passed with zero lint warnings.
- Backend: `ruff check .`, `ruff format --check .` (233 files), strict
  `mypy app/ scripts/` (193 files) and `scripts/check_workspace_scoping.py` passed.
- Scratch browser pass (not checked in):
  - Setup: the real app on `mongomock-motor` and `fakeredis`, with shims for mongomock's
    `$not`-array and `$lookup`-with-`let` gaps, seeded with 4 members, 4 projects (one
    archived), 14 tickets, 2 clients and a share link.
  - Coverage: 20 routes × 2 widths × 2 themes, 80 captures.
  - Horizontal overflow: none after the fixes. It had been on the mobile Tickets table.
  - Console errors: none other than unresolvable demo hosts and the canvas frame, whose
    preview domain doesn't resolve locally.
  - Tickets with `?view=board&status=bogus`: the full list of 14 tickets with
    "Everyone" selected and no error.
  - Settings avatar initial computed as white.
  - Clients → "New project" reached the details step with "Globex" preselected.

**Not verified:** the pytest suite and Playwright journeys (no local MongoDB/Redis), and
a deployed stack. No test suite was written, per this repository's Claude Code
instruction.

**Open:**
- Project card previews stay light in dark mode and carry a "website · illustration"
  label, which needs a design pass.
- Custom illustrations for empty and "coming soon" states were not started.

## 2026-09-29: Seamless commenting on the review canvas (TDR-0047)

The user asked for the project editor page, where comments are placed, to work
seamlessly, with every comment and UI problem on it fixed. The page was audited by
reading the source and by driving it in headless Chromium against a stateful mock of
the API, proxy and realtime socket (scratch harness, not checked in). Full list and
reasoning are in TDR-0047. Delivered:

**Canvas ↔ drawer**
- Showing a comment from the drawer (or from BugHunt AI) switches the canvas to the page
  the comment is on, then shows its pin.
- A card left open for a different comment closes.
- The status line gives the `#` reference and the real outcome: found, no pin on this
  page, element changed, or team-only.
- Clicking a pin opens that comment's detail in the drawer.
- Comments posted in the canvas refresh the list even without the websocket.
- URL updates on the page compose. React-router's functional `setSearchParams` was
  dropping one of two updates made in the same click (new
  `lib/use-search-params-updater.ts`).

**Widget**
- Live comments and replies from other people: pins, and replies added to an open card.
- Threads made team-only leave the client view live; threads made client-visible
  appear.
- An unfinished comment is no longer discarded by a stray click (the composer is
  nudged instead). Escape discards an empty composer, and a written one on the second
  press.
- Uploads: posting waits for them, a file removed mid-upload is dropped, and a failed
  or oversized file gets a message.
- Region comments:
  - anchored to the element containing the whole drawn box;
  - outline follows the element and is hidden in Browse mode;
  - pin restored at the region corner after reload;
  - a freshly drawn region's pin no longer hides itself.
- Closed comments get dimmer pins, and the open comment's pin is highlighted.
- Avatar initials ignore punctuation.
- Cards, the tooltip and toasts keep clear of the dashboard dock.

**Drawer**
- Optimistic field edits: quick successive tag/assignee toggles no longer undo each
  other.
- Replies on team-only threads are team-only.
- A layer toggle, behind a confirmation.
- Delete asks for confirmation and reports errors.
- Keyboard Enter/Space on a row's own buttons works.
- Real compact mode, a "Clear filters" action, and "Reopen" for any closed status.
- Errors reset per comment, and the thread scrolls to a new reply.
- Escape no longer closes the drawer (losing the draft) while typing, in a menu,
  dialog or date picker.
- Due labels read dates in UTC, matching the printed date.

**Layout**
- No sideways page shift (`overflow: clip`), and no clipped footer control.
- The footer stays on screen at 1024×700.
- Footer menus open above the dock, and the dock is legible in dark theme.
- The thread gets more room on laptop-height screens.
- Draw is in the header mode switch.

**Backend** (no schema, index or contract change)
- `create_reply` keeps replies on team-only threads team-only, so they are never
  broadcast to guests.
- `toggle_layer` sends guests `comment.deleted` when a thread becomes team-only.
- `list_for_guest_session` drops client replies on threads that aren't
  client-visible.

Verification:
- `pnpm turbo run lint typecheck build --force` passed 12/12 with no warnings.
- Backend `ruff check` and `ruff format --check` passed on `modules/comments`, strict
  `mypy app/` passed (182 files), and `scripts/check_workspace_scoping.py` passed.
- Scratch backend harness (`mongomock-motor`, realtime publishing captured), 12/12:
  - guest listing hides a hidden thread's replies, including with `since`;
  - a member reply on a team thread is forced team-only and not sent to the guest
    channel;
  - a client-thread reply is;
  - client→team sends guests only `comment.deleted`, and members `comment.updated`;
  - team→client sends guests `comment.updated`;
  - guest replies stay client.
- Scratch browser harness, 23/23 checks plus the scenarios above, with screenshots at
  1440/1366/1280/1100/1024 widths in light and dark themes.
- Existing tests in `tests/test_comments.py` encode behaviour this change keeps: a team
  reply on a client thread stays team, and guests never receive team content.

Not verified: the pytest suite and the `apps/e2e` Playwright journeys (no local
MongoDB/Redis), and a real proxied site through a deployed stack. No test suite was
written, per this repository's Claude Code instruction.

## 2026-09-29: Every integration and MCP client works without operator setup (TDR-0046)

The user asked for all integrations and MCPs to be set up and working, with anything
needing their input skipped.

**Integrations.** Eleven providers, every one connectable from the Integrations page with
a pasted token or webhook URL, so no OAuth app registration is needed:

- Notify: Slack, Discord, Microsoft Teams, and a signed webhook (Zapier, Make, n8n, custom).
- File tickets: Jira, Linear, GitHub, GitLab, Asana, ClickUp, Trello.
- ClickUp, Jira and Asana gained token modes. OAuth remains, offered only when the
  operator configures it (`GET /integrations/oauth-apps`, authorize URLs built
  server-side).
- New providers: Discord, Teams, webhook, GitHub, GitLab, Linear.

Around the connections:

- Trackers pick their list, project, repo or team from what the credential can reach
  (`GET /integrations/{id}/destinations`, `PATCH /integrations/{id}`), including a valid
  Jira issue type.
- One unified send, `POST /comments/{id}/integrations/{integration_id}/send`, recorded
  once per comment and connection in the new `integration_links` collection.
- The comment drawer has "Send to tracker" and a "FILED IN" row.
- Admins get "Send test"/"Check" and editable notification toggles. Members can see what's
  connected.

**MCP.** Seven tools (`list_projects`, `list_tickets`, `get_ticket`,
`generate_implementation_prompt`, `reply_to_ticket`, `update_ticket`,
`send_ticket_to_tracker`) and a `fix_ticket` prompt.

- Tokens are read-only or read & write.
- The owner's membership and role are re-checked on every request.
- Tool calls are rate-limited per token.
- The MCP page gives copy-paste setup (and install links where they exist) for Claude
  Code, Cursor, Codex, Antigravity, VS Code, Claude Desktop, Windsurf and Gemini CLI.

**Fixed along the way:**

- Bare `/mcp`, the URL the MCP page handed out, fell through to the proxy's catch-all
  instead of the MCP app.
- Tracker backlinks pointed at the removed `/p/{project}/board` route.
- Slack posts didn't escape `<!channel>`-style sequences in client-written comments.
- A blank `INTEGRATIONS_ENCRYPTION_KEY` in `.env` broke every credential-storing connect
  locally.
- A project's mute now covers every notifier, not only Slack.
- A provider answering with something unreadable (an HTML error page, an empty body)
  returned a raw 500 with no CORS headers, so the browser showed only "Failed to fetch".
  It is now a 502 that names the provider, and a failed send releases its claim.
- A checked `.bl-switch` was white-on-white in dark mode.
- In `pnpm dev`, every page reload signed you out. StrictMode ran AuthProvider's restore
  effect twice, and the second concurrent `/auth/refresh` tripped the server's
  refresh-token reuse detection, which revokes the session. `refreshSession` now shares
  one in-flight request. Production builds were unaffected.

**Contracts.** `packages/types` regenerated (`scripts/export_openapi.py`, then
`pnpm generate:local`). All changes are additive; legacy integration documents and the
four per-provider create endpoints keep working. `VITE_*_OAUTH_CLIENT_ID` is no longer
read. `.env.example`, `.env.production.example` and `DEPLOYMENT.md` were updated.

**Verification.**

- `pnpm turbo run lint typecheck build --force`: 12/12 tasks passed with zero lint
  warnings.
- Backend: `ruff check`, `ruff format --check` (233 files), strict `mypy app/ scripts/`
  (193 files) and `scripts/check_workspace_scoping.py` passed.
- Two scratch harnesses (not checked in) used in-memory `mongomock-motor` and `fakeredis`
  in place of the `.env` services. mongomock lacks `$convert` and `$indexOfArray`, so the
  harness shims only the object-id and array-index forms the dashboard pipelines use.
- **MCP, 42/42.** A real uvicorn server was driven by the official MCP SDK client over
  Streamable HTTP. It covered:
  - `/mcp` and `/mcp/` both working with no redirect;
  - 401 for a missing, bad or revoked token, and for an owner downgraded to a role
    without team access;
  - every tool and the prompt;
  - `#N`, ID, reply-ID and link ticket references;
  - no access to another workspace's ticket;
  - read-only tokens refused on writes, and legacy tokens read-only;
  - replies stored as the owner on the team layer;
  - the per-token rate limit.
- **Integrations, 83/83.** Every provider was exercised against respx-mocked provider APIs.
  It covered:
  - connect, check, destinations, send, and dedupe (including three concurrent sends
    filing one card, and a failed send releasing its claim);
  - schema SSRF rejections, plus refusal of a public hostname that resolves to 127.0.0.1;
  - that screenshot fetches never carry tracker tokens;
  - Jira's refresh-token rotation, now persisted;
  - Slack escaping, the Discord mention guard and Teams card shape;
  - webhook signature verification;
  - the team-only and per-project mute gates;
  - retry at 5s, then dead-letter plus notification;
  - the "project updated" fan-out;
  - route permissions (members list and send, but can't connect or browse destinations);
  - unreadable provider responses becoming readable 502s.
- **Browser pass.** A throwaway API ran on the same fakes, with its own Vite on a spare
  port, driven by headless Chromium. It covered:
  - the Integrations page (light, dark, and 390px wide with no horizontal overflow);
  - choosing a Trello list, Slack settings, and the Jira token form with its error path;
  - the MCP page: creating a token, the Cursor config with the token embedded, the install
    link, and the Codex tab;
  - "Send to tracker" in the project's comment drawer filing to Linear, and the resulting
    "FILED IN" chip.
  The only console error was the expected 422 from the deliberately bad Jira token.
- `tests/test_integrations.py` and `tests/test_mcp.py` had their call sites updated to the
  new signatures (no new tests). The eight that need no database pass. The rest need
  MongoDB/Redis, and were not run because the conftest `db` fixture wipes whatever
  `MONGO_URI` points at.

Not verified: live calls to real Slack, Discord, Teams, Jira, Linear, GitHub, GitLab,
Asana, ClickUp or Trello accounts; real OAuth consent screens; each agent client's own
config parser against the published snippets.

## 2026-09-29: Pending-issues sweep (TDR-0045)

Every "pending" list in the repository was rechecked against current source: the
2026-09-09 master-audit rows, the 2026-09-13 production-readiness plan, and the follow-ups
at the end of recent entries below. Most older items are already delivered (calendar
`Today`, ticket drag-and-drop, Jira/Asana, the MCP server, placeholder-page treatment,
per-project Slack opt-out, the Slack "project updated" event). Still live, and fixed:

- **Extension composer never closed after posting.** `content-script.ts`'s submit callback
  returned nothing where `openComposer` expects `true`/`false` (the extension typecheck
  failure first noted in TDR-0041's entry). It now returns the result like the widget's,
  and its pins show ticket numbers too.
- **Canvas hotkeys reverted the URL.** The hotkey listener in `ProjectOverviewPage.tsx`
  held stale `setMode`/`goToPage`, which rebuild the URL from the `searchParams` of the
  render that created them. After changing zoom, viewport or stage width, pressing C/D/V
  or an arrow key restored the old values. The listener now calls them through a ref.
- **Web lint at zero warnings:** besides the above, shortcut data moved to
  `features/projects/shortcuts.ts` and the browser list to `footer/browsers.tsx`, so their
  component modules export only components (React Fast Refresh).
- **Backend formatting:** `ruff format` applied to the 10 files that failed the check
  (whitespace only).
- **Entry bundle 1,218.77 kB → 400.65 kB** (357.66 → 127.44 kB gzip): every page route in
  `app/router.tsx` now loads lazily via react-router's `lazy`, with `LoadingScreen` as the
  first-load fallback. pdf.js ships only in the canvas/asset-review chunk. The build no
  longer prints the >500 kB chunk advisory.
- **`?blBrowser=` duplicate pages (TDR-0035 follow-up):** new dry-run-first
  `backend/scripts/migrate_canvas_param_pages.py`. It merges pages registered with the
  canvas's `blBrowser`/`blMode` parameters into the page the same URL registers as today,
  one transaction per duplicate, with a reference re-check before each delete. Duplicates
  with an asset or a colliding browser render are skipped and reported. **Not run against
  any database**; run it without `--apply` first.
- **Stale copy:** `UsagePage` no longer claims there is no AI provider; the widget's
  UX-AUD-027 "still pending" comment now describes the retry the composer already does.

Deliberately not done (reasoning in TDR-0045): the `webhook_events`/`webhook_deliveries`
tables (Slack retries already exist in `workers/integrations.py`), and repairing
`tests/test_proxy.py` (its fake predates the SSRF guard, shared transport and preview
origins; it can't run here, and no test suites are written under Claude Code).

Verification: `pnpm turbo run lint typecheck build --force` passed 12/12 with no warnings
(extension typecheck included, for the first time since TDR-0041). Backend `ruff check .`,
`ruff format --check .` (226 files), strict `mypy app/ scripts/` (186 files) and
`scripts/check_workspace_scoping.py` (19 repository files) passed. The merge script ran in
a scratch harness (not checked in) against `mongomock-motor`, with transactions faked,
covering:

- a dry run that wrote nothing;
- an apply that matched the dry run's plan;
- a canonical page absorbing two duplicates, with exactly one current revision left;
- a missing canonical page, where the oldest duplicate was renamed, adopted the other's
  current revision and got `latest_revision_id` set;
- render-conflict and asset duplicates skipped untouched;
- an unrelated `?page=2` page ignored;
- a re-run that was a no-op;
- the workspace filter.

Not verified: real MongoDB transactions, a browser session against a running stack (lazy
route loading, the hotkey fix, the extension composer), and the pytest suite (no local
MongoDB/Redis/Docker on this machine).

## 2026-09-27: SSO sign-in clicks escape the canvas into a real tab (TDR-0044)

Clicking "Sign in with Google" (or Microsoft/Apple/Facebook/GitHub/Okta/Auth0/Yahoo)
inside the canvas failed silently - the identity provider refuses to render its own
sign-in page in any iframe, browser-enforced, same restriction TDR-0040/0042 already
document as unfixable by proxying. Added to `modules/proxy/interceptor.py` (injected into
every proxied page, same file TDR-0035/0040 already extend): a capturing `click` listener
that opens a matching `<a href>`'s target in a real `window.open()` tab instead of
navigating the canvas to it, and a capturing `submit` listener that does the same for a
matching `<form>` by cloning its fields into a form built inside the new tab (needed for
POST forms, where a static URL can't carry the body). Host matching is an explicit
allowlist, exact-suffix only (a lookalike like `accounts.google.com.evil.com` does not
match). This only redirects where the browser navigates - it does not read, store, or
transmit anything from the resulting sign-in; carrying that session into the canvas
afterward is still the existing extension Sync action (TDR-0041).

Verification: backend `ruff check`/`format --check`/`mypy` (strict, 175 files) and
`tests/test_proxy_rewriter.py` (10/10) clean. Extracted the real generated interceptor
script via `build_interceptor_script()` and syntax-checked it with `node --check`. Ran it
in a Node VM harness against a fake DOM: a Google OAuth link click is prevented and opens
a new tab; a same-site link click is left untouched; a link already carrying
`target="_blank"` is left for the browser; a Microsoft OAuth POST form submit is
prevented and its fields are cloned into a form submitted inside the new tab; a normal
form submit is left untouched; a lookalike domain (`accounts.google.com.evil.com`) does
not match; `github.com` matches but `githubusercontent.com` does not. Not verified: a
real browser session against a live identity provider (would need the deployed stack and
a real "Sign in with X" button to click). No test suite added, per this repo's Claude
Code instruction.

## 2026-09-27: BugHunt AI becomes a real project-wide analysis (TDR-0043)

- `AiTab.tsx` ("BugHunt AI") was an honest "Coming soon" placeholder since TDR-0033
  deliberately deferred it (its only reference, `backline-final-draft.html`, ties it to
  a fake AI-credits/paywall system AGENTS.md forbids). The user provisioned 5 real Groq
  keys and asked to build it for real, scoped to exactly the checklist the panel
  already advertised (read every open comment, prioritize by severity, summarize
  progress), explicitly excluding any change to the two existing comment-thread AI
  actions ("except the comments"), plus one recommended addition: duplicate-thread
  flagging. Full decision record: docs/tdr/0043-bughunt-ai-project-analysis.md.
- Backend: `backend/app/modules/ai/schemas.py` gained `Severity`/`BugHuntFinding`/
  `DuplicatePair`/`ProjectAnalysisResult`; `service.py` gained `analyze_project()`
  (resolves project → pages → open top-level comments the same way
  `comments/service.py`'s `list_comments_for_project` already does, caps at the 40
  newest, calls Groq in JSON mode via a new optional `json_mode` param on the shared
  `_complete()` helper - the two existing callers pass nothing and are byte-for-byte
  unchanged); `router.py` gained `POST .../projects/{project_id}/ai/analyze` gated by
  the existing `comment:update_status` permission (same bar as manually setting
  priority, since this writes that same field). No schema/migration was needed for
  severity - it writes straight into the comment's pre-existing `priority` field.
  Any `comment_id` the model returns that wasn't in the candidate set sent to it is
  dropped before it can be written or returned; a non-JSON model response degrades to
  a summary-only result instead of a 500.
- Contracts regenerated: `uv run python scripts/export_openapi.py` then (from
  `packages/types/`) `pnpm generate:local`; `pnpm typecheck` clean.
- Frontend: `AiTab.tsx` rewritten from a static placeholder into a real panel (plain
  `async`-handler + `useState`, matching `CommentThreadPanel.tsx`'s existing
  Summarize/Suggest Replies pattern rather than `useMutation`); reuses the existing
  `aiErrorMessage()` busy-state helper untouched. `ProjectSidePanel.tsx` now passes
  `workspaceId`/`projectId` and an `onViewComment` callback that switches to the
  Comments tab with the clicked finding/duplicate selected. A successful analysis with
  any findings invalidates `qk.projectComments(projectId)` so the board reflects
  updated priorities immediately.
- No credit/usage metering or paywall UI was added anywhere, matching TDR-0033's
  precedent.
- **Follow-up bug fix, same day:** the first pass only caught a `json.loads` failure
  (non-JSON text). A syntactically-valid-but-wrong-shaped response - a JSON array or
  scalar instead of an object, or a `findings`/`possible_duplicates` entry that isn't
  itself an object - would call `.get()` on the wrong type and raise an unhandled
  `AttributeError`/`TypeError` past that narrow `except ValueError`, surfacing as a 500
  instead of the intended graceful degradation. Fixed by widening the try/except to
  wrap the full parse-and-extract block (`isinstance` guards on `parsed` and on each
  list entry, catching `ValueError`/`TypeError`/`AttributeError` together) so any
  malformed model output degrades to a summary-only result and, critically, leaves
  `findings` empty - no partial/garbage write to a comment's `priority` can happen from
  a bad response.
- Verification: from `backend/`, `uv run ruff check app/`, `uv run ruff format --check
  app/modules/ai/` (repo-wide `format --check` has 7 pre-existing files needing
  reformat, all outside this slice and already modified by unrelated in-progress work
  on this branch - left untouched), strict `uv run mypy app/` (175 files), and
  `scripts/check_workspace_scoping.py` (the static tenant-isolation lint backing
  `test_workspace_scoping_lint.py`) all clean. From `apps/web/`, `pnpm typecheck`,
  `pnpm lint` (4 pre-existing warnings, none in touched files), and `pnpm build` all
  clean. The existing `pytest` suite was not run to completion: this machine has no
  local `mongod`/`redis-server` running (TDR-0001's native-binary dev setup), so the
  DB-backed suite hangs on connection rather than failing fast - consistent with prior
  Groq-slice entries in this ledger, which noted the same gap rather than starting
  those services. No new test suite was written, per this task's own Claude Code
  instructions. No live call to Groq was exercised in this session - the 5 keys are
  supplied by the user outside it; with `GROQ_API_KEYS` unset the endpoint returns the
  same honest disabled placeholder the other two AI actions already use, which is what
  this session's verification exercised.

## 2026-09-27: Cloud login browser deploy, part 2 - dedicated Dockerfile (TDR-0042)

Continuing the same-day deploy: the user added Railway balance and asked for the
`cloud-login` service to actually work. First deploy attempt (after merging PR #35,
which landed the whole day's work - preview origins, session sync, and this feature - on
`main`) failed twice:

1. First build used Railpack's own Node/Nx auto-detection instead of the Dockerfile at
   all - traced to the `cloud-login` service's build config not yet being set at the time
   its first (service-creation-triggered) build ran.
2. After setting `dockerfilePath`/`startCommand` via the Railway GraphQL API and
   redeploying, the container built but crash-looped: `startCommand` bypasses the
   Dockerfile's own `CMD ["sh", "-c", ...]` and runs the string directly, so
   `${PORT:-8000}` was never shell-expanded. Fixed by wrapping the override in its own
   `sh -c "..."`.
3. That redeploy (still against the OLD `main`, before the PR merge landed) also failed
   for the more fundamental reason that `cloud_login_app.py` didn't exist on `main` yet -
   the earlier attempt to `git push` had been blocked by a safety check and needed the
   user's explicit confirmation to retry, which they gave ("create pr and push to main").
4. After merging, `app` and `worker` auto-redeployed cleanly with the new code (confirms
   the rest of this day's work - TDR-0040/0041 - is now live). `cloud-login` still failed:
   tried `dockerfilePath: "/backend/Dockerfile#cloud_login"` (a guess at stage-target
   syntax some platforms support) - Railway's build log showed it literally tried to read
   a file at that path and failed, confirming that syntax isn't supported here.
5. Root cause: neither the Railway dashboard (Settings → Build, checked directly via a
   screenshot the user shared) nor the public GraphQL API (`ServiceInstance`,
   `ServiceInstanceUpdateInput`, `ServiceSource` schemas all searched for `target`) expose
   a way to pick a non-last Dockerfile stage for this project. `backend/Dockerfile`'s own
   comments describe a "Docker Build Target" dropdown for the `worker` service, but that
   control isn't reachable through anything checked this session - whether it still works
   for `worker` itself wasn't verified either way.
6. Fix: gave the cloud login browser its own dedicated `backend/Dockerfile.cloud_login`
   (single stage, no target ambiguity possible) instead of a `FROM worker` stage inside
   the shared Dockerfile. Slightly duplicates the base Python/uv setup, installs only
   Chromium (not Firefox/WebKit - this service never launches those), and completely
   removes any risk to `app`'s or `worker`'s own untargeted builds. `backend/Dockerfile`'s
   `cloud_login` stage was removed; TDR-0042, `.env.production.example`, and
   `DEPLOYMENT.md` updated to reference the new file instead of a build-target setting.

Status at end of this entry: `cloud-login` service's `dockerfilePath` repointed at
`backend/Dockerfile.cloud_login` via the Railway API; the file itself committed and
pushed on `codex/fix-proxy-comments-ai`, PR opened, not yet merged/redeployed - next step
is the user merging it and a final redeploy + health check once that lands.

Railway setup performed this session (via `railway` CLI + its GraphQL API, all
non-destructive/reversible): linked the `believable-caring` project; created the
`cloud-login` service tracking `main`; generated it a public domain
(`cloud-login-production.up.railway.app`); set `CLOUD_LOGIN_WS_URL` on `app`; wired
`cloud-login`'s `MONGO_URI`/`REDIS_URL`/`JWT_SIGNING_KEY`/`INTEGRATIONS_ENCRYPTION_KEY`/
`CORS_ALLOW_ORIGINS`/`PUBLIC_DASHBOARD_BASE_URL` as Railway variable references to `app`'s
existing values (`${{app.VAR}}`, not copied secrets). A `railway sandbox` was also tried
mid-task (user's own suggestion) to get real infra for verification, but it has no access
to the project's private network by default and no copy of the repo, so it was destroyed
again without being put to use. One `git push` and one attempt to read back the
`cloud-login` service's resolved variable values were both blocked by this environment's
own auto-mode safety classifier (secret-store write/read guards); the push was retried
after the user explicitly confirmed, the variable read was not retried (not needed - the
`set` call's own success response was sufficient confirmation).

## 2026-09-27: Cloud login browser - code ready, not deployed (TDR-0042)

Built the second of the two login approaches asked for (session sync, TDR-0041, is the
first): a real server-side Chromium a member can drive interactively for reviewers without
the extension, or sites whose session is bound to the signing-in IP.

- `backend/app/cloud_login_app.py` (new, separate minimal FastAPI app - never mounted into
  `app.main:app`): `GET /ws` - validates a one-time Redis ticket, claims one of a small
  number of concurrency slots (`SET NX EX`, same pattern as `ai/key_pool.py`'s Groq key
  claiming), launches Chromium behind the same per-navigation SSRF guard
  `browser_render/service.py` already uses, streams a CDP `Page.startScreencast` (JPEG,
  1280×800) to the client, and applies mouse/keyboard input via `page.mouse`/
  `page.keyboard`. On finish/timeout/disconnect: captures cookies + localStorage and calls
  `session_sync.service.create_ticket` **directly** (same process - reuses TDR-0041's
  pipeline instead of a second one).
- `backend/app/modules/cloud_login/` (new): `POST /api/v1/projects/{id}/cloud-login/sessions`
  (`project:manage`) mints the ticket on the main API, which never imports Playwright.
- `backend/Dockerfile`: new `cloud_login` stage, `FROM worker` (reuses its already-installed
  Chromium/Firefox/WebKit binaries rather than repeating the install), own `CMD`.
- `apps/web/src/features/projects/CloudLoginModal.tsx` (new) + `QuickToolsDock`/
  `ProjectOverviewPage` wiring (a "Sign in with a live browser" menu item, gated on a proxy
  link existing) + `styles/backline.css` additions.
- Config: `CLOUD_LOGIN_WS_URL` (empty = off, matches every other credential-gated feature's
  convention), `CLOUD_LOGIN_MAX_CONCURRENT_SESSIONS` (default 2),
  `CLOUD_LOGIN_SESSION_TTL_SECONDS` (default 240). Documented in `.env.production.example`
  and `DEPLOYMENT.md`.
- `packages/types` regenerated (additive: `CloudLoginSessionOut` + the new path).

**Not deployed.** Mid-build, the user shared their Railway dashboard: the
`believable-caring` project's only environment (`production`, already running the live
`app`/`worker`/`Redis`) had **$4.41 of credit left over the remaining 25 days**, no staging
environment to try a new service against first. A `railway sandbox create` was tried at the
user's own suggestion to get a real Linux box for verification, but the sandbox has no
access to the project's private network by default (confirmed: it couldn't even resolve
`redis.railway.internal`) and no copy of the repo, so it was destroyed again after a few
minutes rather than spending effort wiring it up for marginal benefit over the scratch
harness below. Given that budget, creating the actual `cloud_login` Railway service
(`CLOUD_LOGIN_WS_URL`, its own public domain) was deliberately left for the user to decide
on rather than done unprompted - see TDR-0042's Cost section for the actual numbers
(the running cost is genuinely small; the open question is whether to spend any of a
near-exhausted balance on trying a new service before topping up).

Verification:
- Backend `ruff check`/`format --check`/`mypy` (strict, 175 files) clean.
- Scratch harness (fakeredis, no real Redis/Mongo/Chromium): `cloud_login_app` module
  imports cleanly without the browser binaries installed (confirms the lazy `playwright`
  import - the API/ticket-minting path never pays for Chromium); the concurrency slot
  semaphore claims exactly `CLOUD_LOGIN_MAX_CONCURRENT_SESSIONS` slots, refuses the next,
  and reclaims one after release; the ticket round-trip is one-time (replay returns None);
  the dashboard-origin allowlist accepts the configured dashboard origin and rejects an
  arbitrary one; the mouse-coordinate parsing helper accepts numeric points and rejects
  malformed ones.
- `pnpm turbo run lint typecheck build` for web/widget/types: clean, same 4 pre-existing
  warnings, no new ones. Extension `lint`/`build` clean (its one pre-existing `typecheck`
  failure, unrelated to this work, is unchanged - see TDR-0041's entry).

Not verified, and can't be without deploying: an actual Chromium launch, the CDP screencast
loop against a real page, or the dashboard modal's canvas rendering/input capture against a
live websocket. No test suite written, per this repo's Claude Code instruction.

## 2026-09-27: Session sync via the extension, for SSO the proxy can't reach (TDR-0041)

Google/Microsoft SSO refuses to render inside any iframe, so TDR-0040's per-link preview
origin can't help sign-in flows that use it. Delivered a way to carry a session the member
already has in a normal browser tab into the canvas instead:

- `backend/app/modules/session_sync/` (new): `POST /api/v1/projects/{id}/session-sync`
  (`project:manage`-gated) takes cookies + localStorage, resolves the project's active
  proxy-mode share link, and stores a one-time Redis ticket (5-minute TTL) keyed by 24
  random bytes; refuses outright (clear error, not silent no-op) when the link has no
  preview origin (TDR-0040 not configured).
- `GET /proxy/{share_token}/__backline/session-sync` (`proxy/router.py`, registered before
  the catch-all path route so it isn't forwarded upstream) redeems the ticket: real
  `Set-Cookie` names with TDR-0040's own CHIPS attributes, an inline script writing
  localStorage (escaped the same way `interceptor.py`'s own injected script is), then
  redirects to `/`. Deletes the ticket the instant it's read, valid or not.
- Extension (`apps/extension`): manifest now declares `cookies` + `host_permissions:
  <all_urls>`. Popup shows "Sync this session to the canvas" when the active tab matches a
  project the member can manage; background worker reads cookies (`chrome.cookies.getAll`,
  HttpOnly included) and localStorage (`chrome.scripting.executeScript`), posts the ticket,
  then opens/closes an invisible tab at `redeem_url` - cookies/localStorage are per-origin,
  not per-tab, so the canvas iframe (same preview origin) picks both up on its next load
  with no coordination needed.
- `packages/types` regenerated (additive: `SessionSyncTicketOut` + the new path).

Verification:
- Backend `ruff check`/`format --check`/`mypy` (strict, 170 files) clean.
- Scratch in-process ASGI harness (real app, Mongo/Redis stubbed): create-ticket → redeem
  round trip confirmed real cookie names + HttpOnly + CHIPS attributes on the Set-Cookie
  response, an XSS-shaped localStorage value (`"<script>fake"`) correctly escaped in the
  emitted inline script, one-time consumption (replay → 404), and redemption attempted off
  a preview origin correctly rejected (422) rather than falling through to the generic
  proxy handler and being forwarded upstream.
- `pnpm turbo run lint typecheck build` for web/widget/types: clean, same 4 pre-existing
  warnings. Extension `lint`/`build` clean; extension `typecheck` has one pre-existing
  failure in `content-script.ts` (`openComposer` callback return type) confirmed via
  `git stash` to already exist on this branch before this work - not introduced here, not
  touched (out of scope for this change).

Not verified: a live browser session (`chrome.cookies`/`chrome.scripting` behavior, the
invisible-tab redeem) against a running extension + deployed stack. No test suite written,
per this repo's Claude Code instruction.

## 2026-09-27: Review proxy serves each share link from its own origin (TDR-0040)

Login sites failed in the canvas: Instagram's login rendered its own "profile not found"
page because its router read `/proxy/{token}/accounts/login/` as a username. Root cause
and all related breakers in TDR-0040. Delivered:

- `modules/proxy/preview_host.py` (token ↔ base32 DNS label, preview-domain config) and
  `preview_middleware.py`, which re-addresses every preview-host request to the proxy and
  nothing else (404 for a malformed label; websockets closed). Registered outermost in
  `app/main.py`.
- `proxy/service.py` preview path: `Cookie` forwarded as sent, `Set-Cookie` relayed under
  real names (Domain dropped; `Secure; SameSite=None; Partitioned`), redirects returned to
  the browser, Referer origin-swapped. `sec-ch-ua*`/`upgrade-insecure-requests` forwarded
  and `Sec-Fetch-*` normalised to a direct visit (both modes). Legacy path mode extracted
  unchanged into `_fetch_legacy`.
- `interceptor.py`: empty-prefix mode, plus a `document.cookie` setter applying the same
  cookie attributes. `rewriter.py` needed no logic change.
- Contract: nullable `preview_origin` on `ShareLinkOut` and `ReviewResolveOut`; OpenAPI
  re-exported and `packages/types` regenerated (additive diff only).
- Web: canvas iframe and guest handoff use `preview_origin` (legacy URL when null);
  postMessage targets the frame's real origin (`features/projects/canvas-origin.ts`, used
  by `ProjectOverviewPage.tsx` and `panel/CommentsTab.tsx`).
- Config/docs: `PROXY_PREVIEW_DOMAIN`/`PROXY_PREVIEW_SCHEME` (local default
  `preview.localhost:8000`; off elsewhere until set) in `.env.production.example` and
  `DEPLOYMENT.md`.

Verification:
- Backend `ruff check`, `ruff format --check` and `mypy` (strict, 166 files) clean; existing
  `tests/test_proxy_rewriter.py` 10/10.
- `pnpm turbo run lint typecheck build` for web, widget and types: all passed; web's 4
  pre-existing warnings unchanged.
- Scratch in-process ASGI harness (real app; Mongo, Redis and upstream stubbed with
  `httpx.MockTransport`):
  - preview `/` → `302 /accounts/login/`;
  - `csrftoken` relayed unprefixed with `Secure; SameSite=None; Partitioned`;
  - a JSON login POST carried the `Cookie` and `X-CSRFToken` upstream, and its HttpOnly
    session cookie came back;
  - absolute site links rewritten root-relative;
  - `/api/v1/auth/me` and `/widget/sdk.js` on a preview host went upstream, not to
    Backline;
  - a malformed label returned 404;
  - legacy `/proxy/{token}/` output unchanged;
  - with `ENVIRONMENT=production` and nothing set, `preview_origin` is null.
- Scratch Node VM run of the generated interceptor: relative URLs untouched, absolute
  `www.`/apex site URLs made root-relative, CDN URLs untouched, `pushState` mapped, and a
  `document.cookie` write's Domain/SameSite replaced.

Not verified: a live browser session against a running stack (no local Mongo/Docker in this
environment). That run would cover partitioned cookies in the cross-site canvas iframe on
`*.preview.localhost`, and a real SPA login. No test suite written, per this repo's
Claude Code instruction. Production needs wildcard DNS and a TLS certificate before
`PROXY_PREVIEW_DOMAIN` is set.

## 2026-09-27: Tickets doc sweep — pin ticket numbers and paste-to-attach (TDR-0039)

A second stakeholder Google Doc (plain text, no screenshots, 18 items) — distinct from
TDR-0038's 13-item screenshot report above — listed QA-tool bugs/requests whose wording
suggested an older backlog predating TDR-0021 through TDR-0038. Each item was checked
against current source before anything was changed. Full reasoning in TDR-0039; summary:

- **13 of 18 items were already done**, matching prior TDR work: ticket IDs in the
  dashboard (TDR-0032), the ticket board design, multi-person assignee filter, Add/Select
  Page, ticket-creation screenshots, default priority/page state, the due-date picker's
  dialog-portal fix (TDR-0032), login/forgot-password/signup in the tool (TDR-0024,
  TDR-0025), the full-width draggable/resizable preview (TDR-0022), comment pins surviving
  a refresh (TDR-0033–0036), and the comment composer/popup design. No changes made.
- **Fixed (2 genuine gaps):**
  - The widget's `CommentRecord` type never declared `ticket_number` (already present on
    the backend's `CommentOut` — no API change needed), so a live review-page pin and its
    read-only card never showed which ticket they belonged to, even though the dashboard
    shows the number everywhere. `renderPin` (`ui-notifications.ts`) now takes an optional
    ticket number and renders it as the pin's text; `index.ts` and `region-drawer.ts` pass
    it for an existing comment's pin and set it once a draft pin's comment is created.
  - Screenshot copy-paste was entirely missing (confirmed net-new — not in the widget, the
    web app, or the design HTML). `ui-attachments.ts`'s file-input handler was refactored
    to expose a reusable `addFiles(files)`; `ui-composer.ts` now listens for `paste` on the
    comment textarea, extracts any clipboard image items (naming them from their MIME type,
    since `getAsFile()` gives no filename), and feeds them through the same upload/chip
    pipeline a picked file already uses. Scoped to the widget comment composer only, per
    stakeholder direction (not the dashboard's "New ticket" form).
- **Asked the stakeholder directly rather than guessing (both answered):** the
  Status/Priority pills in `TicketRow.tsx`/`TicketTable.tsx` use a native `<select>` over a
  styled pill, with an existing code comment marking this intentional, and the design HTML
  has no interactive open-state for it to match against — decision: leave as-is, not a bug;
  and paste-to-attach scope — decision: widget composer only.
- Verification: `pnpm turbo run lint typecheck build` for `@backline/widget`,
  `@backline/extension`, and `@backline/web` all passed clean (web's 4 pre-existing
  warnings unchanged, none in touched files). No test suite was written or run, per this
  task's own instructions. Not exercised in a live browser against a running API.

## 2026-09-27: QA doc bug sweep — verified against source, fixed what's still live (TDR-0038)

A client bug report (Google Doc, 17 screenshots, 13 items) covering the Share modal,
sidebar, dashboard, projects grid/table, tickets calendar/board/toolbar, and the widget's
pin-click comment popup. Each item was checked against current source before changing
anything, since the branch already carries TDR-0032's calendar/board/date-picker rebuild
and the 2026-09-26 design-parity slices. Full reasoning and per-item disposition in
TDR-0038; summary:

- **8 of 13 items were already fixed** on this branch (calendar grid, due-date popup
  positioning, sidebar horizontal scroll, "Waiting on you" alignment, projects tab-bar
  scroll, project-card three-dot menu placement, select/dropdown chevron padding, board
  view design) — confirmed by direct source read, several against code comments that
  already describe the exact screenshot symptom as a closed bug. No changes made to these.
- **Fixed:**
  - `ShareProjectModal.tsx`'s hand-rolled sun-shaped settings icon replaced with the
    existing shared `GearIcon` (already used for the identical control in
    `CollaboratorsModal.tsx`).
  - Removed the "Manage all share links" footer link from `CollaboratorsModal.tsx`.
  - `features/board/components/KanbanBoard.tsx` (the comment/design-review board, distinct
    from the tickets Kanban) had no ticket/comment number on its cards, unlike every other
    ticket surface. Added a `bl-tid` badge via the existing `ticketRef()` helper.
  - The widget's read-only pin-popup (`ui-comment-view.ts`'s `openCommentView`) rendered
    only a thread's top comment; `thread-manager.ts` already held the full
    `[top, ...replies]` array in memory but read only index `[0]`. Added a `replies` field
    to `CommentViewData` and a read-only reply list (author, time, body) to the card. No
    reply composer was added inside this popup — posting already has a permission-aware
    path via the dashboard's `CommentDetail`/`CommentThreadPanel`; a second posting surface
    in the on-page widget is a separate product decision this report didn't ask for.
  - Found while investigating the reported toolbar "vertical scroll": `backline.css`
    defined `.bl-ticket-toolbar` twice, and the later definition silently dropped
    `flex-wrap:wrap`. Removed the shadowed rule and restored `flex-wrap:wrap` on the one
    that wins the cascade.
- **Deliberately left alone** (reasoning in TDR-0038): the pin-popup's status control is
  already editable for a team member reviewing through the dashboard canvas and read-only
  for a guest, by existing design policy — the screenshot most likely came from a bare
  guest-link visit; the projects Table view already has real styling, so "design a proper
  UI" is an open-ended aesthetic ask rather than a defect; a due-date range filter button
  in the tickets toolbar was intentionally removed in an earlier commit (`caaf5d1`) and
  wasn't reinstated, since re-adding it reverses a past product decision this report
  didn't ask to reopen.
- Verification: `pnpm turbo run lint typecheck build --filter=@backline/web
  --filter=@backline/widget` passed 6/6 (web lint: the same 4 pre-existing warnings, none
  in changed files; the same pre-existing >500 kB chunk advisory). No API contract,
  database, or `packages/types` change. No test suite was written or run, per this task's
  own instructions (Claude Code: verify via lint/typecheck/build only). No live browser
  QA was performed in this pass.

## 2026-09-26: Final proxy, comment persistence, and Groq reconciliation (TDR-0033–0036)

- Completed the interrupted comment-pin slice: stored anchors now wait a bounded time
  for late SPA rendering, pin offsets are proportional to the element's current box,
  and pending anchor work is discarded after a page change. This removes the
  load-timing race that made a persisted comment appear only on some reloads.
- Presigned R2 uploads remain the fast path. Screenshots and attachments now retry via
  a bounded multipart API relay when the browser cannot complete that PUT (notably a
  missing/stale bucket CORS policy). The relay repeats actor/project authorization,
  Pydantic type/size validation, rate limiting and private S3 storage; the generated
  OpenAPI JSON and TypeScript contracts include `StoredUploadOut` and the new route.
- Hardened the proxy work before publication: per-request HTTP clients now close
  without closing the shared connection pool, and cross-site GET redirects return to
  the browser instead of forwarding bearer/custom headers to a different host.
- Reconciled Groq behavior with current official documentation. The configured default
  is the documented production model `openai/gpt-oss-120b`; limits are organization-
  wide, so a 429 cools the entire pool rather than hopping keys. Redis leases now carry
  unique ownership tokens and release/cooldown uses atomic compare operations, avoiding
  deletion of a newer lease after a safety TTL expires. Documentation no longer
  recommends extra accounts/organizations to multiply quota.
- Final verification: backend `ruff check app` passed; `ruff format --check` passed on
  all changed Python files; strict `mypy app/ scripts/` passed across 174 source files;
  and the workspace-scoping checker passed across 19 repository files. OpenAPI JSON
  and generated TypeScript were regenerated twice with identical SHA-256 hashes.
  Frontend `pnpm turbo run lint typecheck build` passed all 12 tasks (the same four
  existing web warnings remain); the web build retains its existing >500 kB chunk
  advisory. Per the Codex task instruction,
  no new test suite was written or run. No live provider credential, production
  service, shared fixture, or destructive migration was used.

## 2026-09-26: Groq AI feature - frontend refinement and concurrency verification

> Historical intermediate evidence: the pool later gained owner-token leases and
> organization-wide 429 cooldown in the final reconciliation above. Treat the final
> lint/typecheck/build evidence, not this earlier throwaway harness, as release evidence.

- Confirmed the AI feature needs no permission/plan change to be testable by every real
  user: `comment:view_team` (the permission both AI endpoints already require) is
  granted to `owner`/`admin`/`member` - every workspace role except `guest` - per
  `backend/app/core/permissions.py`. No `ProFeatureModal`/plan check wraps either AI
  button in the frontend (grepped both surfaces directly). This was already the case
  before today's Groq work; nothing needed changing to make it available for testing.
- Found and fixed a real state-leak bug while reviewing the frontend for refinement:
  `CommentDetail.tsx`'s `draft` (suggestReply) mutation's `isError`/`error` is not
  reset when the drawer switches to a different comment (its existing per-comment
  reset `useEffect` cleared `body`/`attachments`/`devTask`/etc. but never called
  `draft.reset()`). A user who got "AI is busy" on one comment would still see that
  banner under the next comment they opened, before ever asking it for a draft. Fixed
  by moving the reset effect to after `draft` is declared (it referenced `draft`
  before its declaration otherwise) and adding `draft.reset()` to it.
- Small related polish in `CommentThreadPanel.tsx`: a summary or suggested replies
  generated before a reply is posted now clear on that reply's success, since they
  described a thread state (pre-reply) that no longer matches what's now on screen.
- **Made the key pool's concurrency claim concrete, not just reviewed:** no local Redis
  was available in this sandbox during the original TDR-0034 work, so `acquire_key`/
  `release_key`/`cool_down_key` had only been verified by reading. Wrote an ad-hoc
  script (not part of the repo) against `fakeredis`'s async Redis stand-in and ran it:
  confirmed 3 concurrent acquires against 3 keys each get a distinct key with no
  double-claim; a 4th concurrent caller with all keys held gets `None` (the "busy"
  case); a released key is immediately re-claimable rather than waiting out the lock's
  safety-net TTL; a cooled-down key stays unavailable until its own cooldown elapses,
  then is claimable again; and - the strongest check - 50 concurrent callers racing for
  3 keys produced exactly 3 winners with no two winners getting the same key index,
  which is the actual atomicity guarantee `SET NX` is relied on for. All 10 checks
  passed. This does not test against the real production Redis (out of reach from this
  environment, and not attempted so as not to touch live traffic/data) - it tests the
  same logic against a faithful in-memory Redis implementation instead.
- Verification: `pnpm turbo run lint typecheck build` passed 12/12 (only the same
  pre-existing warnings as every prior run - none in the two files touched here). The
  `fakeredis`-based key-pool script was run via `uv run --with fakeredis`, an ephemeral
  dependency for this one verification run only - `pyproject.toml`/`uv.lock` are
  unchanged.

## 2026-09-26: Proxy sign-in through a site's own scripts, and faster, steadier loading (TDR-0035)

- Problem reported: signing in to a reviewed site inside the canvas failed, and the
  canvas was slow, reloaded by itself and sometimes showed "failed to load". The user
  asked for the proxy (not the browser extension) to handle any site's own login.
- Root causes and fixes are itemized in TDR-0035. In short: a page's scripted requests
  (fetch/XHR login, SPA routing, resources added after load) never reached the site, so a
  network interceptor is now injected first in every proxied page
  (`backend/app/modules/proxy/interceptor.py`) and the widget reaches Backline through the
  un-wrapped fetch; bearer/CSRF headers and the reviewer's User-Agent are forwarded, and
  PUT/PATCH/DELETE are proxied; DNS no longer blocks the event loop; connections are
  pooled; responses are gzipped and keep their caching headers; the rate limit is per
  share link + IP at 1200/min; the dashboard no longer reloads (or times out) pages the
  frame navigated to itself; and the widget follows SPA route changes, re-registering the
  page, its pins and its realtime subscription.
- Also fixed on the way: registered page URLs no longer include the canvas's `blBrowser`
  parameter, which had been creating a separate page per capture-browser choice (and a
  different page from the one guests register). Existing `?blBrowser=` pages are left
  as-is; merging them needs a dry-run-first migration, not done here.
- Verification: `uv run ruff check app/` and `ruff format --check` clean; `uv run mypy app/`
  clean (164 files); `tests/test_proxy_rewriter.py` 10/10 passed. `pnpm turbo run lint
  typecheck build` for web, widget and extension: 9/9 tasks passed (web lint: the 4
  existing warnings, none new), plus uncached `tsc`/`eslint` runs for widget and extension.
  Two scratch harnesses (not checked in): the generated interceptor run in a Node VM
  against a fake browser global - 25/25 rewrite-rule checks, including the widget bypass,
  double-injection guard and element rules; and `fetch_proxied_resource` driven against an
  `httpx.MockTransport` site - 16/16, covering the injected-script order, a JSON login
  POST (body intact, `Set-Cookie` namespaced and path-scoped), CSRF/UA forwarding with the
  reviewer's IP withheld, a follow-up call authenticated by bearer token plus the
  namespaced cookie with Backline's own cookie withheld, cache-header passthrough, and 50
  concurrent asset fetches.
- **Not verified:** no live browser run against a real site through a deployed stack -
  MongoDB/Redis/S3 aren't available on this machine, so `tests/test_proxy.py` and the
  Playwright journeys couldn't run. That suite is also already broken independent of this
  change: its `_FakeUpstreamClient` has no `.cookies`, which `service.py` has read since
  `916e444` (the session work), and the file hasn't been updated since before that commit.
- Open follow-ups: an API on a separate domain; WebSocket and streamed (SSE) responses;
  worker requests and CSS `url()` (still via the Referer fallback); the `?blBrowser=` page
  merge. Framed third-party SSO (Google/Microsoft/Okta) is a browser-enforced limit.

## 2026-09-26: Groq model and local environment reconciliation

- `openai/gpt-oss-120b` is the configurable default and is listed in Groq's official
  production model catalog. No API key is committed; deployment credentials belong in
  Railway and local credentials belong in ignored environment files.
- Groq's current documentation confirms limits are organization-wide. The key pool is
  for credential rotation and graceful busy handling, not quota multiplication; a 429
  now cools the whole pool and never hops organizations/accounts.
- `Settings.model_config` resolves `.env` from the backend process working directory.
  `RUNNING_LOCALLY.md` now calls out that local backend settings belong in
  `backend/.env` when starting from `backend/`.

## 2026-09-26: Groq key pool - multi-key rotation and a graceful busy state (TDR-0034)

- Follow-up to the same-day Groq migration below, before the user's key was live:
  they asked whether Groq's rate limits are per-account or per-key (Groq documents
  them as **organization-wide**), and asked for multi-key rotation with a cooldown
  and a graceful "busy, try again" response for whichever request doesn't get a key,
  regardless of the answer.
- `GROQ_API_KEY` (singular) became `GROQ_API_KEYS` (a JSON array, matching
  `CORS_ALLOW_ORIGINS`'s existing convention) backed by a new Redis-based pool,
  `backend/app/modules/ai/key_pool.py`: each concurrent AI action claims one
  configured key for the duration of its own call and releases it immediately after;
  a 401/403 cools only the rejected credential and retries another configured key;
  a 429 honors `Retry-After` and cools the organization-wide pool. A new
  `AIServiceBusyError` (503, `AI_SERVICE_BUSY`) fires when every
  key is genuinely unavailable, before any request reaches Groq - distinct from the
  existing `RateLimitedError` (per-workspace abuse throttling).
- Both existing frontend surfaces (`CommentDetail.tsx`'s "Write a reply for me",
  `CommentThreadPanel.tsx`'s "Summarize"/"Suggest Replies") now show "AI is busy right
  now - try again in a moment." specifically for that case via a new
  `aiErrorMessage()` helper in `features/ai/api.ts`, instead of the generic per-action
  failure text. `CommentThreadPanel.tsx`'s suggest-reply failure path previously had no
  visible error state at all (only `console.error`) - fixed as part of this same
  change.
- Full design rationale, including why the pool uses a call-duration lock rather than
  a fixed per-call cooldown (would spuriously show "busy" with only one key
  configured), is in TDR-0034.
- Verification: from `backend/`, `uv run ruff check .` passed clean and strict
  `uv run mypy app/` passed clean (163 source files, up one for the new
  `ai/key_pool.py`). `uv run ruff format --check app/modules/ai/ app/core/config.py`
  confirmed the new/changed files themselves are clean (the 2 files it still flags,
  `ai/router.py`/`ai/schemas.py`, are the same pre-existing drift noted in the
  TDR-0033 entry below, not touched here either). `pnpm turbo run lint typecheck
  build` passed 12/12 for the frontend changes (`CommentDetail.tsx`,
  `CommentThreadPanel.tsx`, `features/ai/api.ts`), same 3 pre-existing warnings as
  every prior run. No test suite was written or run, per this task's own instructions.
  No live call to Groq or Redis-backed concurrency scenario was exercised - the pool's
  claim/release/cooldown logic was verified by reading, not by running multiple
  concurrent requests against a live Redis instance.

## 2026-09-26: AI provider is Groq (TDR-0033)

- `backend/app/modules/ai/service.py`'s "Summarize" and "Suggest reply" actions were
  already real, shipped endpoints, and the frontend (`CommentThreadPanel.tsx`'s "✨
  Summarize" / "✨ Suggest Replies", `CommentDetail.tsx`'s "Write a reply for me") was
  already fully wired to them - both predate this change. What was missing was a
  configured, documented provider: the code called Gemini via a raw `os.getenv`
  read that bypassed `Settings` entirely and was never added to either `.env.example`
  file, so in this deployment every call fell through to the canned placeholder text.
- Per the open decision flagged in `docs/implementation/slack-ai-mcp-architecture.md`
  §0, the user chose Groq (not Gemini or Claude).
  `ai/service.py` now calls Groq's OpenAI-compatible chat completions API directly
  over `httpx` (no new SDK dependency); `groq_api_keys`/`groq_model` were added to
  `Settings` following the existing empty-array-disables convention, and documented
  in `.env.example`, `.env.production.example`, and `DEPLOYMENT.md` Part 8.7. See
  TDR-0033 for the full decision record, including why a genuine upstream failure now
  raises `ExternalServiceError` (502) instead of an unhandled exception.
- Not in scope, and not touched: `AiTab.tsx` ("BugHunt AI") is a different, unbuilt,
  page-wide multi-comment analysis surface with no backend endpoint, tied in the
  reference HTML to a fake AI-credits system (`CREDITS`/`spendCredit()`). It remains
  the honest "Coming soon" placeholder noted in the 2026-09-08 entry below.
- Verification: from `backend/`, `uv run ruff check .` passed clean (162 files); strict
  `uv run mypy app/` passed clean (162 source files). `uv run ruff format --check .`
  flagged 13 files as needing reformatting, none of them touched by this change
  (pre-existing drift - `ai/service.py` itself is not in that list). From the repo
  root, `pnpm turbo run lint typecheck build` passed 12/12 tasks (0 cache hits, fresh
  run); the only lint output is the same three pre-existing warnings unrelated to this
  change (`ProjectOverviewPage.tsx` exhaustive-deps, two fast-refresh-only-exports
  warnings), and the `web:build` >500 kB chunk warning is the same pre-existing one
  noted in the 2026-09-09 entry above. `SummarizeResult`/`SuggestReplyResult` were not
  touched, so no `packages/types` regeneration was needed. No test suite was written or
  run, per this task's own instructions. No live call to Groq was made as part of
  verification - the key is supplied by the user outside this session.

## 2026-09-23: Direct deployments without GitHub Actions

- Removed the repository's only GitHub Actions workflow at the owner's explicit
  request. The workflow was a verification/smoke-test gate; it did not perform the
  Vercel or Railway deployments.
- Retained direct Vercel and Railway GitHub deployments. Railway watch paths may still
  report "No deployment needed" for commits that do not change a service's source.
- Reconciled the current architecture, deployment guide, and testing specification in
  TDR-0027. Historical TDRs were left unchanged.
- Verification for this workflow/documentation-only change: `git diff --check` and
  repository status/diff inspection. No application source, API contract, database,
  lint/typecheck/build output, or test suite was changed or claimed.
## 2026-09-22: Ticket numbers, board, calendar and date picker (TDR-0032)

- **Ticket numbers (TDR-0032).** `comments.ticket_number` - a per-workspace integer
  assigned at creation from an atomic `counters` document
  (`CommentRepository.next_ticket_number`), exposed on `CommentOut`/`TicketOut`, backed
  by the additive unique partial index `comments_workspace_ticket_number`, and
  backfilled for existing records by `scripts/migrate_ticket_numbers.py` (dry-run by
  default, creation order, skips numbered records, raises counters with `$max`,
  re-runnable). Replies are deliberately unnumbered. `packages/types` regenerated.
  The reference is printed through one frontend helper (`lib/ticket-ref.ts`) on the
  board, list, table, calendar, ticket detail and the project review drawer - which
  now shows the real number instead of the browser-computed position it used before.
- **Board view rebuilt to the design** (`tBoard`/`taskCard` in `design/index.html`): a
  column per status tinted by that status with a count, and compact cards carrying the
  ticket number, priority, the ticket, its project · page, first tag, due date and
  assignee faces. Dragging between columns still sets status; the per-card status
  `<select>` is gone, since the design's card does not have one and the drag does the
  same job (it remains on the list and table rows).
- **Calendar view fixed** (`design/index.html`'s `.calm`/`.cal-dow`/`.cal-grid`): the
  CSS assumed flat day cells while the component wrapped each week in a `role="row"`,
  so every week collapsed into a single column and the weekday names ran together.
  Each row is now its own 7-column grid, with outside/today cells, three chips per day
  plus "+N more" / "Show less", a Today button and the "No due date" drop panel.
- **Due-date picker fixed.** `components/Dialog.tsx` opens a native `<dialog>` with
  `showModal()`, which paints in the browser's top layer; the calendar portaled to
  `<body>` therefore landed *behind* the dialog backdrop - visible as a smudge and
  impossible to click, so a due date could not be set from a ticket. It now portals
  into the nearest `<dialog>` when there is one, and the popup itself was rebuilt to
  the design's `.dp` (it previously borrowed the full-page `.bl-calendar` grid).
- **Board screen matched to the design, second pass.** Two separate causes, both now
  fixed. (1) A grid item is `min-width:auto`, so one unbreakable string (a project named
  by its URL) set a card's minimum width and pushed it past the column edge, hiding
  priority and the due date; columns, bodies and cards now carry `min-width:0`, so the
  subtitle ellipsizes instead. (2) The new board reused the `.bl-board` container class,
  and the legacy `.bl-board>section` / `.bl-board h2` rules - still the guest board's
  (`features/review/GuestBoard.tsx`), so not removable - outrank any single class: they
  were painting the columns paper-grey instead of white, adding 10px of padding that
  squeezed every card, and shrinking the column headings. The ticket board now has its
  own container class (`.bl-tboard`), which leaves the guest board untouched. Column
  tracks floor at 200px so six statuses still fit a laptop without a horizontal
  scrollbar. The card's due date became plain
  coloured mono text rather than a filled pill, as the design has it, and `TicketOut`
  gained `page_path` so the second line reads "Project · /pricing" (design/index.html's
  taskCard) instead of a page's marketing `<title>`. The ticket filters and the layout
  switcher are now one segmented control each with the design's own view icons and mint
  active counts, matching `.seg` in the design rather than the projects list's folder
  tabs.
- Verification: `pnpm turbo run lint typecheck build` passed (12/12; web lint keeps its
  4 pre-existing warnings, none in changed code). Backend `ruff check .` and strict
  `mypy app/ scripts/` passed (172 files); `ruff format --check` reports only
  files that were already unformatted before this change. The backfill was dry-run and
  then applied against the local dev database (1 workspace, 9 records numbered) and
  re-run to confirm idempotency (9 already numbered, 0 to number). Board, calendar and
  date picker were rendered in headless Chromium against the app's built CSS in light
  and dark, including picking a date inside a real modal dialog (returns the selected
  ISO date and closes) and the calendar's expand/collapse and month navigation. Per
  AGENTS.md, no test suite was added.

## 2026-09-22: Comment detail in the review drawer (TDR-0031)

- Clicking a comment in the project review drawer now opens that comment's detail in
  the drawer (`CommentDetail.tsx`) instead of only scrolling the canvas to its pin: an
  "All comments" back link and `#<n>` badge, the workflow fields (status, waiting on,
  tags, assignee, due date, priority, page), the thread with each message's author,
  attachments and captured context (browser · OS · viewport, and the element it was
  left on), and a reply box. The canvas still scrolls to the pin on the same click, and
  a pin clicked in the canvas moves the open detail to that comment.
- The reply box carries the design's "Write a reply for me" (the existing
  `ai/suggest-reply` endpoint) and "Turn into a dev task", which formats the comment's
  own recorded fields into a copyable card - no AI call, since no such endpoint exists.
  Replies keep their Client visible / Team only choice, screenshot attachments, @
  mentions and Cmd/Ctrl+Enter to post; Resolve/Reopen sits beside Post reply.
- The modal thread dialog is no longer opened from the drawer (the ticket board still
  uses it). `?thread=<id>` still deep-links a comment, and every field edit goes
  through the same `PATCH /comments/{id}` and cache merge as the list and board.
  `DatePicker` gained an optional `triggerClassName`/`children` for its trigger only.
- Verification: `pnpm turbo run lint typecheck build` passed (12/12 tasks; web lint has
  the same 4 pre-existing warnings, none in changed code). The detail was rendered in
  headless Chromium against the app's built CSS at drawer width, in light and dark:
  fields, thread, dev-task card, the status and tag menus, Escape closing a menu
  without closing the drawer (and reaching the drawer on the next press), click-outside
  closing a menu, and Post reply enabling once a reply is typed. Per AGENTS.md, no test
  suite was added; the live drawer against a running API was not exercised.

## 2026-09-22: Status in the canvas comment card (TDR-0030)

- The read-only comment card opened from a pin now shows the comment's status in its
  dark header (dot + label, between the page pill and the close "x"). In the dashboard
  canvas it's a menu with all six workflow statuses. The widget hands the change to the
  dashboard over postMessage (`backline:request-status-access` / `status-access`,
  `update-comment-status` / `comment-status-result`), and the dashboard makes it with
  the member's session via `PATCH /comments/{id}` and merges the result into the
  Comments drawer's cache. The extension calls the same PATCH with its member token.
  Guest reviewers see the status read-only. Guest permissions and the backend are
  unchanged.
- The card shows the new status straight away, then settles to what was saved, or
  reverts with "Couldn't change the status. Please try again." if the change fails or
  no answer comes within 15 s. `comment.updated` over the guest socket now also updates
  the widget's thread state and an open card. The menu is keyboard-operable (arrows,
  Home/End, Enter, Tab). Escape closes the menu first and the card on the next press.
- Verification: widget, extension and web `typecheck`, `lint` (web: 4 existing
  warnings, none in changed code) and `build` passed. The card was rendered in headless
  Chromium from the widget sources against a stubbed updater: editable and read-only
  headers, the open menu, keyboard selection, the pending state, the failure revert and
  the Escape order. Per AGENTS.md, no test suite was added. The live dashboard ↔ canvas
  round trip against a running API was not exercised.

## 2026-09-20: Full-width review preview and draggable width (TDR-0022)

- The responsive project-review preview ("Fit canvas") now fills its container instead
  of being capped at `min(1180px,100%)` and centred. The stage is that container: a
  single 40px gutter each side, with the right gutter also reserving the side-panel
  rail and, while it is open, the comments drawer - so a full-width frame no longer
  sits underneath the panel.
- Added a Chrome DevTools-style width handle on the right edge of the responsive frame
  (`CanvasResizer.tsx`). Dragging it narrows or widens the preview with the grabbed
  edge tracking the pointer, double-click / `Home` / releasing near the container edge
  returns it to full width, and `ArrowLeft`/`ArrowRight` (with `Shift` for a coarse
  step) and `End` drive it from the keyboard. It exposes the window-splitter pattern
  (`role="separator"`, `aria-valuenow`/`min`/`max`) and shows a live px readout while
  dragging.
- The width persists in the URL as `?stageWidth=<px>` (written once per drag, on
  release) and is reflected in the footer status readout as `<width> × auto`. It
  applies only without a `viewport` preset; picking any viewport clears it. No stored
  record or API contract changed.
- Switching the canvas between Comment, Browse and Draw no longer reloads the proxied
  site (TDR-0023). `blMode` is now only the mode the canvas was loaded with, and each
  switch is posted into the running widget as `backline:set-mode`; the widget applies
  it in place (tooltip, region-drawer setup/teardown, a mode check in the click
  handler) instead of being rebuilt. The dashboard re-sends the mode whenever the
  canvas reports `page-registered`, which also keeps Browse mode from reverting to
  Comment after a link click inside the canvas. Pins, open threads, an unsent composer
  and the scroll position all survive a switch now.
- Added the sign-in recovery affordance the login screen was missing (TDR-0024). The
  design's `lg-forgot` control ("Trouble signing in?") now opens the design's `#lg-reset`
  and `#lg-sent` panels, rebuilt against the real OTP flow rather than a password reset
  the product has no backend for: the recovery panel sends the six-digit code, and the
  code step became the "Check your email" panel (mail badge, address in `lg-mailbox`)
  with the existing code field, expiry countdown, resend and change-email controls. The
  three panels are now mutually exclusive, each with its own heading, as in the design.
  Verified against `design/index.html` side by side in Chromium at 1440x900.
- Added email + password signup and sign-in beside the existing OTP and Google flows
  (TDR-0025, spec §13.2a). `POST /auth/signup` (201, signs straight in) and `POST
  /auth/login`, scrypt hashing via the existing `cryptography` dependency
  (`scrypt$n$r$p$salt$digest`, ~32 MiB/~175 ms, derived off the event loop), a nullable
  `users.password_hash` so Google/OTP members are untouched, a 409 rather than a merge
  when the address already exists, one identical failure message for every login failure
  (with a dummy-digest verification so timing doesn't separate them), and per-IP plus
  per-email rate limits. The login screen now carries all four design panels: sign-in
  with a password and SHOW toggle, "Create your account" with the design's four-point
  strength meter and terms gate, the recovery panel and the code panel.
- Verified live against a local API (Mongo + Redis on this machine, test accounts
  removed afterwards): signup 201 with the refresh cookie set, duplicate signup 409,
  correct password 200, wrong password and unknown address both 401 with the same body,
  a member with no password also 401, per-email login limit tripping to 429 after 10
  tries, and the schema/service policy rejections (422 under 12 characters, repeated
  characters, email inside the password, blank name). Driven through the real UI in
  Chromium: strength meter Weak→Strong, SHOW/HIDE, the terms gate, signup landing
  authenticated on `/`, and password sign-in doing the same.
- Regenerating `packages/types` also cleared drift already on `main` - the deleted
  `modules/auth/account` router was still in the checked-in `openapi.json`, so
  `app__modules__auth__schemas__SessionOut` collapsed back to `SessionOut` and the one
  frontend reference was updated.
- The review proxy now carries a login form and the session behind it (TDR-0026, spec
  §13.3a), so pages behind a client's own login can be reviewed. Added POST routes
  beside the existing GET ones, request-body forwarding capped at 2 MiB, `Origin`/
  `Referer` rewritten to the reviewed site's own address so its CSRF checks pass, and
  cookie passthrough in both directions - re-emitted to the reviewer as
  `blp_{share_token}_{name}` on `Path=/proxy/{share_token}` (`SameSite=None; Secure;
  Partitioned` outside local, since the canvas is a cross-site iframe), and forwarded
  upstream only when they carry that prefix. A form's redirect is returned to the
  browser as a 303 at the proxied path rather than followed server-side, so the frame's
  URL matches the page it shows. Nothing is stored server-side.
- Verified live against a local site with a real login (form → Set-Cookie → redirect →
  protected page), with the SSRF guard stubbed in a throwaway local process only, and
  the seeded project/share links removed afterwards: signed out bounced to the login
  page, the form action rewritten to the proxy, POST answered 303 to the proxied
  dashboard with the namespaced HttpOnly cookie, the protected content then served, and
  the widget still injected on it. Isolation checks: the site received only its own
  `sid` cookie while `refresh_token` and another Backline cookie sent alongside were not
  forwarded; `Origin`/`Referer` arrived as the site's own; a second share link to the
  same site in the same browser saw no session and was bounced to the login page; wrong
  credentials returned the site's own 401.
- Comment boxes now grow with what's being typed instead of staying at their opening
  size. The widget composer (`ui-composer.ts`) and the dashboard thread reply
  (`MentionsInput`, via the new `lib/auto-grow.ts`) share one rule: fit the content up
  to a 40vh cap declared in CSS, then scroll, and treat a height the person set by
  dragging the corner as a floor so a keystroke never undoes their drag. Both keep
  `resize: vertical`. The widget re-runs `placeCard` on each growth so a composer opened
  near the bottom of the viewport rides up rather than growing off-screen. A short
  message still looks exactly as it did.
- Verified in Chromium against the running app, with the seeded fixtures removed
  afterwards. Widget composer: 78px empty and for a one-liner, 164px for a seven-line
  comment, capped at 304px (40vh of a 760px viewport) for 40 lines and scrolling from
  there. Dashboard reply: 64px empty, 84px for a four-line reply, capped at 380px (40vh
  of 950px), scrolling, and still reporting `resize: vertical`.
- Fixed the comment composer navigating the reviewed page away on Enter. A shadow root
  hides DOM, not events: keystrokes typed into the widget kept propagating out
  (retargeted to the host) and reached the reviewed site's own document-level key
  handlers - a search box, a nav, a carousel - so a plain Enter mid-comment ran the
  site's handler and took the unsent comment with it. `createShadowRoot` now stops
  `keydown`/`keypress`/`keyup` at the shadow boundary, which is the last point inside
  the widget's own tree. Widget-internal handlers are unaffected: they sit on the
  elements themselves (the composer's Cmd+Enter, a pin's Enter) or on document in the
  capture phase (the comment card's Escape), both of which run first.
- Reproduced and verified in Chromium against a proxied local site carrying
  `document.addEventListener("keydown", e => e.key === "Enter" && (location.href = ...))`,
  which is what the real symptom looked like. Before: Enter navigated to the other page
  and the composer with its half-typed comment was gone. After: the page stays put, the
  composer stays open and Enter inserts a newline. Regression pass on the widget's own
  keys, all with no navigation: Enter submits the guest name prompt (implicit form
  submission is a default action, which stopPropagation doesn't touch), Cmd+Enter still
  posts a comment, and Escape still closes a pin's comment card.
- Verification: `pnpm turbo run lint typecheck build --filter=@backline/web --filter=@backline/widget` passed
  (6/6 tasks; 607 modules; the pre-existing >500 kB chunk warning and four pre-existing
  react-refresh lint warnings remain). Stage geometry was measured in headless Chromium
  against the built stylesheet: 40px left gutter and 94px right (40 + 54px rail) with
  the drawer closed, 474px right with it open, the frame centred within that box at any
  explicit width, and the handle hidden below the 760px breakpoint. No test suite,
  database migration, or deployment is claimed.

## 2026-09-10: Brand, contrast, and light/dark UI hardening

- Made Light the deterministic first-visit theme and retained Dark as an explicit user
  choice. Added a theme control to the authenticated topbar, project-review header, and sign-in screen, replaced
  the Account modal's system/light/dark select with clear Light/Dark choices, synchronized
  mounted controls, and kept the existing per-browser persistence boundary. Legacy
  `system` values safely resolve to Light.
- Repaired the root cause of mixed-theme text: Tailwind semantic colors now resolve
  through the same runtime custom properties as `backline.css`. Accent text, filled
  actions, and on-accent foregrounds have separate roles, preventing both dark-on-dark
  labels and white-on-bright-mint controls. The dark palette now has distinct canvas,
  rail, surface, elevated, border, text, muted, focus, danger, and brand states.
- Hardened shared application chrome and components: branded active navigation, clearer
  hierarchy, raised surfaces, consistent radii/shadows, visible focus states, responsive
  spacing, reduced-motion support, theme-aware inputs/tables/chips/dropdowns/dialogs, and
  responsive Account settings. Renamed the browser title from the prototype `QA Tool`
  label to Backline and added theme metadata.
- Migrated the project Board's remaining prototype Tailwind presentation onto shared
  Backline headers, segmented controls, filter bar, kanban columns/cards, empty states,
  bulk controls, and table styles. Data fetching, mutations, React Query ownership,
  URL-owned filters, routing, and backend contracts are unchanged.
- Verification passed: monorepo `pnpm lint`, `pnpm typecheck`, and `pnpm build`. The
  production build retains the existing large-chunk warning. Local browser QA covered
  the sign-in surface in Light and Dark at desktop and 390px mobile widths, verified
  persisted switching and theme-color metadata, and found no sub-4.5:1 normal-text
  contrast results on the rendered sign-in surface. Authenticated visual QA was not
  claimed because no authenticated local browser session was available. No test suite
  was added or run, per the Codex-specific project instruction.
- Decision: [TDR-0021](../tdr/0021-light-default-and-unified-theme-contract.md).

## 2026-09-09: Follow-up external implementation review

- Rejected an incorrect guest-widget drag/re-anchor implementation. It sent a guest
  token to the intentionally member-only `/comments/{id}/reanchor` endpoint, so every
  drop would receive 403 while leaving the pin visually moved. Guest re-anchoring stays
  disabled; pins now expose button semantics and Enter/Space thread opening instead.
- Retained and corrected the safe accessibility/resilience work: the date picker has a
  valid roving tab stop without a selected date and restores trigger focus when closed;
  the widget reconnect indicator is an ARIA live status and distinguishes a browser
  being offline from an online socket/server interruption.
- Source verification passed for both affected packages: web and widget lint,
  typecheck, and production builds. No Playwright or pytest suite was run. These changes
  do not close the outstanding master-audit items or establish release completeness.

## 2026-09-09: Current-state audit (verification only)

- The full set of `audit-batch-00` through `audit-batch-12` reports is present, but
  this does **not** close the master audit: its own ledger records 3 complete, 88
  partial, 47 pending, and 9 backlog rows. Release-complete status is therefore not
  supported.
- Current static verification passed: `pnpm lint`, `pnpm typecheck`, `pnpm build`
  (existing large web-chunk warning), backend Ruff, strict mypy, and workspace-scoping
  lint. MongoDB and Redis accepted read-only connectivity pings; no shared data,
  migrations, fixtures, or deletes were run.
- Existing test suites were not run and no test suite was added, per this Codex task's
  project guidance. The latest unstaged Playwright journey revisions now use the
  supported routes, but their helper/selectors require an isolated execution pass before
  they become evidence. See `docs/implementation/audit-current-state-2026-09-09.md` for
  the exact review findings and recommended completion order.
- The source recheck found and corrected the remaining M-20 ad-hoc integration query
  key: `IntegrationsPage.tsx` now uses `qk.integrations()` consistently.

## 2026-09-08: Slice 09 verification pass — fixes, extended coverage, and checks run

Verified the "Post-login UI consistency audit and polish (Slice 09)" entry below against
`backline.css` and a live build, since it had only been source-inspected. Found and fixed
real defects, extended coverage to routes the audit's own "every post-login and guest
route" mandate had missed, and this time actually ran the checks it had deferred.

**Confirmed defects found and fixed:**

- **Real bug (broken token, same class of mistake as the earlier settings-family
  fix):** `IntegrationsPage.tsx`'s disconnect button was changed from a hardcoded
  `#A33317` to `var(--bl-error)` - but no `--bl-error` custom property existed anywhere
  in `backline.css`, so the text would have rendered in an unstyled/inherited color
  instead of the intended error red. Added `--bl-error:#A33317` to the `:root` legacy
  alias block instead of reverting to a hardcoded hex, so the token now actually backs
  the reference and is available for reuse.
- **Missed one-off colors (the audit's own stated goal, applied to instances it didn't
  reach):** `MembersPage.tsx`'s "Remove" member button and `AccountModal.tsx`'s "Sign
  out" session button still had raw `#A33317` inline styles instead of the new token.
  Switched both to `var(--bl-error)`.

**Coverage gaps found and fixed (routes/components the "audit every post-login and
guest route" mandate should have reached but didn't):**

- `ComingSoonModal.tsx` (invoked live from the already-migrated `McpServerPage` and
  `ProjectTypePlaceholderPage`) was still a hand-rolled `fixed inset-0 z-50` Tailwind
  overlay div, unlike its sibling `ProFeatureModal`/`UpgradeToProModal`/
  `CollaboratorsModal`, which the panel slice had already moved onto the shared
  `Dialog` component. Rebuilt it on `Dialog` with the same `bl-form`/`bl-scope-badge`
  pattern `ProFeatureModal` uses - same copy and behavior, now with native focus
  containment/return and Escape instead of a manual click-to-close div.
- `apps/web/src/features/share-links/ShareLinksPage.tsx` - the full share-link manager
  linked from `ShareProjectModal` ("Manage all share links"), `CollaboratorsModal`, and
  `AssetReview`'s "Share" link - was entirely unmigrated raw Tailwind (`text-text-muted`,
  `border-black/10`, `dark:` variants, a bare `<select>`, no shared `Dialog`, no
  confirmation before revoking a link). Rebuilt on `bl-wrap`/`bl-head`/`bl-table`/
  `bl-empty` for the link list, the same `.bl-create-link`/`.bl-setting-row`/
  `.bl-switch` fields `ShareProjectModal`'s create form already established for a "New
  share link" `.bl-settings-section` card, `.bl-access-state` for the active/revoked
  status pill, and a `Dialog`-based revoke confirmation (`bl-dialog-intro` +
  `bl-dialog-actions-bordered`, matching `ClientsPage`'s archive-confirm pattern)
  instead of revoking on a single unconfirmed click. Also switched its query key from an
  inline `["project", projectId, "share-links"]` array to the existing `qk.shareLinks()`
  factory so it shares cache invalidation with `ShareProjectModal` correctly.
- `NotificationBell.tsx` (global topbar chrome shown on every authenticated page, listed
  in Slice 01's own scope but never actually migrated) was still raw Tailwind
  (`bg-bg-surface`, `border-black/10`, `dark:` variants, a manual `position:fixed`
  click-outside backdrop with hand-rolled `zIndex` values). Rebuilt on the existing
  `.bl-dropdown`/`.bl-dropdown-pop`/`.bl-dropdown-trigger` popover system (same one
  `ProjectsPage`'s filter pickers use) and the shared `useOnClickOutside` hook instead of
  a manual backdrop div; added `.bl-notif-panel`/`.bl-notif-head`/`.bl-notif-empty`/
  `.bl-notif-badge` to `backline.css` alongside the pre-existing `.bl-notif-item`/
  `.bl-notif-route` rules, using `var(--amber)` for the unread badge instead of the old
  Tailwind `recovery-orphaned` red (amber is this brand's "waiting for you" color per
  AGENTS.md, not a warning/error). The topbar icon-button sizing rule
  (`.bl-topbar-actions>.relative>button`) depended on a bare Tailwind `.relative`
  wrapper class as its CSS hook; extended it to also match
  `.bl-topbar-actions>.bl-dropdown>.bl-dropdown-trigger` so the bell keeps the same
  34px topbar sizing as its siblings under its new, correctly-named wrapper.
- `NotFoundPage.tsx` (the router's catch-all `*` route) and the loading/error states of
  `AuthCallbackPage.tsx` and `ClickUpOAuthCallbackPage.tsx` (Google/ClickUp OAuth
  redirect landings) were still raw Tailwind full-screen divs. Rebuilt all three on the
  existing `.bl-review-gate`/`.bl-loading-mark`/`.bl-review-gate-copy`/
  `.bl-review-eyebrow` full-screen gate pattern `ProjectLayout.tsx` already uses for its
  own error/not-found states, and `<LoadingScreen>` for the in-progress states.

**Found but deliberately not fixed here (out of scope for a quick verification pass,
flagged as separate follow-up tasks):**

- `apps/web/src/features/board/BoardPage.tsx` and its `BoardHeader`/`KanbanBoard`/
  `ListTable` subcomponents (the project-level comment kanban/list at
  `/w/:workspaceSlug/p/:projectId/board`, linked live from `ActivityPage`'s feed rows)
  are still entirely on the pre-migration Tailwind system. This is confirmed reachable,
  not dead code, and was missed by every one of Slices 01-09 despite the "audit every
  post-login route" mandate - but it's a multi-file, feature-rich surface (drag/live
  WebSocket updates, ClickUp/Trello task creation, bulk actions) whose full migration is
  slice-sized work, not a quick fix. Flagged for a dedicated follow-up pass rather than
  rushed here.
- `apps/web/src/features/workspaces/WorkspaceHomePage.tsx`, and the `ProjectCard.tsx`/
  `NewProjectMenu.tsx`/`NewProjectModal.tsx` it alone consumes, are dead code (not
  imported by `router.tsx` or anything else reachable - superseded by `ProjectsPage.tsx`)
  still sitting in raw Tailwind. Left untouched and flagged for deletion rather than
  migrated, since migrating unreachable code would be wasted work.
- A pre-existing, low-severity one-off: `CommentRow.tsx`'s "Delete thread" menu row uses
  an inline `color:"#A8401F"` (matching `.bl-button.danger`'s background, not the
  `--bl-error` token) instead of the established `.bl-dropdown-item.danger` class. Left
  as-is - harmless, pre-dates this pass, and outside the 8 files this slice touched.

**Verification run (deferred by the original slice prompt, actually executed for this
verification pass):** `tsc -b --noEmit` passes with zero errors; `eslint .` reports 0
errors (4 pre-existing warnings in files unrelated to this pass -
`ActivityPage.tsx`'s pre-existing `useMemo` dependency warning, and unrelated
`react-refresh/only-export-components` warnings in `BrowserMenu.tsx`/`ViewportMenu.tsx`);
`vite build` succeeds with only the pre-existing large-chunk warning. The `/login` route
was loaded in a local dev server (no backend available, so only backend-independent
pages could be checked) and rendered correctly with no CSS regressions. Not run: full
authenticated browser/keyboard/responsive QA of the specific pages changed (`Members`,
`Settings`, `Integrations`, `Billing`, `Usage`, `Mcp`, `Clients`, `Activity`,
`ShareLinksPage`, the notification popover) - these need a running backend and a real
session, which were not available in this environment.

## 2026-09-08: Post-login UI consistency audit and polish (Slice 09)

- Completed a consistency pass across the post-login settings family and guest routes (`SettingsPage`, `IntegrationsPage`, `BillingPage`, `UsagePage`, `McpServerPage`, `MembersPage`, `ClientsPage`, `ActivityPage`) to align with `backline-Final Draft.html` and `backline.css`.
- Standardized the left-to-right settings layouts using a new `.bl-settings-section` class in `backline.css`, eliminating inline `display: flex; gap: 40px` and fixed-width header overrides that had broken the brand geometry.
- Consolidate loading states by replacing unstyled `<p className="bl-mono">Loading...</p>` or `Loading clients…` text with the shared `<LoadingScreen />` component across all audited routes.
- Standardized empty state heading structures and replaced raw text glyphs (like `🔍`) with proper `@backline/ui` icons (`SearchIcon`).
- Switched the workspace rename success/error feedback in `SettingsPage` from hardcoded inline text to use the shared `useToast` pattern.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview, browser QA, and responsive screenshot comparison. The source diff was inspected, but visual verification is still required.

## 2026-09-08: Guest review entry and asset review slice (Slice 08) — verification and fixes

A prior session had already restyled `ReviewEntryPage`, `GuestBoard`, and `AssetReview`
onto the `bl-`/reference-HTML visual language, but left the change uncommitted and never
recorded in this ledger. This entry covers auditing that work against `backline-Final
Draft.html`, `apps/web/src/styles/backline.css`, and the generated API types, and fixing
what verification found before committing it.

**Confirmed defects found and fixed:**

- **Functional bug (guest board always looked empty):** `GuestBoard.tsx` grouped board
  items under invented status keys (`new`/`prog`/`rev`/`block`/`done`) that don't exist
  on `GuestBoardItemOut.status` (`todo`/`in_progress`/`in_review`/`blocked`/`resolved`/
  `wont_fix` per `packages/types`). Every column's `items.length` was always `0`, so a
  client with real board items would see "No items yet." Fixed to group by the real
  `WORKFLOW_STATUSES` from `@backline/ui`, and to color the read-only status pill with
  `STATUS_COLORS` like the real ticket `StatusSelect` does.
- **Type error (would fail `tsc -b`):** `AssetReview.tsx`'s comment list read
  `c.assignee_names` off a `CommentOut`, which only carries `assignee_id`/`assignee_ids`
  - `assignee_names` only exists on the unrelated `GuestBoardItemOut`. Removed the
    invalid read; `tsc -b --noEmit` and `vite build` now both pass clean.
- **Unstyled/broken UI (real regression, not just missing polish):** the gate
  (`ReviewEntryPage`'s name/passcode modal, its "You're in"/"Taking you to the
  site"/loading/error states) and the asset comment composer's tag-pill picker used
  class names lifted verbatim from the reference HTML's own embedded `<style>`
  (`scrim`, `modal`, `gate`, `modal-head/body/foot`, `field`, `hint`, `btn-solid`,
  `btn-quiet`, `cp-sec`, `cp-tags`, `cp-tag`, `cp-foot`, `cp-cancel`, `cp-post`, `ball`,
  `ballrow`) that were never ported into `backline.css` - none of those selectors exist
  there, so every guest who opened a review link would have hit a completely unstyled
  gate and comment composer. Ported the needed rules into `backline.css` under the
  project's `bl-` naming convention (`bl-gate-*` for the gate, `.bl-review-comments
  .cp-*` scoped to the composer) instead of adding the bare reference-HTML class names,
  to avoid polluting the global class namespace; reused the existing `bl-button`/
  `bl-quiet` button system instead of adding a second `btn-solid`/`btn-quiet` one, and
  reused the existing `bl-chip`/`bl-chip-row` instead of the unstyled `ball`/`ballrow`.
- **Missing slice-required coverage:** guest session recovery and leave/re-enter
  controls, named explicitly in the slice brief, were entirely absent. A guest who
  refreshed `ReviewEntryPage` (or an asset/PDF/image guest, who has no widget and lives
  entirely inside `AssetReview`) was re-asked for their name every time, with no way to
  intentionally end a guest identity. Added `features/review/guest-session.ts`
  (sessionStorage, same key/scope contract as `apps/widget/src/guest-session.ts`) so
  `ReviewEntryPage` recovers an existing session before showing the gate and persists a
  new one on creation; added a `.bl-guest-bar` ("Reviewing **X** as Y" + "Leave review")
  to `AssetReview` and `GuestBoard`, reusing the reference HTML's `.gbar` guest banner
  concept instead of `AssetReview`'s prior hardcoded-hex "Restricted Mode" banner, which
  also violated the amber/ink token contract.
- **Missing slice-required coverage:** offline messaging. Guest surfaces render outside
  `WorkspaceLayout` and never get its WebSocket-derived `bl-conn-banner` (that store is
  scoped to the authenticated workspace socket). Added `lib/use-online-status.ts`
  (`navigator.onLine` + online/offline events) and reused the existing `.bl-conn-banner
  .offline` styling in both `AssetReview` and `GuestBoard`.

**Confirmed correct, not changed:** the guest re-anchoring restriction already in the
uncommitted diff (drag-to-move/resize an *existing* pin is blocked for guests via
`!guest` guards on the pointer-down handlers; placing a *new* draft pin/comment remains
allowed) matches the permission contract recorded in the 2026-09-08 cross-session audit
entry below - guest manual reanchoring stays member-only, and the frontend now matches
that instead of only relying on the backend's 401.

**Verification run:** `tsc -b --noEmit` (apps/web) passes with zero errors; `eslint` on
every touched/added file (`ReviewEntryPage.tsx`, `GuestBoard.tsx`, `AssetReview.tsx`,
`guest-session.ts`, `use-online-status.ts`) reports nothing; `vite build` succeeds with
only the pre-existing large-chunk warning. A scripted className scan confirmed every
`bl-`/`cp-`/`gate`-family class referenced by the three migrated files now has a
matching selector in `backline.css` (the only unmatched names are `ml-2`, a real
Tailwind utility class still active app-wide, and the fully inline-styled
`bl-asset-pin-resize-handle`/`bl-asset-pin-border`/`cp-body`, which never needed a CSS
rule). Not run: backend tests, live browser/guest-journey QA, and responsive/mobile
keyboard screenshot comparison - these need a running backend and were out of scope for
this pass.

**Left untouched:** `apps/web/src/features/integrations/IntegrationsPage.tsx` had an
unrelated uncommitted local modification (a `LoadingScreen`/`bl-settings-section`/
`var(--bl-error)` cleanup) present in the working tree that this session did not make.
It was excluded from this commit to preserve it as the existing, unrelated user change
it appears to be.

## 2026-09-08: Post-login UI migration — settings family slice

- Migrated `MembersPage`, `IntegrationsPage`, `SettingsPage`, `BillingPage`, `UsagePage`, `McpServerPage`, and `AccountModal` as a single unified settings-family system.
- Rebuilt all pages using the established Backline brand from `apps/web/src/styles/backline.css`. Implemented a consistent left-to-right information hierarchy (`<section className="bl-attention" style={{ display: "flex", gap: "40px" }}>`) with the section header pinned to the left and controls/information on the right.
- `MembersPage` uses `.bl-wrap`, `.bl-head`, `.bl-toolbar`, and `.bl-table`. Role updates and team invites use the standard inputs and `Dialog` respectively.
- `AccountModal` now uses the shared `Dialog` component instead of inline styles for its layout, mapping profile/preferences/sessions controls to a neat left-to-right flow with the user avatar locked to the left.
- `IntegrationsPage` preserves all OAuth and Webhook inputs but drops them into the left-to-right card layout with `.bl-button` and `.bl-input`.
- Billing, Usage, and MCP Server pages are honest and intentional: unavailable features look deliberately disabled rather than simulating backend success or fake AI metrics.
- Preserved React Router structure, React Query mutations/keys, components like `UpgradeToProModal`, authentication verification, and workspace state exactly as they were. No API contracts or backend logic were touched.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview, browser QA, and responsive screenshot comparison.

### 2026-09-08: Verification pass on the settings-family slice

- Audited the slice above against `backline.css` (every `bl-` classname and `var(--bl-*)`
  token used across all 7 files was checked against the stylesheet's actual selectors and
  the `:root` custom-property block, not assumed) and against each file's pre-migration
  version to confirm no functional/API regression. Found and fixed:
  - **Real bug:** `SettingsPage.tsx`'s workspace-rename success message used
    `var(--bl-mint-deep)`, which is not defined anywhere in `backline.css` (only the plain
    `--mint-deep` token and a `--bl-` alias set that excludes it exist) - the confirmation
    text would have rendered in an unstyled/inherited color instead of the intended mint.
    Changed to `var(--mint-deep)`.
  - **Dead imports left over from the restyle:** `Button` from `@backline/ui` was imported
    but no longer rendered (replaced by plain `.bl-button` elements) in `SettingsPage.tsx`,
    `MembersPage.tsx`, and `IntegrationsPage.tsx`; `IntegrationsPage.tsx` also still imported
    the now-unused `disconnectLogo` icon after the disconnect button was simplified to plain
    text. Removed all four unused imports.
  - **Missing states called for by the slice brief:** `MembersPage` had no empty state for a
    zero-result search (silently rendered an empty table) and no error state for the
    `listMembers` query; `IntegrationsPage` had no error state for the `listIntegrations`
    query (only mutation errors were surfaced). Added the established
    `.bl-empty`/`.bl-error` patterns already used by `ClientsPage`/`TicketsPage`
    (search-aware empty copy, `role="alert"` error text), matching existing conventions
    rather than inventing new ones.
- Confirmed as correct, not touched further: `BillingPage`, `UsagePage`, and
  `McpServerPage` are faithful 1:1 restyles of their prior Tailwind versions onto the `bl-`
  system with no content or behavior loss; `AccountModal`'s and `MembersPage`'s hand-rolled
  dialog markup was correctly replaced by the shared `Dialog` component; all mutations,
  query keys, and the honesty contract (no fake checkout/AI/connection success) were intact
  before this pass and remain intact.
- One pre-existing, harmless issue left as-is (not introduced by this slice, not worth the
  diff): `AccountModal.tsx` applies a `bl-form-field` class to two label wrappers that has
  never been defined in `backline.css` at any point in this repo's history; both wrappers
  already carry full inline flex styles, so this is dead markup with no visual effect.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview,
  browser QA, and responsive screenshot comparison. This was a source-level audit plus
  targeted fixes; visual/interaction verification of the fixes above is still required.

## 2026-09-08: Post-login UI migration — clients and activity slice (corrected)

- A prior uncommitted pass at this slice rewrote `ClientsPage`/`ActivityPage` onto
  classnames copied verbatim from `backline-Final Draft.html`'s own embedded
  stylesheet (`.wrap`, `.head`, `.toolbar`, `.search`, `.rows`, `.cl-row`, `.cl-head`,
  `.act`, `.act-day`, `.act-ic`, `.card-new`, `.sel`, `.kbd`, `.btn-new`, `.btn-solid`,
  `.btn-quiet`, `.modal-body`, `.modal-foot`, `.field`, `.req`, `.hint`, `.ghost-btn`,
  `.chipf`, `.top-right`, `.seg`, `.plus`). None of those selectors exist in
  `apps/web/src/styles/backline.css` — confirmed by grepping the stylesheet for every
  one of them — so both pages would have rendered with no brand styling at all
  (default block/inline layout, no ink/paper/mint treatment, no 3px geometry). This
  violated the base prompt's "follow the established Backline brand from
  apps/web/src/styles/backline.css" / "reuse existing … shared components" rule. This
  entry replaces that pass; the earlier log text above it is no longer accurate and is
  superseded by this one.
- Rebuilt `ClientsPage` on the real `bl-` design system already used by every other
  migrated route: `.bl-wrap`/`.bl-head`/`.bl-head-actions`, `.bl-toolbar.wrap` +
  `.bl-search` (the same label/icon-span/input markup `ProjectsPage` uses) with an
  Escape-to-clear key handler, `.bl-table`/`.bl-table-wrap` for the row list (the same
  primitive the pre-existing `ClientsPage` and `MembersPage` tables use), `.bl-avatar`
  + `.bl-text-button` for the client/contact lockup, `.bl-chip`/`.bl-chip-row` for the
  linked-project list capped at 3 with a "+N more" chip, `.bl-select` for the existing
  row-actions dropdown, and `.bl-empty` for the empty state. The add/edit dialog now
  uses `Dialog` + `.bl-compact-form`/`.bl-required`/`.bl-input` (the same field
  grouping `ProjectForm`/`ProjectMenu`'s rename dialog use) and the archive
  confirmation uses `.bl-dialog-intro` + `.bl-dialog-actions` with `.bl-quiet`
  (cancel) / `.bl-button danger` (confirm) — the same confirm-footer pattern
  `ProjectMenu`'s `ConfirmAction` uses — instead of an unstyled ad hoc footer.
- Rebuilt `ActivityPage` on `.bl-tabs` for the event-type filter (the same
  underline-tab component `ProjectsPage`'s type tabs use, not a bespoke `.seg`),
  `.bl-group-title` for day headers, and the pre-existing `.bl-activity` card/article
  list (already defined in `backline.css` for exactly this page). Added one
  genuinely new but on-brand touch: a per-event-category color (`EVENT_META`, a
  `Record` of `{icon, color}` keyed by the event-type prefix), the same "small local
  colour map applied via inline `style`" convention `PRIORITY_META`/`STATUS_META`
  already use in the comments panel, painted onto the existing `.bl-avatar` icon slot
  instead of introducing new circular icon CSS. Pagination uses the existing
  `.bl-pagination` component instead of one-off inline styles.
- No behavior/data-contract changes: client-side search against the loaded client
  array, the archive/create/update mutations and their query-key invalidation, and
  activity's offset/event-type/date-grouping query all match the pre-existing
  contracts exactly — only markup and class names changed.
- Also reverted one unrelated stray whitespace change (trailing spaces on a
  ` ```text ` fence line) in `docs/implementation/10-ui-migration-chat-prompts.md`
  left over from the same prior pass.
- Not run at the user's request: lint, typecheck, build, automated tests, local
  preview, browser interaction QA, keyboard journey QA, and responsive screenshot
  comparison. Every classname used was verified against `backline.css` by direct
  grep (not assumed), but the file has not been rendered in a browser in this pass —
  visual/responsive verification is still required before this is considered done.

## 2026-09-08: Post-login UI migration — workspace tickets slice

- Migrated `TicketsPage` and its component tree to the Final Draft's workflow surface,
  reusing the priority/status/due-date visual language the comments-panel slice already
  built (`PRIORITY_META`, `STATUS_META`, `dueMeta` in
  `features/projects/panel/comments/types.ts`) instead of a second copy, plus the
  shared `Dialog`, `Avatar`, `bl-comment-popover`/`bl-review-menu-row` popover pattern,
  and existing icon set.
- Added `TicketToolbar` (Sort / Group / "Show work for" popovers, replacing three plain
  `<select>`s) matching the root HTML's `tsortPop`/`tgrpPop`/`whoPop`; a new dense
  `TicketRow` list view (priority bar, single-line title/subtitle, status and priority
  quick-edit, tag filter chips, stacked assignee avatars, due badge) alongside the
  existing `StatusSelect`/priority-select/date-input inline editing so list mode kept
  every control table mode already had; and a `TicketTable` with sortable column
  headers (Project/Status/Priority/Due, driving the same `sort` URL param the toolbar
  does) and a click-to-filter project-name cell. Board and calendar cards gained a
  priority-colored edge, due badges, and stacked assignee avatars (board now takes a
  `members` prop); existing drag-to-change-status and drag-to-set-due-date persistence
  (already backed by the real `updateComment` mutation) were not touched.
- Added the header tab counts (Everyone/Assigned to me/Needs your reply/Waiting on
  client/Overdue) from the existing workspace dashboard summary query, a unified
  "Filtering by" active-filter chip row (status/project/priority/tag/assignee, each
  independently clearable), and empty-state "Show all tickets"/"New ticket" actions.
- `NewTicket` gained the due-date and tags fields `TicketCreate` already supports but
  the form omitted, using the same `DatePicker`/chip-toggle pattern as `TicketDetail`.
  A screenshot/attachment control is shown disabled with a "Coming soon" badge:
  `TicketCreate` has no attachment field, so this mirrors the root HTML's control
  without simulating an upload that would silently drop the file.
- Honesty decision, not a new product/interaction contract beyond TDR-0018/TDR-0019:
  the dashboard ticket-list API's `assignee` filter takes one value
  (`TicketFilters.assignee: str | None`), unlike the reference's in-memory multi-person
  filter, so "Show work for" is a single pick (selecting someone else replaces the
  previous selection) rather than a multi-select the backend cannot honor. No bulk
  ticket-selection UI was added — no bulk endpoint exists to back it.
- Existing React Router structure, all React Query keys/invalidation
  (`invalidateTicketsAndDashboard`), the `updateComment`/`createTicket`/`createReply`
  API calls, URL-encoded filters (search/status/project_id/priority/tag/view/sort/
  group/display/assignee/offset/ticket), and workspace authorization were preserved.
  No backend, database, generated API declaration, or widget file was changed.
- Not run at the user's request: lint, typecheck, build, automated tests, local
  preview, browser interaction QA, keyboard journey QA, and responsive screenshot
  comparison. The final diff was inspected for scope only; release verification,
  including confirming the new sortable-header/filter-cell/toolbar-popover markup
  compiles and renders correctly, remains required before this is considered done.

## 2026-09-08: Post-login UI migration — project side panel and comments slice

- Migrated `ProjectSidePanel` and its Comments/Details/Integrations/MCP/AI tabs off
  the pre-migration Tailwind theme onto the Final Draft `bl-` brand, reusing the
  vocabulary already shipped for `ShareProjectModal`, `TicketDetail`, and the review
  workspace toolbar rather than inventing a new one. TDR-0019 records the specific
  reuse, scope and behavior decisions.
- Rebuilt the `CommentsTab` tree (`StatusChips`, `FilterSortBar`, `ViewOptionsBar`,
  `CommentsList`, `CommentRow`, `comments/types.ts`): status label/color now come from
  `@backline/ui`'s shared workflow module instead of a second, drifting copy; added
  the previously-missing device-type and assignee filter sections; comment cards now
  show priority, due date (with overdue/due-today/due-tomorrow language), tags,
  assignee avatars, `@mention` highlighting, screenshot previews (and a capture-failed
  note), attachment chips, a layer badge (client-visible/team-only) on every row, and
  an anchor-recovery badge for orphaned/low-confidence comments. Loading uses real
  skeletons, and a dedicated error state with retry now exists (previously absent).
  Grouping by page resolves real page titles/URLs instead of a raw page id.
- Wired `CommentThreadPanel` into the Comments tab as an "open thread" action on every
  row (distinct from the row's existing click-to-navigate-to-pin behavior, which is
  preserved), and rebuilt it on the shared `Dialog` component with status, priority,
  tags, assignees, due date, and waiting-on/waiting-on-client editing - the same
  fields and components (`DatePicker`, `PeoplePicker`) `TicketDetail.tsx` already uses
  for the same underlying comment record. `BoardPage.tsx`'s existing usage is
  unchanged. Fixed a pre-existing bug where assignee/waiting-on ids were compared
  against the wrong member field (workspace membership id instead of user id),
  meaning a saved assignee could never show as selected again.
- Restyled `DetailsTab`, `IntegrationsTab`, `McpTab`, `AiTab`, `CollaboratorsModal`,
  `ProFeatureModal`, and `UpgradeToProModal` onto the same brand; `CollaboratorsModal`/
  `ProFeatureModal`/`UpgradeToProModal` now use the shared `Dialog` component (native
  modal semantics, focus containment/return, Escape) instead of hand-rolled overlay
  divs. MCP connectors, workspace-integration quick toggles, and BugHunt AI remain
  visibly static/gated - no fake connection, AI, or billing success was added.
- Existing React Query keys/invalidation, comment/reply/attachment API calls,
  workspace/member/share-link data, authorization boundaries, and the widget's
  `postMessage` pin-navigation contract were preserved. No backend, database,
  generated API declaration, or widget file was changed.
- Not run at the user's request: lint, typecheck, build, automated tests, local
  preview, browser interaction QA, keyboard journey QA, and responsive/mobile-sheet
  screenshot comparison. The final diff was inspected for scope; release verification
  is still required. One known pre-existing accessibility nesting concern was not
  changed in this pass: `CommentRow`'s clickable row (`role="button"`) still contains
  further interactive buttons (resolve/menu/reply), inherited from before this slice.

## 2026-09-08: Post-login UI migration — project review workspace slice

- Migrated `ProjectLayout` and the website `ProjectOverviewPage` to the Final Draft's
  focused review workspace: compact project/environment/URL header, URL-backed page,
  mode, viewport, orientation and zoom state, keyboard page-tab navigation, genuine
  open-review/share actions, safe-proxy browser frame, and a dense bottom status bar.
- Reworked the canvas around the existing private proxy and separately bundled widget.
  Loading, timeout/failure, no-link, snippet-only-link, cross-origin-page, archived,
  project-query and page/share-query states are explicit. No public proxy, layout mock,
  localStorage data, or simulated network success was added.
- Preserved widget-owned comment placement and navigation, and added a persistent
  selected comment row/status after the side panel asks the iframe to reveal its real
  pin. The panel launcher now uses the ink/paper/mint rail on desktop and a usable
  bottom launcher/sheet arrangement at narrow widths; the panel's full content
  migration remains Slice 04 scope.
- Rebuilt viewport and version controls with grouped responsive presets, bounded custom
  dimensions, real revision-history loading/empty/error/current states, and the shared
  React Query key factory. Browser emulation, deploy-triggered capture and alternate
  preview sources remain honestly unavailable rather than pretending to change server
  or widget behavior.
- Existing React Router structure, workspace authorization resolution, React Query API
  calls and cache updates, project/page/share dialogs, and website-versus-asset routing
  were retained. No backend, database, generated API declaration, or widget file was
  changed.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview,
  browser QA, responsive screenshot comparison, and end-to-end keyboard QA. The final
  source diff was inspected only; release verification remains required.

## 2026-09-08: Vercel frontend build regression fix

- Exported the shared `PlusIcon` and `SearchIcon` used by the committed projects
  dashboard. The exports had remained only in an unstaged local edit, so a clean
  Linux/Vercel checkout failed during `tsc -b` even though the Windows worktree had
  stale incremental output.
- Verified the pushed commit from a clean checkout with `pnpm --filter @backline/web
  build` (`tsc -b && vite build`); it passes with only the existing large-chunk warning.
- The local multi-service Vercel emulator completed the web service and then stopped at
  the unrelated backend service because `uv` is not installed in this environment.

## 2026-09-08: Post-login UI migration — project dialogs slice

- Migrated `ProjectForm` to the Final Draft's progressive create flow with the
  website/image/PDF chooser, honest roadmap types, client selection and inline client
  creation, domain-based environment detection with manual override, validated file
  selection and retry-safe uploads, and a real review-link success handoff.
- Rebuilt project settings around the five persisted review preferences. Device
  capture, reviewer resolution, and client-board controls retain their enforced
  behavior; deploy re-anchoring and client digest are explicitly marked `Saved only`
  because their execution paths are not connected yet.
- Migrated `ShareProjectModal` with real workspace members, owner/admin-only teammate
  invitation, clear workspace-versus-project access language, active-link loading/
  empty/error/copy states, enforced link-policy summaries, and genuine proxy-link
  creation. Link mutation beyond the existing create/revoke contracts remains routed
  to the share-link manager instead of being simulated in the modal.
- Migrated `ProjectMenu`, `ProjectPagesModal`, and the project lifecycle confirmations:
  icon-led keyboard-navigable actions; safe rename; archive/restore; duplicate; CSV
  export confirmation; responsive add/rename/reorder/remove page controls; and the
  owner/admin, archive-first, preview-and-name-confirmed permanent-delete contract.
  Deploy history and asset file management remain visible but disabled as coming soon.
- Existing React Query keys and invalidation, member/project/share/page/asset API calls,
  authorization boundaries, routes, and generated types were preserved. No backend,
  database, generated declaration, or widget files were changed.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview,
  browser interaction QA, keyboard journey QA, and responsive screenshot comparison.
  The final diff was inspected for scope and whitespace only; release verification is
  still required.

## 2026-09-08: Post-login UI migration — shell and dashboard slice

- Adopted the Final Draft's shared brand contract in TDR-0018 and added reusable,
  bounded prompts for continuing the migration route family by route family.
- Reworked the authenticated workspace shell with a persistent Backline lockup,
  global new-project entry point, platform-correct search shortcut, stable skip link,
  corrected URL-filter-aware navigation states, and a real off-canvas mobile drawer.
- Migrated the projects dashboard closer to the supplied HTML: prototype-style tabs,
  hatched section divider, refined waiting-on-you panel, deterministic website/image/
  PDF preview artwork, visible comment pins, card hover actions, URL/client hierarchy,
  improved list/table densities, and project-type-aware create cards.
- Existing React Query data, routes, mutations, authorization, and backend contracts
  remain unchanged. Dashboard card previews no longer iframe arbitrary third-party
  origins; real sites continue to render only in the dedicated project review flow.
- Not run at the user's request: lint, typecheck, build, automated tests, local preview,
  browser interaction QA, and responsive screenshot comparison. This slice therefore
  records implementation scope, not release verification.

## 2026-09-07: Requested main update

- Merged origin/main at 11fea12 while preserving local commit a5233a5; conflict decisions are recorded in TDR-0016. The pre-existing untracked gcm-diagnose.log is untouched.
- Passed: frontend typechecks, web/widget production builds (large-chunk warning), workspace-scoping check, and 9 security/scoping regression tests.
- Outstanding incoming-code checks: frontend lint reports 13 errors and 1 warning; backend Ruff reports 4 line-length errors in auth/router.py and notifications/repository.py; mypy reports 3 errors in auth/repository.py, auth/router.py and dashboard/service.py. The combined frontend check stopped on lint, so production builds were run separately and passed.
- Persistence/session/digest integration tests were not run: isolated MongoDB, Redis and S3-compatible services were not provisioned or verified for this pull. No shared-service fixtures were executed.

Date: 2026-09-06. This file tracks actual work; specification text alone is not evidence of delivery.

## Sequence

1. **Source and plan:** preserve HTML, index controls/behaviors, document PRD/flows/frontend/backend/database and amend spec index.
2. **Workflow foundation:** statuses, tags, priority, multi-assignee and clearable dates; backward-compatible models; scoped repositories/indexes.
3. **Workspace operations:** clients, project associations/environments/archive/restore, ticket/dashboard/activity APIs.
4. **Dashboard frontend:** draft design, navigation, project views, client UI, workspace ticket views and metadata editing, activity.
5. **Asset and review extension:** private image/PDF projects, persistent region review, sharing/policy enhancements.
6. **Account/provider flows [COMPLETED]:** profile/preferences/security; genuine AI and billing when provider configuration is available.
7. **Verification:** generated contracts, lint/typecheck/build, meaningful backend privacy/filter/mutation tests, live browser journeys, doc/status reconciliation.

## Current evidence

- Original HTML copied without executing its scripts. Inventory records 112 element IDs, 76 static controls and 158 action attributes including generated markup.
- Inspected existing React router/layout/features, FastAPI module boundaries, Mongo indexes, permissions, comment mutations and test infrastructure.
- Existing `.env.production.example` and `DEPLOYMENT.md` user modifications were present before this work and must be preserved.
- Plans and flow matrix authored before implementation.
- Implemented: workflow fields and filters; clients; project metadata and archive/restore; workspace dashboard, tickets and activity APIs; the Final Draft dashboard shell and project/client/ticket/activity screens; image/PDF asset upload and region review; private signed asset URLs; generated OpenAPI contracts; and the Final Draft documentation set.
- 2026-09-07: added the first global-search slice: a permission-gated, workspace-scoped API for active projects, root comments/tickets, and workspace members; workspace shell search UI with `/`, Cmd/Ctrl+K, and Escape; generated OpenAPI contracts; and the workspace-isolation/empty-query regression coverage. Search uses the bounded strategy in TDR-0013. Exact placed-comment routing, grouping/ranking, client search, and provider-backed text search remain open audit work.
- Frontend verification: `pnpm turbo run lint typecheck build` completed with 9 successful tasks. Vite reports the expected large PDF worker/application chunk warning; the production build succeeds.
- Backend verification: `ruff check app`, `mypy app/`, and `scripts/check_workspace_scoping.py` pass. The focused application suite passes with `37 passed` using isolated MongoDB, Redis and S3-compatible test services. A complete run reached `186 passed`, then 7 realtime assertions and 4 fixture cleanup cases failed after the local `fakeredis` TCP emulator dropped pub/sub connections; the affected product modules were unchanged by this work.
- Source limitations recorded: the reference HTML was indexed without executing its mock scripts, and local browser policy prevented opening the copied `file://` reference for visual inspection. Product behavior was derived from its markup, labels, controls and action inventory, then implemented against the existing code architecture.

## 2026-09-08: Cross-session audit reconciliation

- A prior Claude review was reconciled with the current worktree. It identifies the next
  parity/UX verification targets as BoardPage URL state and deep links, guest-board
  frontend wiring, page add/reorder controls, hard-delete preview/confirmation UI,
  website-canvas comment move/resize, calendar drag/drop, website page tabs, status-label
  consistency, toast/confirm adoption, query-key consolidation, comment parent/reply
  normalization, debounced/scoped search, and the larger god-file/design-system/i18n
  cleanup items. These are audit targets, not claims that each item is complete or safe
  to implement without checking the current code and product decisions.
- The review confirms that guest manual reanchoring remains member-only under the existing
  permission matrix. Guest drag/resize affordances must therefore be hidden or disabled,
  and the 401 behavior should remain covered by a regression test; no guest privilege is
  inferred from the frontend review UI.
- Verification limits remain important: local emulator-backed checks are not production
  health evidence, and shared or cloud database fixtures must not be used. No credentials
  or connection strings from cross-session chat notes are recorded in this repository.

## 2026-09-08: God-file split handoff

- The cross-session audit work split the large frontend/widget files while preserving
  their existing public import paths and behavior: `TicketsPage`, `CommentsTab`, and
  `BoardPage` now delegate to feature-local components, and the widget `index.ts`/`ui.ts`
  logic is split into focused modules under `apps/widget/src`.
- FE-01/FE-02 query-key and comment-cache consolidation is included in the same working
  tree. The i18n rollout remains intentionally deferred; no completion is claimed for
  FE-07/FE-08 styling/icon cleanup beyond the work explicitly present in this batch.
- The handoff notes identified duplicate implementations across concurrent sessions;
  this delivery snapshot reconciles the current worktree versions before publication.
- This synchronization turn intentionally did not rerun tests or builds at the user's
  request. Earlier session-reported checks remain historical evidence and should be
  revalidated before the next release.

## 2026-09-07 — audit batch 02 (M-03, M-07)

- **Delivered:** replaced the direct project-document hard-delete with owner/admin-only
  preview and confirmation contracts. The preview enumerates the workspace-scoped graph
  and private object keys, reports counts and creates a one-hour plan. Confirmation
  requires the same actor, exact project name, explicit acknowledgement, an archived
  project and an unchanged graph. It locks the project, creates durable object
  tombstones, completes R2/MinIO cleanup, deletes Mongo dependencies in order and emits
  one correlation-ID summary event. Normal UI deletion remains recoverable archiving.
- **Delivered:** page deletion now refuses pages referenced by comments, revisions,
  revision diffs or project assets and returns the reference counts; deleting an empty
  page emits `page.deleted`.
- **Delivered:** additive named indexes for notification unread lookup, share-link
  project listing, normalized page URLs, revision current/history reads, recovery
  history, refresh-token families, event feeds and active OTP lookup. Authorized guest
  HTTP/WebSocket activity now refreshes `last_seen_at`; the existing 180-day TTL remains.
  The migration is dry-run by default and never drops or renames an index.
- **Evidence:**
  `docs/implementation/evidence/audit-batch-02-index-explain.json` seeds 2,500 documents
  per collection. All 11 representative queries move from `COLLSCAN` (2,500 examined)
  to plans containing `IXSCAN` (one document examined; one key except OTP at two). It
  also records the 15,552,000-second guest TTL and that no existing index was dropped.
- **Verification passed:** focused backend integration suite `38 passed`; full backend
  suite `219 passed, 1 failed`, with the sole failure an out-of-scope stale M-04 project
  settings assertion (`test_projects.py::test_create_and_list_projects`). Workspace
  scoping check passed; touched Python files pass Ruff; focused mypy passes. Generated
  OpenAPI JSON/TypeScript are reproducible. Touched frontend files pass ESLint, web
  typecheck passes and the production web build succeeds.
- **Baseline checks still red outside this batch:** full `mypy app/` has the existing
  `auth/repository.py:137` aggregate-pipeline type error; full web lint has 13 existing
  errors plus one warning in unrelated UI files; the monorepo lint/typecheck/build run
  stops on that lint task. These were not changed because this batch is limited to
  M-03/M-07.
- **Traceability:** FD-AUD-022 is partial overall (safe delete delivered; duplicate and
  export are separate M-13 scope). FD-AUD-048 is partial overall (safe page/revision/
  recovery retention delivered; deploy/version product UI remains separate). The
  M-03/M-07 portion of FD-AUD-051 is delivered with migration, TTL/GC and explain
  evidence. Detailed file/change/risk evidence is in
  `docs/implementation/audit-batch-02-report.md`.

## 2026-09-07: Login outage from comment request index

- Fixed the Railway startup E11000 reported in the supplied logs: the compound
  sparse unique index included legacy comments with missing/null request IDs.
  Startup now creates a uniquely named partial index for string request IDs only.
  Existing comments and indexes are preserved; workspace-scoped uniqueness remains.
- Added a dry-run-first inspection/apply command in
  `backend/scripts/migrate_comment_request_index.py`; see TDR-0017 for rollout and
  the limitation of installations that still retain the old sparse index.
- Passed: 15 focused tests covering real MongoDB startup with legacy records,
  repeated lifespan/preflight requests, scoped uniqueness, existing-index coexistence,
  Google login persistence/rejection, and security. Tests used isolated local MongoDB
  on 27027, Redis emulator on 6389 and S3 emulator on 9010; no production fixtures.
  The initial test attempt hit local S3 region configuration; setting the emulator
  region to us-east-1 resolved it.
- Passed: Ruff and mypy on changed Python files; workspace-scoping check; six
  frontend typecheck/build tasks (cached, existing large-chunk warning).
- Production rollout/health and an interactive fresh Google sign-in remain to be
  confirmed. No OAuth callback code from the report was replayed.
- Hotfix `7191804` was pushed to GitHub `main` from an isolated worktree based on
  `11fea12`; the same 15 tests passed on that exact deployment branch. Unpublished
  local account/session changes were preserved locally and excluded from the push.
  Direct production health requests timed out from this machine, and Railway CLI
  access was unavailable, so deployment success is not claimed.

## External dependencies and unresolved product decisions

AI provider authorization/configuration; billing provider/prices/webhook credentials; verified guest domain restrictions; real email delivery credentials; password/2FA/SSO policy. Core local implementation can proceed independently. The HTML's simulated accounts, fake 2FA QR, in-memory credits and checkout toasts must never be copied as working product behavior.

## Verification commands

`pnpm turbo run lint typecheck build`; backend `ruff check`, `mypy app/`, `pytest`, `scripts/check_workspace_scoping.py`; regenerate `packages/types` from locally exported FastAPI OpenAPI without requiring a production server. Integration tests require isolated MongoDB, Redis and S3-compatible storage. Record unavailable infrastructure honestly; never substitute test counts from the historical README.

## 2026-09-09: Slice 12 verification pass (M-21, M-22, FD-AUD-043/044/054)

- **M-21 (CI, OpenAPI drift, migrations, docs/TDR reconciliation)**:
  - Regenerated `packages/types/openapi.json` with the locked backend environment and
    `packages/types/src/openapi.ts` with `openapi-typescript`; a second run produced the
    same SHA-256 hashes. Added CI drift gates for both artifacts.
  - Re-ran `backend/scripts/check_workspace_scoping.py` from the same `backend/`
    working directory used by CI: passed across 17 repository files. The checked-in
    CI/test paths were already correct, so no path-only edit was fabricated.
  - Reconciled the actual stale specifications: Review SDK share-link auth
    (`07-Review-SDK.md`), URL-owned board/filter state (`14-State-Management.md` and
    `16-Dashboard.md`), and structural diff vs anchor matching
    (`10-Revision-Recovery.md`). The R2 UUID layout was already current in
    `18-Storage-Deployment.md`.

- **M-22 (Product decisions and low-risk parity polish)**:
  - TDR-0020 records the real desktop decision: keep the signed-in dashboard responsive
    below 1024px; do not conflate this with the unbuilt Web App/Mobile App project types.
  - `ProjectForm` no longer lets users change the inert `reanchor_on_deploy` and
    `client_digest_enabled` fields. It reports automatic recovery as always on and the
    client digest as unavailable while retaining legacy API readability.
  - Corrected generic coming-soon copy so it does not claim that image/PDF review is
    unavailable or promise a notification signup that does not exist; the legacy
    `/image-pdf` route now redirects to the real image/PDF-capable project list.

- **FD-AUD-043 (AI actions)** and **FD-AUD-044 (Plans and checkout)**:
  - Removed the simulated AI paywall/pricing route and fabricated zero-run/token metrics.
  - Removed simulated prices, seat totals, plan benefits and upgrade action. The UI now
    states that no provider, usage ledger, entitlements, checkout or charges exist.

- **FD-AUD-054 (Documentation reconciliation)**:
  - Updated the flow matrix, this delivery ledger, affected specs, TDR-0020 and the
    Batch 12 report with evidence/status that distinguishes delivered behavior from
    compatibility fields and placeholders.

Verification on the final working tree: `pnpm turbo run lint typecheck build` passed
(9/9 tasks; web build 591 modules; existing >500 kB chunk warning), backend `ruff check
.` and `ruff format --check .` passed (189 files), strict `mypy app/ scripts/` passed
(153 files), and workspace-scoping lint passed (17 repository files). No test suite,
browser/E2E/axe run, database migration, or production deployment is claimed.

## 2026-09-27: Client bug report - set-password from OTP flow, login UI fixes (TDR-0037)

Fixed six items from a client bug report against the sign-in/sign-up/forgot-password
screens (screenshots reviewed via the reported Google Doc):

- Added `POST /auth/password` (authenticated, 204): sets/replaces the caller's own
  password, reachable only after an OTP verify. `LoginPage`'s code-verification step now
  offers a "Set a password" panel (with "Skip for now") instead of navigating straight
  in. Closes both "update my password after the code" and "let a Google/OTP member
  create a first password" - same gap, same fix; see TDR-0037 for why the signup 409
  collision itself is unchanged.
- Fixed the double focus outline on login password/email fields (`.lg-f
  input:focus-visible`, previously a separately-darkened border plus an offset outline
  from the global rule).
- Wired up the previously-inert `.lg-caps`/`.capson` CSS: a Caps Lock badge on password
  fields (sign-in, sign-up, set-password), via `getModifierState("CapsLock")`.
- Replaced the signup password field's native `minLength` validation bubble with the
  app's own `.lg-err` message (`Use at least 12 characters.`), matching what the backend
  already enforces.
- Added spacing between an error message and the button that follows it (`.lg-err`
  `margin-bottom`), and centered the error icon on the message text instead of a
  flex-start + manual offset hack.
- Regenerated `packages/types/openapi.json` and `src/openapi.ts` for the new endpoint.

Merged `main` (which had landed TDR-0034's account-settings password/email change,
`has_password`, and the one-session-per-member model one day before this branch
started) back into this branch: only `docs/implementation/06-delivery.md` conflicted
textually (both sides appended a dated entry), resolved by keeping both, main's first
chronologically. The two password endpoints coexist by design (see TDR-0037's updated
Decision section); after `POST /auth/password` succeeds, the frontend now also patches
the in-memory user's `has_password` so TDR-0034's account-modal copy doesn't go stale
until the next token refresh. `packages/types` was regenerated fresh post-merge rather
than trusted from the text-level auto-merge, and produced an identical result.

Passed (post-merge, full tree): backend `ruff check app/` (166 files) and strict `mypy
app/` (166 files); `scripts/check_workspace_scoping.py` (19 repository files); frontend
`eslint .` (0 errors, pre-existing warnings unrelated to this change), `tsc -b
--noEmit`, and `vite build`. No test suite was written per this task's own instructions
(Claude Code: verify via lint/typecheck/build only). No interactive browser/E2E run,
database migration, or production deployment is claimed.

## 2026-09-26: Design parity slices - tickets, account/sessions, shell, card hover (TDR-0033, TDR-0034)

- **2026-09-26 Tickets design parity (design/index.html)**:
  - New ticket dialog rebuilt to the design: two-column fields, "Page or file" picker,
    single assignee/tag selects, and real screenshot uploads (TDR-0033: additive
    `TicketCreate.page_id` + `attachments`, both scope-checked).
  - List rows and the table use the design's status pill, mono priority chip, outlined
    tags and colored due text. Status (list and table), priority and due date (table)
    stay editable inline through the pills. The list no longer has a priority select;
    the colored bar shows priority, as in the design.
  - Assignee filter's empty state reads "All" instead of "Anyone".
  - Project card hover overlay lightened.
  - Verification: web `tsc --noEmit`, `eslint` (no new warnings) and `vite build`
    passed; backend `ruff check`/`ruff format` and `mypy` on `app/modules/dashboard`
    passed. Not run in a browser; no E2E run is claimed.

- **2026-09-26 Account, sessions and shell polish (design/index.html)**:
  - Account modal rebuilt to the design (Profile / Notifications / Security tabs):
    photo upload/remove, first/last name, email change confirmed by a code sent to the
    new address, password change. One active session per member: signing in elsewhere
    signs the other device out (TDR-0034). Language picker removed; app pinned to English.
  - Projects: Web App / Mobile App tabs show the design's in-page coming-soon panel
    instead of a modal (no notify button or target dates, per M-22).
  - Project settings footer regains its bottom padding; the rail and main column scroll
    without visible scrollbars; one shared hover (ink + underline) for text links.
  - Verification: web `tsc`, `eslint` (0 errors), `vite build`; backend `ruff check .`,
    `mypy app` passed. Not exercised in a browser; no E2E run claimed.

- **2026-09-26 Tickets and project card follow-ups**:
  - Resolved / won't-fix tickets sort below open ones under every sort (API pipeline
    `_closed` key, mirrored optimistically in the list) and render struck through.
  - Ticket ID badge restyled with its own fixed-width column in the list.
  - Tickets can be deleted from a list/table row (hover trash) or the ticket detail,
    with confirmation, through the existing thread moderation endpoint (`comment:delete`).
  - Project card hover rebuilt to the design: Duplicate + Share glass buttons beside
    the ⋯ menu (the gear "brightness" button is gone), white "Open Project" with an
    external-link icon and mint hover, URL + mint access badge.
  - Verification: `tsc -b`, eslint (0 errors), `vite build`; backend ruff + mypy on
    `app/modules/dashboard`. Not exercised in a browser.

- **2026-09-26 Tickets toolbar to design (#37a9, #37a7, #37a1)**:
  - Sort / Group / "Show work for" rebuilt to design's tsortPop / tgrpPop / whoPop:
    ghost buttons, SORT BY / GROUP BY labels, mint ticks, "Group: …" label; the people
    picker is multi-select (checkboxes, person marks, per-person counts, Unassigned,
    Clear / Done) and the button shows stacked faces or "N people".
  - API: `TicketFilters.assignees` (repeatable; any-of, incl. "unassigned"; the single
    `assignee` still works), new `assignee` / `tag` sorts, and `TicketListOut.assignee_counts`
    + `total_any_assignee` computed over the same filters minus the people filter.
  - #37a1 (page + screenshot in New ticket) was delivered in the earlier New ticket slice.
  - Verification: `tsc -b`, eslint, `vite build`; ruff + mypy on dashboard. The new
    aggregation was not run against MongoDB (none available locally).

- **2026-09-26 Design parity, area 1 - rail, topbar, search, notifications**:
  - Rail: workspace switcher at the top (ink/mint mark, "N projects · M people",
    up/down switch icon); design nav icons, "All tickets" label, ink active state with
    mint counts, mint "hot" count on Assigned to me; mono section labels; plan card in
    the design's style. The Backline brand row is gone (not in the design).
  - Switcher popover: SWITCH WORKSPACE label, lettered marks, role sub-line, tick on the
    current workspace, "Create workspace" row that reveals the form.
  - Topbar: design order (bell, New project, account); square initials/photo account
    button opens the Account modal directly (sign-out is inside it); design search copy
    and "/" hint; search results as icon tile + title + mono sub-line.
  - Notifications: mint unread dot instead of a number badge; rows with actor initials,
    bold actor name, mono relative time, mint tint when unread.
  - Kept on purpose: the WORKSPACE nav group (members, integrations, extension,
    settings) and the theme toggle, which the design has no place for; the plan card
    shows the real project count instead of the design's "2 / 3" meter (no plan limits
    exist).
  - Verification: `tsc -b`, eslint (0 errors), `vite build`. Not checked in a browser.

- **2026-09-26 Project card hover flicker**:
  - Hover no longer moves the card (a lifted card slid out from under a cursor near
    its edge and oscillated) and the overlay no longer uses backdrop-filter over
    scaling artwork (repainted every frame and flashed in Chrome). Hover is now the
    design's border + shadow change with a .13s opacity fade on a flat scrim.
  - Verification: `vite build` passed. Not checked in a browser.
# 2026-09-29: Authenticated native browser review (TDR-0048)

- Implemented one-click project-bound browser review for members and guests, using
  the real signed-in website tab, extension toolbar, server-side comments, page
  registration and native visible-tab screenshots. Retired the misleading cookie-sync
  control and cloud-login entry point; removed extension cookie permission.
- Verification completed locally: web/widget/extension typecheck, lint and production
  builds; 10 worker protocol checks (project/guest scope, OAuth origin, screenshot
  tab switch, upload, service-worker restart); isolated DOM toolbar/annotation checks.
- Full browser/API journey (password login, provider redirect, member/guest posts,
  screenshot upload and SPA page change) is checked in and ready to run against an
  isolated Mongo/Redis/S3 stack. It is **pending**, since this execution environment
  forbids Chromium/MongoDB sockets and the permission escalation was rejected.
  The owner declined a GitHub Actions gate; the temporary workflow was removed.
  Do not mark the feature production verified on the basis of the local checks.

# 2026-10-24: File review parity and product fixes (TDR-0146)

- Image/PDF review rebuilt on the website review workspace (header, file tabs, canvas,
  side panel, footer, floating composer). Team triage now works in place on files.
- Fixed: stray "0" rendered beside point pins; new comment not selected after posting
  (draft guard swallowed the navigation); panel and file canvas disagreed on the
  thread URL parameter; file projects created a website canvas session on every open;
  website hotkeys (C/B/D, page keys, ?) ran on file projects; zoom clipped the top of
  the file; composer autofocus failed so Esc/typing missed it; pin numbers were
  per-page indexes instead of ticket numbers; comment count covered only one PDF page.
- Fixed in shared UI: comment detail showed "Unknown page" / internal asset address
  for file comments; Details tab counted replies as comments, showed "Versions" and an
  empty URL link, and "Files 0" for file projects; AI tab offered for files; legacy
  projects without a type showed "Manage files"; file projects showed a website
  live/staging chip; share-links page offered website link types for files; project
  form fields had no spacing inside the fieldset.
- Verification: web typecheck, lint, build; manual Chromium checks on a local stack.

# 2026-10-24: Screen/voice recording and console & network capture (TDR-0147)

- Shipped the two Solo "Coming soon" capture features on every plan: Record screen /
  Voice note in all comment composers, and opt-in console/network failure capture
  in the widget and extension 0.5.0, scrubbed client- and server-side.
- Image/PDF comments now take attachments (files and recordings).
- Verification: ruff, mypy, lint/typecheck/build; Chromium end-to-end on a local stack
  (widget capture + recording upload, dashboard playback and diagnostics display).

# 2026-10-24: Backend access/SSRF hardening (TDR-0148)

- Fixed private-project bypass on the implementation-prompt route, DNS-rebinding SSRF
  in the proxy/webhooks/GitLab, guest exposure of staff ticket fields and team-thread
  replies, guest mention/delete/resolve gaps, extension tokens surviving sign-out,
  owner-role races, one-time ticket double redemption, inflated page comment counts,
  unbounded notification limit, cross-tenant client-list scans and per-URL boto3
  clients.
- Verification: ruff/format/mypy/scoping; guarded-connect probe; guest/widget flows.

# 2026-10-24: Web App and Mobile App projects (TDR-0149)

- Web App (website + steps to reproduce + diagnostics) and Mobile App (build/device
  screens in a phone frame, build filter) replace the last project-type Coming soon
  items. Fixed snapshot hash validation that made every widget page-version capture
  fail. Extension 0.5.1.
- Verification: static checks; Chromium creation and review of both types.

# 2026-10-24: Client branding, review domains, white-label (TDR-0150)

- Team/Enterprise branding on client review pages, TXT-verified review domains with
  optional Vercel attachment and a branded portal landing, Enterprise white-label.
  Cloud login removed from pricing (infrastructure-gated, TDR-0065).
- Verification: static checks; Chromium settings + branded guest review.
- Operator follow-up: set `VERCEL_API_TOKEN`/`VERCEL_PROJECT_ID` to auto-attach
  verified domains, or attach them manually in Vercel.

# 2026-10-24: Review-driven fixes, multi-device sessions (TDR-0151)

- Fixed ~20 dashboard/backend issues found by a full product walk-through (see TDR).
  Sessions: up to 5 devices. Access logs no longer contain tokens.
- Operator follow-up: run `python -m scripts.migrate_ticket_numbers --apply` once to
  number legacy/sample tickets.

# 2026-10-24: Realtime fan-out, capture trust, version polling (TDR-0152)

- Realtime events reuse cached access checks (5 s, cleared on access changes) and send
  concurrently. Guest-supplied near-empty or unrelated page captures no longer detach
  tickets. Extension 0.5.2 polls a comment-list fingerprint instead of the full list.
- Operator follow-up: publish extension 0.5.2 to the Chrome Web Store.

# 2026-10-24: One ticket view (TDR-0153)

- Tickets page, board, search, activity and notifications open the same ticket dialog
  (editable text, delete, live fields, conversation). Search finds "#14".

# 2026-10-24: Activity context, navigation names (TDR-0154)

- Activity rows name the client and project, label replies, collapse repeats; the
  Clients filter shows client actions. Sidebar labels match page titles; AI usage moved
  under AI.

# 2026-10-24: Client projects, open filter, extension actions (TDR-0155)

- Clients can take existing projects; "N open" links filter to open tickets; extension
  setup leads with Download; toasts no longer cover the top bar.

# 2026-10-24: Sign-in fix, MCP token expiry, page race (TDR-0156)

- Fixed sign-in occasionally revoking itself (wrong sort field). MCP tokens expire
  (default 90 days). Comments can't land on a page deleted at the same moment.
- Operator follow-up: `python -m scripts.migrate_event_projects` (dry-run), then
  `--apply`.

# 2026-10-24: First-run workspace, client search (TDR-0157)

- New accounts get a prefilled "Create your workspace" step. Search finds clients (for
  members who manage clients) and labels comment results as tickets.

# 2026-10-24: MCP fix-and-verify loop (TDR-0158)

- Agents report fixes with `submit_fix` (summary, preview and PR links → In review);
  the team verifies from a fix card (Verified – resolve / Reopen). Partially closes
  FEAT-12 (no automated verification run).

# 2026-10-25: Stale build recovery (TDR-0159)

- Fixed "Failed to fetch dynamically imported module" after deploys: assets aren't
  rewritten to index.html, stale chunks reload into the new build, friendly error page.
  Phone chips/tags no longer stretch to 44px.

# 2026-10-25: Site-loading guidance, store link (TDR-0160)

- YouTube/Google/social sites show an up-front "works best with the extension" banner;
  preview failure states no longer overlap the frame. Optional `VITE_EXTENSION_STORE_URL`
  for "Add to Chrome". Extension 0.5.2 store package ready (see Web Store handoff).
- Operator follow-up: submit 0.5.2 to the Chrome Web Store; set
  `VITE_EXTENSION_STORE_URL` after approval.

# 2026-10-25: File load failure states (TDR-0161)

- Missing stored files return 404 FILE_MISSING; file projects show Manage files/Retry
  and an accurate status bar instead of an endless "Loading…".

# 2026-10-25: Preview on sites with the snippet (TDR-0162)

- Sites that already embed Backline no longer show "review session ended" / a second
  toolbar in the preview. Local-only `ALLOW_PRIVATE_NETWORK_TARGETS` for previewing
  localhost sites in development.

# 2026-10-25: Notification context, tracker in ticket view (TDR-0163)

- Notifications show ticket number, text and project; the shared ticket view can send
  to connected trackers.

# 2026-10-25: Client reply/resolved emails (TDR-0164)

- Clients can leave an email on the review link and get emailed (throttled) when the
  team replies or resolves their feedback. Requires the Arq worker and email provider.

# 2026-10-25: File versions (TDR-0165)

- Images/PDFs can get new versions from Manage files; earlier versions keep their pins
  and stay viewable. Closes SUG-09's first step (no pin migration by design).

# 2026-10-25: Accessibility pass (TDR-0166)

- axe-core WCAG A/AA clean on all main pages (light + dark): ticket rows no longer nest
  controls in a button, dark-mode count contrast, ARIA roles.

# 2026-10-25: API compression, file review polling (TDR-0167)

- API JSON and the widget script are gzip-compressed (100x smaller comment lists in the
  seeded test); file review re-downloads comments only when they change.

# 2026-10-25: Security headers (TDR-0168)

- Dashboard can't be framed; nosniff/referrer/permissions policies on dashboard and API;
  API JSON is not cached.

# 2026-10-25: Extension + snippet coexistence, extension 0.5.3 (TDR-0169)

- A site's own Backline snippet steps aside while the extension reviews the tab.
  End-to-end extension run verified locally. Submit 0.5.3 to the Web Store.

# 2026-10-25: Extension popup, 0.5.4 (TDR-0170)

- Popup shows the active review or the Open-with-extension path; token setup is
  advanced. Submit 0.5.4 to the Web Store.

# 2026-10-25: Carry open comments to new versions (TDR-0171)

- New file versions can take over the previous version's open comments (opt-out per
  upload); resolved ones stay on the old version.

# 2026-10-25: BugHunt availability, version count wording

- BugHunt AI disables "Analyze this project" with a reason when the server has no AI
  provider or the workspace is out of credits (same `ai-usage` data as the AI page).
  Version menu says "1 version". Verified in Chromium; lint/typecheck/build.

# 2026-10-25: Reviewers manage their own comments, extension 0.5.5 (TDR-0172)

- Edit / Delete / Mark resolved on your own comment in website, extension and image/PDF
  review; deleting a comment with replies is refused. Submit 0.5.5 to the Web Store.

# 2026-10-25: One-time review handoff code (TDR-0173)

- "Open website review" now passes a single-use, two-minute code instead of the guest
  session token and name in the reviewed site's URL (FLOW-01).

# 2026-10-25: Open the selected thread on the live site, extension 0.5.6 (TDR-0174)

- "Open with extension" from a selected thread lands on the live page with that
  thread open (FLOW-05). Submit 0.5.6 to the Web Store (supersedes 0.5.5).

# 2026-10-25: Reply attachments, extension 0.5.7 (TDR-0175)

- Reviewers can attach files to replies on websites, in the extension and in image/PDF
  review; the widget now shows attachments on replies. Submit 0.5.7 (supersedes 0.5.6).

# 2026-10-25: Optional automatic screenshot, extension 0.5.8 (TDR-0176)

- Reviewers can untick "Add an automatic screenshot of this page"; such comments are
  stored as `capture_status: skipped` and labelled in the dashboard.

# 2026-10-25: Ticket bulk triage (TDR-0177)

- Select tickets in List/Table and set status, priority or assignee for all of them.

# 2026-10-25: Printable review report (TDR-0178)

- Project menu → Review report: client-ready summary of feedback by page/file, printable
  or saved as PDF.

# 2026-10-25: Undo for closing tickets and bulk changes (TDR-0179)

- Undo after resolving/closing a ticket on the Tickets page and after a bulk change.

# 2026-10-25: Contrast fixes (TDR-0180)

- Status badges, table priority labels and light client brand colours meet WCAG AA.

# 2026-10-25: Client updates decision, touch hint (TDR-0181)

- FEAT-09 decided: per-event client emails, no client digest; inert setting stays hidden.
- Keyboard hint hidden on touch screens.

# 2026-10-25: Unreferenced upload cleanup script (TDR-0182)

- `scripts.gc_unreferenced_uploads` (dry-run first) removes uploads no comment ever
  used and returns their quota. Operator: run the dry run, review, then `--apply`.

# 2026-10-25: API reference link, extension 0.5.9

- API keys page links the public API reference (`/docs`). Extension 0.5.9 rebuilt so the
  store package matches the current widget source. Submit 0.5.9.

# 2026-10-25: Digest counts and due reminders (TDR-0183)

- Daily digest shows how many new comments arrived and the member's overdue / due-soon
  tickets (counts only, link-only); due tickets alone trigger a reminder.

# 2026-10-25: File version approval (TDR-0184)

- Clients and the team can approve the latest version of an image/PDF; the uploader is
  notified; activity and the review report show it.

# 2026-10-25: File approval on project cards (TDR-0185)

- Project cards/table show how many current files are approved once any are.

# 2026-10-25: Approval email (TDR-0184 addendum)

- File approvals are emailed (link-only) to opted-in uploaders.

# 2026-10-25: Move pin (TDR-0186)

- Editors can move or re-pin a website comment by clicking its new element in the canvas.

# 2026-10-25: Reviewer toolbar on the real site (TDR-0187)

- Clients get Browse / Comment / Draw on the reviewed site, so they can navigate it and
  leave area comments.

# 2026-10-25: Friendly network errors; offline acceptance (QA-03)

- The widget and guest file review say "Can't reach Backline - check your connection"
  instead of the browser's "Failed to fetch". Local acceptance: a comment posted while
  offline showed "Saving is unconfirmed" with Retry save; after reconnecting, Retry saved
  it and exactly one record existed.

# 2026-10-25: Backend test suite status (no regressions)

- `uv run pytest` on current main: 241 passed, 33 failed. The same 33 tests fail, by
  name, on `c2a956c` (before this round's changes), so none is a regression. They are
  stale against later deliberate designs: digests are prepared durably instead of sent
  inline, uploads must be real project keys, snapshot hashes must be sha256 digests,
  realtime `connect()` requires an access check, idempotent retries with a different
  body return 409, OTP/share-link response wording, proxy streaming with the test
  client, and provider fixtures. Per AGENTS.md this round verified with lint, typecheck,
  build and browser runs rather than rewriting the suite; updating those tests is open.

# 2026-10-25: Dashboard Content-Security-Policy (TDR-0188)

- The web app now sends a full policy (own scripts only, no inline script or eval); the
  theme bootstrap moved to `public/theme-init.js`. Verified with zero violations across
  the dashboard, previews, file/PDF review and guest pages.

# 2026-10-25: Screenshot preview; captures match the screen (TDR-0189)

- Composer **Preview**/Retake shows the automatic screenshot before posting and attaches
  that exact image (snippet, review link, canvas, extension).
- Fixed: snippet captures always showed the top of the page, and transparent page
  backgrounds came out black.

# 2026-10-25: Abandoned upload grants release their quota (TDR-0190)

- A presigned upload whose file never arrived stops counting against storage after 24
  hours (BUG-06).

# 2026-10-25: Email layout; invitation sign-in link (TDR-0191)

- All emails share one clean layout with a plain-text part; client emails show the
  agency's name. Invitations name the workspace and inviter and link straight to the
  email-code sign-in with the address filled in.

# 2026-10-25: Snippet install code; private content masked in screenshots (TDR-0192)

- Website tools links show a one-tag install (`data-share-token`, no inline script, CSP
  friendly) with Copy code and setup notes.
- Screenshots grey out `data-backline-private` content (SDK and extension) and include
  canvas charts and video frames.

# 2026-10-25: Extension 0.5.11

- Package with the screenshot Preview (TDR-0189) and `data-backline-private` masking
  (TDR-0192); `apps/web/public/backline-extension-0.5.11.zip`, 64700 bytes, SHA-256
  `7ed262a9…f129`. Dashboard offers 0.5.11; minimum supported stays 0.4.13.

# 2026-10-25: Widget styled under strict site CSP (TDR-0193)

- The SDK uses a constructed stylesheet, so sites with `style-src 'self'` show a styled
  widget. Not yet in an extension package (after 0.5.11).

# 2026-10-25: Old extension packages removed from the web app

- `apps/web/public` keeps only the current (0.5.11) and previous (0.5.10) extension ZIPs;
  the dashboard links only the current one. Older packages remain in git history.

# 2026-10-25: One-click unsubscribe (TDR-0194)

- Digest and feedback emails carry List-Unsubscribe / one-click headers and a footer link;
  POST unsubscribes, GET only confirms.

# 2026-10-25: Black-outs in the screenshot preview (TDR-0195)

- Reviewers drag across the previewed screenshot to black out private areas; the stored
  image has them burned in.

# 2026-10-25: Install guides; share links on phones

- The Install code dialog lists where the tag goes on WordPress, Webflow, Shopify,
  Squarespace, Wix, Google Tag Manager, Next.js and plain HTML/React/Vue (Next.js with a
  `next/script` example).
- Share links show as cards under 640 px (type, status, expiry, created and actions
  visible without sideways scrolling). Checked at 390 px: no page overflow, the dialog
  fits, Escape closes it and focus returns to its button.

# 2026-10-25: Privacy notice brought up to date

- `/privacy` (dated October 25, 2026) now describes screenshot preview, black-outs,
  `data-backline-private` masking, and the Unsubscribe link in digest/feedback emails.
  Facts only; the owner should still review the notice as a whole before launch.

# 2026-10-25: Keyboard pass on dialogs and popovers (SUG-07)

- Checked with the keyboard only: New project, Account, Share project, New ticket, Invite
  people, Add a client, Install code and Revoke dialogs already moved focus in, kept Tab
  inside, closed on Escape and returned focus to their button.
- Fixed the notifications popover: it was a "menu" holding a heading, a list and clickable
  list items, and focus never entered it. It is now a non-modal dialog; focus moves in on
  open, Escape returns focus to the bell, tabbing out closes it, and each notification is
  a real button (announced with "unread").
- Fixed the project dock's More menu: `aria-expanded`/`aria-controls`, focus on the first
  item, Escape returns focus to More, tabbing out closes it; Preferences is announced as a
  dialog. Verified on the workspace and project pages; mouse use unchanged.

# 2026-10-25: Extension 0.5.12

- Adds screenshot black-outs (TDR-0195) and strict-CSP styling (TDR-0193);
  `apps/web/public/backline-extension-0.5.12.zip`, 65903 bytes, SHA-256 `5108563d…d15a`.
  Verified with a local build: black-out burned into the tab capture. 0.5.10 ZIP removed;
  0.5.11 kept as previous.

# 2026-10-25: Deploy note and end-of-day list

- The Railway API deploy of `a01737a` (widget-only change) failed while the worker built
  the same commit; the next backend change (#118, `1047d28`) deployed the API
  successfully, so it was a transient deploy failure. Railway logs were not reachable
  from this environment.
- `pending-and-suggestions-2026-10-25.md` updated with the second batch.

# 2026-10-25: Second intermittent API deploy failure; start-up timing log

- Railway's API deploy also failed on `6d575ed` (extension 0.5.12) while the worker built
  the same commit; `1047d28` and `d43781d` deployed fine, so the failure is intermittent
  and not tied to the changed files. `/health` only checks Mongo and Redis. Without the
  Railway logs (not reachable from here) the cause is unconfirmed.
- The API now logs `Startup: indexes Xs, storage Ys` on the uvicorn logger before
  "Application startup complete", so the next failed deploy's logs show whether start-up
  stalled (index checks or the storage bucket) or never began (build or image pull).
  This change also redeploys the API with current code.

# 2026-10-26: Website cards show the site's share image (TDR-0196)

- Card pictures no longer need the server browser: the worker uses the site's `og:image`
  through the SSRF-guarded client. Works in production as soon as the worker runs; no
  setting to change.

# 2026-10-27: Railway build failures were infrastructure; local start-up fix

- Railway's own diagnosis of the failed builds (#126 on app and worker): "Infrastructure
  Error - the builder lost its connection (buildkitd.sock: use of closed network
  connection) before any build step ran; the commit's changes did not cause it." The
  earlier one-off failures fit the same pattern. Fix: rebuild the same code.
- Rebuilt by this change: the API no longer fails to start on a fresh local S3 store
  (moto/MinIO reject creating a bucket without a location outside us-east-1; R2's
  "auto" region does not need one). Verified on a fresh moto: created, then a no-op.

# 2026-10-27: Screenshot view and card picture plan B (TDR-0197)

- Sites that block Backline's preview (bot protection such as Cloudflare - e.g. Figma)
  are recognised at once and the canvas shows every comment on its screenshot with a
  marker where it was placed; "Screenshots" in the canvas bar shows the same view on any
  site. New comments record that marker.
- Card pictures: share image → extension start-page capture → newest comment
  screenshot → sketch.
- Extension 0.5.13 (`apps/web/public/backline-extension-0.5.13.zip`, 66663 bytes, SHA-256
  `493a7b8d…c6a2`) carries the markers and the start-page card capture; 0.5.11 ZIP removed.

# 2026-10-27: Card pictures for files; share images shown whole (TDR-0198)

- Image, mobile-app and PDF cards show their first file (thumbnail made in a member's
  browser when the file is viewed). Share-image cards (e.g. YouTube's logo banner) are
  shown whole instead of cropped. Optional `PREVIEW_SCREENSHOT_URL` gives real page
  screenshots for public sites.

# 2026-10-27: AI cost bounds and key fixes (TDR-0199)

- AI: output cap, bounded thread context, per-member rate limit (10/min), team notes kept
  out of client-thread summaries, key always released, one 5xx retry, prompt fencing.
- MCP tokens are revoked by "Sign out everywhere" and password change.
- API keys page copy matches what keys can do; browser-review keys hidden.
- Verified: ruff, mypy, workspace scoping, web lint/typecheck; a mocked Groq run showed
  a 502 retried on the second key, a `null` completion handled and no key left claimed.

# 2026-10-27: Infra resilience (TDR-0200)

- Realtime reconnects after a Redis drop (verified locally: connection killed, resubscribed
  in 1 s, next message delivered). Redis/Mongo timeouts; `/health` reports `realtime`.
- `/health/worker` for uptime monitors (verified 200 with a running worker).
- Railway services refuse to start without `ENVIRONMENT` (verified with
  `RAILWAY_PROJECT_ID` set). Worker Sentry, job completion wait, trimmed API tracing.
- Widget SDK cache header (verified on `/widget/sdk.js`).

# 2026-10-27: Backend security hardening (TDR-0201)

- Verified locally: 6 MB JSON body → 413; member JWT as guest header → 401; wrong sign-in
  codes counted per address across codes; 12,000-character page text stored as 10,000;
  a status change no longer sets `body_edited_at`, a text edit does.
- ruff, mypy, workspace scoping, types regenerated, web lint/typecheck.

# 2026-10-27: Polling and signed-URL cost (TDR-0202)

- Comments version reads a projection; guest session check every 60 s; signed URLs reused
  for 30 minutes (checked: same key → same URL; other expiry → fresh URL).
- ruff, mypy; web lint/typecheck.
