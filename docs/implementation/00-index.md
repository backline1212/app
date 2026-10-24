Warning: truncated output (original token count: 6949)
Total output lines: 440

# Final Draft implementation index

Current release handoff (2026-10-25):
[Chrome Web Store status and next steps](chrome-web-store-handoff-2026-10-25.md)
records the submitted 0.4.13 item, evidence paths, review status and remaining
browser acceptance work.

Combined component smoke follow-up (2026-10-24):
[TDR-0145](../tdr/0145-check-web-release-with-component-smoke.md) adds the
public web alias SHA and no-store check to the optional post-deploy smoke gate.
API, worker and web revisions remain independently specified.

Worker release observation follow-up (2026-10-24):
[TDR-0144](../tdr/0144-observe-worker-release-in-health.md) adds a short-lived
Arq heartbeat to the Pydantic `/health` contract and regenerated types.
The public API and worker both reported `22999a0` live and the independent
revision smoke gate passed; queued domain-job acceptance remains open.

Chrome Web Store submission follow-up (2026-10-24):
[TDR-0143](../tdr/0143-current-chrome-store-draft-and-reviewer-access.md)
records the 0.4.13 package, public privacy/support fields, verified publisher
contact and isolated guest demo. A genuine native-toolbar screenshot was uploaded;
Google confirmed submission and Pending review with automatic publication after
approval selected. Live publication and saved-comment/capture acceptance remain open.

Web release identity follow-up (2026-10-24):
[TDR-0142](../tdr/0142-web-release-marker.md) emits a non-secret Vite
`release.json` asset for exact alias-to-commit checks. The public QA alias
returned web SHA `1aeef63` with no-store; the API independently reported
`2730fcf`. Browser and worker acceptance remain open.

Release verification follow-up (2026-10-24):
[TDR-0141](../tdr/0141-repeatable-release-checks.md) adds one local
lint/typecheck/build command and an exact-SHA/contract post-deploy API smoke
gate. Worker identity and browser acceptance remain separate.

API release identity follow-up (2026-10-24):
[TDR-0140](../tdr/0140-expose-api-release-identity-in-health.md) adds
nullable Railway commit/deployment identifiers to the Pydantic `/health`
contract and regenerated types. Source checks and the matching API rollout
pass: `/health` identifies commit `612e60a` live. Worker deployment status
succeeded; queue and browser acceptance remain open.

Top-level documentation accuracy follow-up (2026-10-24):
[TDR-0139](../tdr/0139-label-historical-delivery-claims.md) labels M0–M12,
the launch-readiness audit and original backend plan as historical, and points
the README at this index, current inventory and delivery evidence.

Backend dependency cleanup (2026-10-24):
[TDR-0138](../tdr/0138-remove-unused-google-genai-dependency.md) removes
the unused Google Gen AI package from the manifest and lockfile without
upgrading other dependencies. Local static/lock checks and API/worker deployment
statuses pass; live AI acceptance remains open.

Pricing capture/support wording follow-up (2026-10-24):
[TDR-0137](../tdr/0137-qualify-pricing-capture-and-support-claims.md)
qualifies screenshot and optional metadata claims and removes an unverified
four-hour support promise. Source checks and matching API rollout pass; live
pricing-page acceptance remains open.

Ticket card/list path privacy follow-up (2026-10-24):
[TDR-0136](../tdr/0136-redact-ticket-list-page-paths.md) uses the shared
display-only review URL formatter on ticket board/list path labels. Web
lint/typecheck/build pass; browser acceptance remains open.

MCP page URL privacy follow-up (2026-10-24):
[TDR-0135](../tdr/0135-restrict-mcp-page-url-exports.md) applies the existing
origin-only export rule to MCP page labels and generated implementation briefs.
Backend static checks and matching API rollout pass; live MCP/brief acceptance
remains open.

Current pending-work review (2026-10-24):
[the refreshed inventory](pending-backlog-2026-10-24.md) reconciles all 53 tracked
items with current source/delivery evidence and adds 15 implementation/optimization
recommendations. Its initial API 404 observation is historical; the later
release check confirmed `/health` and auth capabilities return HTTP 200.
See [TDR-0134](../tdr/0134-current-pending-work-review.md).

Extension setup and update guidance (2026-10-24):
[TDR-0133](../tdr/0133-separate-extension-install-and-update-guidance.md)
distinguishes a missing extension from an installed incompatible one and
explains the required Backline tab reload. Source checks and web rollout
passed; browser acceptance remains open.

Guest file-review transport isolation (2026-10-24):
[TDR-0132](../tdr/0132-isolate-guest-file-review-transport.md) explicitly
omits member cookies and browser caching from direct guest PDF/image requests.
Source checks passed and web rollout succeeded; browser acceptance remains open.

File-review refresh recovery (2026-10-24):
[TDR-0131](../tdr/0131-keep-file-review-visible-through-refresh-errors.md)
keeps already loaded PDF/image review and comments visible during a temporary
refresh failure, while hiding cached content after an explicit access denial.
Source checks passed and web rollout succeeded; browser acceptance remains open.

Website startup outage follow-up (2026-10-24):
[TDR-0130](../tdr/0130-keep-native-toolbar-through-startup-outage.md)
keeps the native website toolbar and tab session through an initial API outage
and retries access when the service returns. Extension 0.4.13 source/package
checks passed and the portal ZIP is deployed; installed-browser acceptance
remains open.

Portal guest outage follow-up (2026-10-24):
[TDR-0129](../tdr/0129-preserve-portal-guest-access-during-api-fallback.md)
maps API edge fallback in direct guest session, board and file-review requests
to retryable unavailability, so an outage does not expire a portal guest review.
Source checks passed and web rollout succeeded; browser acceptance remains open.

Website review waiting-state follow-up (2026-10-24):
[TDR-0128](../tdr/0128-honest-website-review-waiting-state.md) reserves
"connected" for confirmed toolbar readiness and prevents another launch
while the sign-in/waiting dialog remains open. Web is deployed; browser
acceptance remains open while the API host returns edge fallback 404.

Review continuity during API fallback (2026-10-24):
[TDR-0127](../tdr/0127-preserve-reviews-through-api-edge-fallback.md) keeps
native and guest review sessions when Railway's edge returns a service-level
404, while retaining cleanup for real API denials. The 0.4.12 portal ZIP is
deployed; API rollout and installed-browser acceptance remain open.

API outage messaging follow-up (2026-10-24):
[TDR-0126](../tdr/0126-distinguish-api-outage-from-missing-account.md)
distinguishes Railway edge fallback and browser network failures from missing
accounts/workspaces at login. Web is deployed; browser acceptance remains open.

Website screenshot outcome follow-up (2026-10-24):
[TDR-0125](../tdr/0125-show-screenshot-outcome-in-site-review.md) shows
automatic capture success/failure in the on-site post confirmation and saved
thread card. The 0.4.11 portal ZIP is deployed; installed/browser acceptance
remains open while the API host returns a Railway fallback 404.

Review availability copy follow-up (2026-10-23):
[TDR-0124](../tdr/0124-available-review-paths-in-product-copy.md) clarifies
the planned native Mobile App scope, links the usable screenshot review path,
and distinguishes unavailable pricing features visually. Browser acceptance
remains open.

Browser sign-in continuation follow-up (2026-10-23):
[TDR-0123](../tdr/0123-keep-native-review-through-website-sign-in.md)
keeps a tab-bound review session when a website sign-in outlasts the toolbar
check. Extension 0.4.10 and its versioned portal download are deployed;
installed acceptance and replacement of the 0.4.9 Web Store draft remain open.

Extension download follow-up (2026-10-23):
[TDR-0122](../tdr/0122-versioned-portal-extension-download.md) points portal
installation links to the versioned 0.4.9 package served by the web app while
the API's public ZIP remains stale. The public download's manifest and hash are
verified; installed browser acceptance remains open.

Public extension information follow-up (2026-10-23):
[TDR-0121](../tdr/0121-public-extension-privacy-and-support-pages.md) adds
signed-out privacy and support pages and replaces dead signup privacy/support
links. Deployed assets are verified; browser acceptance and owner data-use
certification remain open.

Chrome Web Store publisher follow-up (2026-10-23):
[TDR-0120](../tdr/0120-chrome-web-store-publisher-verification.md) records the
intended publisher account, owner-selected trader status, pending Google
verification and source-matched 0.4.9 draft item. Payment, review and publication
remain unverified; the [release handoff](chrome-web-store-release-2026-10-20.md)
carries the upload artifact and open requirements.

Review bundle loading follow-up (2026-10-22):
[TDR-0119](../tdr/0119-defer-file-and-pdf-review-bundles.md) defers file
review until a file project opens and PDF parsing until a PDF opens. Build
sizes improved; browser/network and PDF acceptance remain open.

Preview HEAD-method follow-up (2026-10-22):
[TDR-0118](../tdr/0118-preview-head-request-support.md) relays bodyless
HEAD probes through both preview link modes. Backend rollout and actual
site/asset acceptance remain open.

File-review keyboard follow-up (2026-10-22):
[TDR-0117](../tdr/0117-scope-file-review-keyboard-shortcuts.md) scopes PDF/image
page and zoom shortcuts away from controls, dialogs and modified keys.
Browser PDF acceptance remains open.

Guest handoff proxy-privacy follow-up (2026-10-22):
[TDR-0116](../tdr/0116-keep-guest-handoff-out-of-reviewed-site-requests.md)
strips the Backline guest token/name from requests and Referers sent upstream by
the proxy. Browser/Backline URL exposure and direct snippet handoff remain open.

Legacy preview redirect follow-up (2026-10-22):
[TDR-0115](../tdr/0115-preserve-legacy-preview-form-redirect-status.m…1949 tokens truncated…the fake email-success path in source and records production deployment
watch-path drift, the explicit fix, and live verification limits.
Further source work: [evidence persistence](../tdr/0068-review-evidence-persistence.md)
and [proxy fallback/extension connection](../tdr/0069-proxy-fallback-and-extension-connection.md).
The existing proxy remains available; connected installation/launch is still pending.
The next UX/recovery increment is [TDR-0070](../tdr/0070-guided-review-and-sharing.md):
guided browser setup/return, explicit guest exit/retry, expiry-aware sharing and
single-write project edits. It preserves the pending connected-site launch scope.
The user-assisted launch check then identified an auth read gap during rotation;
[TDR-0071](../tdr/0071-atomic-refresh-successor.md) commits the refresh successor
with its old-token claim, preserving strict replay detection and family continuity.
Current native verification covers draft protection/cancel, original-tab return
with a selected thread, toolbar cleanup and existing-login YouTube launch. The
shared composer rejection repair is [TDR-0072](../tdr/0072-composer-submit-recovery.md);
updated-extension failure-path and broader capture/evidence acceptance remain open.
One explicitly approved native comment and its screenshot now survive portal
reload. [TDR-0073](../tdr/0073-native-toolbar-card-layout.md) addresses a measured
toolbar/composer overlap; updated-extension visual/failure-path checks remain open.
The user-updated 0.4.3 short-window layout and long-draft cancellation now pass;
wrapped/narrow-window and induced failure acceptance remain open in the ledger.
The next web-only product flow increment is
[TDR-0074](../tdr/0074-review-guidance-and-readiness.md): project-first automatic
extension connection, optional standalone setup, explicit reload recovery and
readiness-gated canvas controls. It retains the pending CR-02/03 boundary.
The next functional repair is [TDR-0075](../tdr/0075-comment-retry-and-sign-in-continuity.md):
immutable comment retries, recoverable draft copying, page binding, wall-clock
sign-in codes and one-time return navigation. Extension 0.4.4 rollout/acceptance
is tracked separately from the installed 0.4.3 evidence.
The user's site-wide Coming soon request is inventoried in
[the 2026-10-20 delivery plan](coming-soon-delivery-2026-10-20.md). The first feature
slice is [TDR-0076](../tdr/0076-files-approval-and-team-notes.md): real file management,
captured-page approval and portal team notes, with file/ticket save recovery.
[TDR-0077](../tdr/0077-reliable-pdf-image-review.md) follows the user's explicit PDF
request: file-specific pin movement, authenticated bounded content reads, stable
PDF rendering, readiness and ticket-to-file navigation. Browser acceptance is open.
[TDR-0078](../tdr/0078-proxy-bounds-cookie-deletion-and-claims.md) continues the audit
with F19/F23 proxy repairs, extension Docker endpoint inputs and truthful F25/F35
plan/AI/acceptance claims; live acceptance remains distinct from source completion.
[TDR-0079](../tdr/0079-conditional-ai-priority-updates.md) addresses F29 with
conditional authorized priority writes, normal events and explicit applied/skipped
results; provider/concurrency acceptance remains open.
[TDR-0080](../tdr/0080-atomic-plan-capacity.md) follows F26 with transactional
project/member capacity and expiring AI credit reservations. Live contention and
provider/restart acceptance remain open.
[TDR-0081](../tdr/0081-feedback-email-delivery.md) adds explicit feedback-email
opt-in, a durable notification outbox and bounded provider sends for F28. Actual
inbox receipt, role/preference changes and worker retry acceptance remain pending.
[TDR-0082](../tdr/0082-review-origin-and-start-url.md) repairs F16 by storing an
origin and starting address separately, reading legacy records and preserving page
paths/queries/hash at launch. Browser/page-identity acceptance remains pending.
[TDR-0083](../tdr/0083-atomic-project-and-client-creation.md) repairs F30's project/
client/link partial saves with atomic creation, actor-bound request replay and
frozen form recovery. File-upload acknowledgement recovery remains separate.
[TDR-0084](../tdr/0084-file-upload-replay.md) implements that remaining PDF/image
upload replay and retained-batch recovery in source; actual storage/browser failure
acceptance remains pending and F24 storage quotas are still separate.
[TDR-0085](../tdr/0085-storage-byte-reservations.md) implements F24's storage ledger,
transactional reservations across all writes, inventory and staged enforcement.
Unused signed grants retain conservative holds; rollout/manual acceptance is tracked.
[TDR-0086](../tdr/0086-google-sign-in-readiness.md) adds F18's server-validated
Google readiness and login/signup checking, retry and email fallback states.
[TDR-0087](../tdr/0087-deploy-notifications-and-review-capture.md) replaces the
Deploy sync placeholder with signed project CI notifications, credential lifecycle,
paginated history, member-review snapshot association and read-only MCP history.
Receipt/capture is not commit verification; background capture remains gated.
[TDR-0088](../tdr/0088-file-review-navigation-and-draft-guards.md) repairs PDF/image
file/page/thread URL state, draft navigation guards, page selection and unavailable
content recovery. Browser acceptance remains separate from source checks.
[TDR-0089](../tdr/0089-project-edit-concurrency-and-replay.md) adds project edit
metadata versions, bounded actor/body replay and explicit latest-details conflict
recovery for settings and rename. Legacy unversioned callers remain compatible.
[TDR-0090](../tdr/0090-exact-commit-deployment-recovery.md) records Railway's
temporary deploy pause and the exact pushed-commit recovery command. Backend
rollout of TDR-0089 is still pending; compilation and push do not establish it.
[TDR-0091](../tdr/0091-bounded-page-version-capture.md) bounds DOM/HTTP snapshot
work, isolates capture counters and document identity, and exposes independent
version-capture retry/waiting notices. Release/deployment and browser acceptance
remain separate from source verification.
[TDR-0092](../tdr/0092-preview-recovery-and-feedback-navigation.md) records resumed
read-only browser checks and consolidates failed-preview recovery with direct saved
feedback and URL-owned panel selection. The preview network cause remains unproven.
[TDR-0093](../tdr/0093-website-thread-replies.md) adds immutable text-reply saves and
draft protection to native and standalone guest website threads, with role-aware
controls. Embedded member replies still use the signed-in portal; other pin-card
mutation parity and installed-extension acceptance remain open.
[TDR-0094](../tdr/0094-batched-comment-read-enrichment.md) batches comment/ticket
page, author, parent and evidence enrichment in one workspace request. F32's cursor
pagination, polling deltas and measured large-project acceptance remain open.
[TDR-0095](../tdr/0095-native-access-revalidation-and-cleanup.md) adds native access
probes independent of drafts, ended-review cleanup, serialized Chrome session
updates and mode/close race guards. Extension 0.4.8 rollout and live revocation/
failure acceptance remain distinct from source checks.
[TDR-0096](../tdr/0096-hash-route-page-identity.md) separates #/ and #!/ page
identities, retains legacy history, rebinds ordinary-anchor capture URLs, exposes
route context in labels and adds capability-gated hash-route deploy capture.
Other fragment formats and live/installed acceptance remain open.
[TDR-0097](../tdr/0097-portal-reply-replay-and-draft-guards.md) unifies portal reply
idempotent retries, immutable save payloads, copy/leave guards, retained partial
uploads and explicit AI suggestion application across project/board/ticket forms.
Ticket metadata lifecycle/role gating and live failure acceptance remain separate.

1. [PRD and decisions](01-prd.md)
2. [Flow and acceptance matrix](02-flow-matrix.md)
3. [Frontend plan](03-frontend.md)
4. [Backend and API plan](04-backend.md)
5. [Database and migration plan](05-database.md)
6. [Delivery and verification ledger](06-delivery.md)
7. [HTML parity, UI/UX, accessibility, resilience, and localization audit](07-html-parity-audit.md)
8. [Source inventory](../reference/html-inventory.md) and [original HTML](../reference/backline-final-draft.html)
9. [Reusable post-login UI migration prompts](10-ui-migration-chat-prompts.md)

The existing [engineering specification](../spec/00-README.md) remains the architecture baseline. [TDR-0012](../tdr/0012-final-draft-product-evolution.md) records this dated product amendment. Do not interpret a planned capability as implemented; use the delivery ledger and executable checks as evidence.

## Architecture retained

`apps/web` React 18 / Vite / React Router; React Query for server data and URL parameters for shareable filters; Zustand for transient connection/presence. `apps/widget` remains a separately bundled TypeScript SDK. `packages/ui` supplies presentation components; `packages/types` is generated from FastAPI OpenAPI. Backend follows router → service → repository with Pydantic boundaries, MongoDB documents scoped by workspace, Redis realtime and Arq jobs, and private S3-compatible object storage.

## Document map

| Subject | Baseline | Current amendment |
|---|---|---|
| Product, scope, acceptance | spec/01, 16, 20 | 01-prd, 02-flow-matrix, 06-delivery |
| Frontend, design, state | spec/05, 14, 15 | 03-frontend |
| Backend, API, auth, realtime | spec/03, 06, 12, 13 | 04-backend |
| Data, indexes, storage | spec/11, 18 | 05-database |
| SDK, anchors, recovery | spec/07–10 | 02-flow-matrix; preserve existing engine |
| Notifications, providers | spec/17 | 01-prd provider decisions |
| Testing, rollout | spec/19, launch-readiness | 06-delivery |

Historical TDRs are immutable context. Deployment documents have pre-existing user edits; preserve those edits when adding references.
