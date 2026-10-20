# Backline site, authentication and implementation audit

Date: 2026-10-19 (Asia/Calcutta). Baseline: `main`, commit `2daf5a7`.
Scope decision: [TDR-0059](../tdr/0059-site-gap-audit.md).

F30 source follow-up: [TDR-0083](../tdr/0083-atomic-project-and-client-creation.md)
adds transactional project/client/default-link/audit creation and actor-bound
request replay. Settings/client save recovery is included. Live rollback/retry
acceptance, file-upload acknowledgement replay and post-commit notifications remain open.

F16 source follow-up: [TDR-0082](../tdr/0082-review-origin-and-start-url.md) adds
canonical origin/full starting URL separation and legacy reads, fixes proxy/widget
origin concatenation and retains initial path/query/hash at launch. Browser,
legacy-record and page-identity acceptance remain pending.

F26 source follow-up: [TDR-0080](../tdr/0080-atomic-plan-capacity.md) serializes
project/member capacity with writes and reserves AI credits before provider work.
The baseline below remains audit evidence; live contention/rollback/lease/month
acceptance is pending and F24 storage-byte quotas remain open.
F28 source follow-up: [TDR-0081](../tdr/0081-feedback-email-delivery.md) adds an
explicit opt-in and durable feedback email delivery, preserving existing in-app and
digest preferences. Actual receipt/retry/revocation acceptance is pending.

Implementation follow-up: the baseline findings below are preserved. Partial CR-01
repairs now address comment replay authorization (F04), guest mutation checks (F05),
socket authorization (F06/F07), notification visibility (F08) and workspace refresh
(F10); namespace checks address part of F03 and cache changes part of F33. These are
code changes awaiting live acceptance, not closed findings. See
[TDR-0061](../tdr/0061-connected-review-access-foundation.md) and the
[delivery ledger](06-delivery.md) for precise scope and verification limits.
The subsequent F02 Google callback state repair is documented in
[TDR-0062](../tdr/0062-google-sign-in-state.md), with provider acceptance still open.
F12/F13 now also have source repairs in
[TDR-0063](../tdr/0063-auth-concurrency.md); cross-tab/browser and database acceptance
is still outstanding. Baseline descriptions below remain the original audit evidence.
F01 now has a verified signup and legacy credential recovery repair in
[TDR-0064](../tdr/0064-verified-email-identities.md). F09 has the default-off execution
gate in [TDR-0065](../tdr/0065-server-browser-isolation-gate.md); network isolation
itself remains unprovisioned/unverified. Neither is declared production-closed.
F34's cache validation/rejoin and widget cleanup source changes are recorded in
[TDR-0066](../tdr/0066-guest-session-recovery.md). Browser/guest regression evidence is
still outstanding; the legacy URL handoff remains a separate CR-03/F20 issue.
F11 now fails closed on production email-provider failure and avoids logging live
message bodies; see [TDR-0067](../tdr/0067-email-delivery-and-deployment-consistency.md).
Actual delivery/receipt and login acceptance are still open.
F03 upload registry/existence checks and F22 transactional snapshots/durable delivery
are repaired in source in [TDR-0068](../tdr/0068-review-evidence-persistence.md), pending
storage/concurrency acceptance. The extension's obsolete API default is fixed with
protocol/version checks and explicit proxy fallback in
[TDR-0069](../tdr/0069-proxy-fallback-and-extension-connection.md). F14 has partial
project binding/expiry/route constraints; remaining scope is explicit.
The [guided UX follow-up](../tdr/0070-guided-review-and-sharing.md) repairs the
metadata/settings split-save portion of F30 and improves F34 recovery/exit. New
links reject F15's unavailable identity restriction/export options; legacy request
filters remain labelled and are not verified identity, so migration/acceptance
remain open. Guided extension setup and return do not close native capability limits.
Live launch verification additionally identified a refresh family read gap between
old-token revocation and successor creation. [TDR-0071](../tdr/0071-atomic-refresh-successor.md)
commits those writes together; broader F12 logout/replay/failure acceptance remains open.
F21 now has a shared composer rejection/synchronous-throw recovery repair in
[TDR-0072](../tdr/0072-composer-submit-recovery.md), pending an induced failure on
the updated real extension. The ledger also records 0.4.1 draft/cancel/return and
existing-login YouTube launch; complete capture/persistence acceptance remains open.

2026-10-20 follow-up: [TDR-0075](../tdr/0075-comment-retry-and-sign-in-continuity.md)
fixes immutable composer retries and sign-in continuity. F31 now has additive
actor/resource/payload replay for image/PDF comments in
[TDR-0076](../tdr/0076-files-approval-and-team-notes.md), alongside real file
management, team notes and captured-version approval. Its new file-specific pin
movement and stable private PDF/image preview follow
[TDR-0077](../tdr/0077-reliable-pdf-image-review.md). These are source repairs;
browser/write/guest/concurrency acceptance remains open. F25's disabled cloud-login
pricing claim is corrected, while other entitlement/limit work remains open.
The baseline rows below remain preserved evidence, not current completion claims.
F19/F23 source follow-ups are recorded in
[TDR-0078](../tdr/0078-proxy-bounds-cookie-deletion-and-claims.md), together with
F17 Docker inputs and F25/F35 claim reconciliation. Compression/logout/custom-build
and provider acceptance remains open; F24/F26/F29 are still pending source work.
F29 now has conditional authorized mutation/event/cache repairs in
[TDR-0079](../tdr/0079-conditional-ai-priority-updates.md). Provider/concurrency
acceptance is still open; F24/F26 remain pending implementation.

## Result and evidence boundary

This audit records **35 findings and 8 capability limits**. Eleven findings are P1,
22 are P2, and two are P3. Priorities are triage recommendations, not evidence of a
production exploit. No P0 incident is established.

The reported inability to sign in to different reviewed websites has several causes.
The embedded canvas changes the website's origin and proxies one target at a time;
third-party APIs and identity-provider redirects do not become authenticated canvas
sessions automatically. Native Browser review is implemented to keep the real site's
browser session, but requires an unpacked desktop Chrome/Edge extension, accepts one
configured dashboard origin, and has no recorded completed browser acceptance pass.
There are also independent Backline account, authorization and persistence defects.

**Evidence labels:** all F rows below are confirmed by tracing the checked-in source.
The described consequences are code-derived; they have not been reproduced against
the deployed service in this audit. L rows describe actual capability boundaries,
not automatically defects. The verification section distinguishes executable checks
from browser/provider/database work still outstanding. A source audit cannot prove
that every possible bug has been found.

Reviewed surfaces: React routes and auth/session/cache flows; dashboard canvas and
guest handoff; proxy routing, interception, cookies and preview hosts; extension
launch, permissions and message relay; FastAPI session and project guards; comments,
replies, attachments and idempotency; pages, snapshots and recovery handoff; image/PDF
review; notifications/realtime; billing/AI limits; worker and deployment packaging;
current acceptance documents and historical delivery claims. No product code was
changed, no fixtures/migrations were run, and no test suites were written or run.

## Highest-priority findings

### F01 — P1: Password signup does not prove email ownership

- Evidence: `backend/app/modules/auth/service.py::signup_with_password`,
  `login_with_google`, `verify_otp`; `auth/repository.py::UserRepository.create`;
  `backend/app/modules/workspaces/service.py::invite_member`.
- Signup immediately issues a session for the submitted email, without an email
  verification challenge or a verified-account field. Invitations grant membership
  to a user found by that email. Google/OTP later reuse the same user and leave any
  previously set password intact.
- Failure scenario: someone registers another person's email first and sets their
  own password; an invitation to that email attaches to the existing account. The
  real inbox owner's later Google/OTP login does not remove the earlier password.
- Acceptance: require verified inbox ownership before activating an email identity
  or invitation membership, and define safe linking/recovery for preexisting accounts.

### F02 — P1: Google OAuth callback is not bound to the browser's sign-in attempt

- Evidence: `apps/web/src/features/auth/google-oauth-url.ts::buildGoogleAuthUrl`,
  `AuthCallbackPage.tsx`; `backend/app/modules/auth/schemas.py::GoogleCallbackRequest`.
- The authorization URL sends no `state`; the callback accepts any `code` and the
  backend contract receives only that code. Provider ID-token verification exists,
  but it does not bind this callback to the initiating browser. This leaves a login
  CSRF/session-substitution gap.
- Acceptance: generate, expire, consume and validate unpredictable state before
  exchanging a code; reject unsolicited/replayed callbacks. Google's own
  [web-server OAuth guidance](https://developers.google.com/identity/protocols/oauth2/web-server)
  explicitly requires CSRF protection and callback state validation.

### F03 — P1: Comment screenshot/attachment keys are signed without project ownership checks

- Evidence: `backend/app/modules/comments/schemas.py::AttachmentIn/CommentCreate`;
  `comments/service.py::create_comment`, `create_reply`, `_resolve_attachments`,
  `_comment_out`. Compare the prefix check in `dashboard/service.py::create_ticket`.
- The page/comment endpoints accept arbitrary `screenshot_key` and attachment `key`
  strings and later generate signed GET URLs. Authorizing the destination page does
  not authorize the referenced object. The standalone-ticket endpoint already checks
  its project upload prefix; these comment/reply paths do not.
- Failure scenario: an actor who knows a private object key from another project or
  tenant references it in an allowed comment and receives a fresh signed read URL.
  This does not require bucket enumeration, but does require knowledge of the key.
- Acceptance: validate object ownership, permitted prefix/type and upload record on
  every reference path, including screenshots, replies and retry responses.

### F04 — P1: Idempotency replays can return another actor's hidden comment

- Evidence: `comments/service.py::create_comment/create_reply`;
  `comments/repository.py::find_by_client_request_id/create`.
- An existing request ID is looked up by workspace only and returned through
  `_comment_out` without checking its project, page/parent, author, visibility,
  deletion state or request payload. The duplicate-key fallback has the same issue.
- Failure scenario: two requests deliberately use a known shared request ID. A guest
  posting to an allowed page can receive a team/private-project record that originally
  used that ID in the same workspace. Random UUIDs make accidental collision unlikely;
  request IDs are nevertheless caller-controlled and must not authorize a response.
- Acceptance: bind replay identity to actor, resource and operation, validate payload
  consistency, and authorize the stored result before returning it.

### F05 — P1: Revoked guest links do not stop own-comment editing/deletion

- Evidence: `comments/service.py::_require_member_can_comment`, `edit_comment`,
  `delete_comment`, `delete_thread`; `core/session.py::get_guest_session`.
- For an ordinary guest, `_require_member_can_comment` returns immediately. The
  dependency validates JWT signature/expiry, but not current share-link state.
  These mutations check authorship and skip the active-link/project checks used by
  comment creation. Whole-thread deletion can also remove other people's replies.
- Acceptance: a revoked/expired link or archived project must reject these existing
  guest tokens too; apply the shared actor/project guard before any mutation.

### F06 — P1: Logged-out/revoked member sessions can still subscribe to realtime

- Evidence: `backend/app/modules/realtime/router.py::_resolve_actor` and
  `websocket_endpoint`; `realtime/manager.py::MemberEventFilter`; compare
  `core/session.py::validate_member_session`.
- WebSocket decoding drops the JWT's `sid` and never validates the refresh-token
  family. The event filter checks membership/project access, not session revocation.
  A still-unexpired access token from a signed-out family can reconnect; an already
  open socket has no token-expiry/session-revocation deadline.
- Acceptance: retain and validate `sid` on connect and revoke/expire active sockets
  when their authentication ceases to be valid.

### F07 — P1: Guest realtime outlives link and member-bound canvas authorization

- Evidence: `realtime/router.py::websocket_endpoint`;
  `realtime/manager.py::ConnectionManager.broadcast_local`.
- Ordinary guest connects check link existence/revocation, but omit link expiry and
  project archive state. Canvas member access is checked only at connect. Guest
  connections have no event filter or subsequent access/expiry check, so revocation,
  expiry, archiving or removal of a canvas member does not stop an existing stream.
- Acceptance: authorize guest sockets with the same policy as HTTP and stop delivery
  immediately when link, project or member access changes.

### F08 — P1: Private notification payloads are broadcast to the whole workspace

- Evidence: `notifications/service.py::_create_and_broadcast` and
  `notify_project_access_granted`; `notifications/schemas.py::NotificationOut`;
  `realtime/manager.py::MemberEventFilter.allows`.
- Notifications are published on `workspace:{id}:all`. The filter expects
  `envelope.payload.project_id`, while these events put it at
  `envelope.payload.payload.project_id`. `recipient_user_id` is only filtered in
  `apps/web/src/features/notifications/NotificationBell.tsx`.
- Failure scenario: another workspace member inspects received WebSocket messages
  and sees a private project's name, grant role, actor and target route, even without
  access to that project. REST notifications also do not re-filter stored project
  notices after project access is removed.
- Acceptance: deliver per recipient on the server, apply the project guard to the
  actual envelope shape, and reauthorize stored notification reads.

### F09 — P1: Browser render/preview SSRF guard excludes subresource requests

- Evidence: `browser_render/service.py::_guard_document_navigation/run_render`;
  `projects/preview_service.py::_screenshot`; `core/ssrf_guard.py::assert_safe_to_fetch`.
- The browser hook deliberately continues every non-`document` request without
  validation. A public page can request internal URLs as fetch/XHR/images from the
  server-side browser. Initial-URL and document-redirect checks do not cover this.
  DNS is also checked separately from the browser/httpx connection's own resolution,
  leaving a DNS-rebinding review item.
- Acceptance: enforce public-destination policy for every outbound request and enforce
  network isolation/pinned resolution where appropriate. Validate this only against
  an isolated local target; no internal or production probing was performed.

### F10 — P1: Silent token refresh can lose workspace context and stall navigation

- Evidence: `auth/service.py::refresh_tokens` issues a workspace-less token;
  `apps/web/src/lib/api-client.ts::refreshOnce/send`;
  `apps/web/src/app/layout/useWorkspaceContext.ts`.
- A 401 refresh replaces the workspace token with one without `workspace_id/role`,
  then retries the original workspace request. The layout tries to switch back, but
  its `attempted.current === targetWorkspace.id` guard prevents a second switch if
  that layout already opened the workspace. Its result remains `switching`.
- Failure scenario: open a bookmarked workspace, let its access token expire, then
  trigger an API request. This path can leave the page at “Opening …” until reload.
- Acceptance: restore the selected workspace before retrying a scoped request and
  allow the layout to repeat a switch after refresh; preserve current permissions.

### F22 — P1: Failed snapshot persistence can become a permanent successful no-op

- Evidence: `snapshot_engine/service.py::submit_snapshot`.
- The service marks the previous revision noncurrent and inserts a new current
  revision before uploading the snapshot and advancing the page pointer/enqueuing
  recovery. If storage or the later queue operation fails, the next identical submit
  sees the new current hash and returns early, without repairing the missing object,
  pointer or recovery job. Database and object/queue state can remain inconsistent.
- Acceptance: use a pending/ready state and durable retry/outbox behavior; only
  deduplicate against a completed snapshot, and make partial writes recoverable.

## Other defects and missing implementation

Source paths below are repository-relative. Reproduction/acceptance items are work
to execute on an isolated stack, not claims that they were executed in this audit.

| ID | Priority | Finding and consequence | Source evidence | Closure condition |
|---|---|---|---|---|
| F11 | P2 | Email can report success without being delivered. With no Resend key, an absent/failing Apps Script path logs the full email, including OTPs, and returns successfully in every environment. Recovery/invites become unusable while UI says sent. | `backend/app/core/email.py::send_email`; `auth/service.py::request_otp` | Fail closed outside local mode when no delivery provider succeeds; avoid logging live OTP bodies. |
| F12 | P2 | Refresh deduplication is tab-local. Two tabs share one rotating cookie but each owns `refreshInFlight`; a concurrent restore/refresh can invoke reuse detection and revoke their shared family. | `apps/web/src/lib/api-client.ts::refreshOnce`; `auth/service.py::refresh_tokens`; `auth/repository.py::rotate` | Coordinate refresh across tabs, or design a bounded server rotation grace strategy without removing theft detection. |
| F13 | P2 | OTP use/attempt limits are not atomic, and older codes can reactivate. Verification reads the code and attempts, then separately increments/consumes it. Parallel verifies can pass the same code or the attempt cap. A consumed newest code causes `find_latest_active` to select an older outstanding code. | `auth/service.py::request_otp/verify_otp/confirm_email_change`; `auth/repository.py::OtpRepository` | Atomically claim verification/attempts, invalidate superseded codes, bound verify traffic, and accept each issued challenge only once. |
| F14 | P2 | Extension credentials have broad, indefinite authority. `_resolve_extension_session` is a fallback for all member routes, tokens have no expiry, and browser-session logout/password changes do not revoke them. They can reach account operations as well as review routes. | `core/session.py::get_current_session/_resolve_extension_session`; `extension_tokens/repository.py`; `auth/service.py::logout/change_password` | Define explicit token scopes/expiry and recovery/revocation policy; require recent appropriate authentication for account changes. |
| F15 | P2 | “Domain restrictions” inspect Origin/Referer, not verified reviewer email. Non-browser clients can supply those headers; the normal review page's dashboard origin can also fail a customer-domain restriction. Nonempty restrictions are accepted despite FD-17 requiring verified identity. | `share_links/policy.py::check_domain_restriction`; `share_links/schemas.py::ShareLinkCreate/GuestSessionCreate`; `share_links/service.py::create_guest_session` | Distinguish embed-origin policy from reviewer identity policy. Enforce verified email domains, or keep the identity restriction unavailable. |
| F16 | P2 | Review URLs containing paths/queries are accepted as `target_origin` and later treated as an origin. `https://site.test/app` plus page `/app/login` becomes `/app/app/login`; query-bearing bases can also produce malformed upstream URLs/referers and page identities. | `projects/schemas.py::normalize_origin`; `proxy/service.py::fetch_proxied_resource`; `apps/widget/src/page-registration.ts::realPageUrl`; `ProjectOverviewPage.tsx::proxyRequestFor` | Store canonical origin and initial path/query separately; resolve paths with URL semantics and preserve legacy records. |
| F17 | P2 | Downloaded extension is tied to fixed deployment addresses. Its build defaults to the QA dashboard/Railway API; bridge and worker accept only that dashboard origin. Docker build does not expose/pass endpoint build args. Local/custom/preview dashboard deployments therefore fail status/launch unless separately rebuilt with overrides. | `apps/extension/scripts/build.mjs`; `src/native-client.ts::installDashboardBridge`; `src/native-review.ts`; `backend/Dockerfile` | Produce an environment-matching download and explicit deployment settings; verify bridge/API addresses in the delivered ZIP. |
| F18 | P2 | Google login remains clickable with no configured client ID. Browser redirect URI comes from the current origin, while exchange uses the server's fixed redirect URI, so preview/custom domains can start a flow that cannot finish. | `features/auth/LoginPage.tsx`; `google-oauth-url.ts`; `backend/app/modules/auth/google_oauth.py` | Report provider readiness and use one validated redirect configuration; hide or explain unavailable sign-in methods. |
| F19 | P2 | Legacy proxy cookie deletion is lost. It serializes the final httpx cookie jar; upstream expiry/Max-Age=0 removes a cookie from that jar, leaving no deletion header for the browser's namespaced copy. Subsequent requests can resend the old cookie. The preview-host branch already relays raw cookie deletion headers. | `proxy/service.py::_session_cookie_headers/_fetch_legacy/_preview_set_cookies` | Relay namespaced deletion headers as well as surviving cookies; verify logout and CSRF/session-cookie rotation in fallback mode. |
| F20 | P2 | Canvas “loaded” is based on iframe `onLoad`, not widget readiness or upstream HTTP success. An upstream 403/login failure or browser-blocked page can stop the loading UI without a working review session; the 30-second timeout no longer helps once `onLoad` ran. | `features/projects/ProjectOverviewPage.tsx` iframe handlers and loading effect | Track document load and widget/API handshake separately; show an actionable Browser review fallback on unsupported pages. |
| F21 | P2 | A rejected composer callback leaves controls locked. `ui-composer.ts::submit` has `.then` but no rejection/finally path; native point capture computes the anchor and screenshot before its guarded POST block. An exception before that block produces an unhandled rejection and leaves `submitted` true. | `apps/widget/src/ui-composer.ts::submit`; `apps/extension/src/content-script.ts::activatePointMode` | Always clear pending state on rejection, preserve the draft and show a retryable error. |
| F23 | P2 | Proxy memory use is not bounded by its stated 2 MiB limit. `_read_body` buffers the whole body before checking actual length, and upstream responses are fully buffered/decompressed with no size cap. Large or compressed responses can exhaust a worker/API process. | `proxy/router.py::_read_body`; `proxy/service.py::fetch_proxied_resource` | Bound incoming streaming reads and upstream/decompressed response sizes with explicit errors; handle supported streaming separately. |
| F24 | P2 | Advertised storage quotas are not implemented. Billing exposes tier GB values, but uploads/assets/snapshots have no workspace byte-usage reservation/check. Individual-file limits are not a storage quota. | `billing/plans.py`; `billing/limits.py::LimitedResource`; `storage/service.py`; `assets/service.py`; `snapshot_engine/service.py` | Track/reserve/release bytes across every storage path and enforce the advertised workspace limit. |
| F25 | P2 | Plan comparison says integrations, MCP and cloud login are paid-tier features, while corresponding access paths have no plan-entitlement check. Cloud login is also retired from current UI but still advertised as a working paid feature. | `billing/plans.py::COMPARISON_CATEGORIES`; `integrations/router.py`; `mcp/router.py`; `cloud_login/service.py`; delivery TDR-0052 entry | Reconcile actual features, UI and server entitlements; retain an explicit decision for compatibility routes. |
| F26 | P2 | Plan boundaries can overshoot by more than the documented one item. Count-then-create checks have no shared reservation: N concurrent project/member/AI requests may all pass. AI credits are recorded only after completion. | `billing/limits.py::require_within_plan_limit/record_ai_credit`; project/member/AI call sites | Atomically reserve capacity or document a deliberate bounded policy; release failed reservations. |
| F27 | P2 | Native Browser review does not submit DOM snapshots. It registers pages and captures comment screenshots, but never calls `submitPageSnapshot`; its worker relay does not allow snapshot routes. Authenticated pages reviewed only natively therefore do not feed the revision/recovery pipeline. | `apps/extension/src/content-script.ts::buildFreshContext`; `src/native-review.ts` API allowlist; `apps/widget/src/page-registration.ts` | Implement scoped native snapshot submission or explicitly describe recovery/version limitations in native review. |
| F28 | P2 | Account notification switches promise per-event email, but gate creation of in-app notifications. Assignment/mention/reply/status handlers only persist/broadcast. Registered email jobs cover daily digests and guest resolution, not these member event emails. Turning an “email” preference off also removes the bell notification. | `features/auth/AccountModal.tsx::NOTIFY_FIELDS`; `notifications/service.py::_create_and_broadcast`; `workers/notifications.py`; `workers/main.py` | Separate in-app and email preferences, implement the selected delivery behavior, and label the switches accurately. |
| F29 | P2 | BugHunt changes priorities without normal mutation events. `analyze_project` calls the repository directly; it sends no comment-updated event, activity entry or notification. The requester invalidates only project comments, so ticket lists, dashboard counts, and other viewers may stay stale. It can also overwrite priority edits made while the model request was running. | `backend/app/modules/ai/service.py::analyze_project`; `features/projects/panel/AiTab.tsx::handleAnalyze` | Use an authorized mutation service, conditional writes and the normal event/cache invalidation contract. |
| F30 | P2 | Project editing can partially save while reporting failure. Settings are PATCHed before metadata/URL/client validation finishes. If the second request fails, settings have already changed. New client/project/link creation is also a multi-step operation that can leave partially completed records. | `features/projects/ProjectForm.tsx` save mutation; `projects/service.py::create_project` | Make the save atomic where possible; otherwise return/report completed steps and make retries/resume idempotent. |
| F31 | P2 | Image/PDF comment creation lacks request idempotency. `AssetCommentCreate` has no client request key; service inserts each time. A lost success response followed by retry can create duplicate tickets. | `assets/schemas.py::AssetCommentCreate`; `assets/service.py::create_comment`; `features/assets/AssetReview.tsx` | Add actor/resource-scoped idempotency using the corrected F04 contract; regenerate API declarations. |
| F32 | P3 | Project/page/project-comment lists are unpaginated and comment serialization performs per-record author/signing work. Native review polls the full page-comment list every 10 seconds. Cost and payload grow with all historical visible comments. | `projects/repository.py::list_for_workspace`; `comments/repository.py::list_for_member/list_for_project`; `comments/service.py::_comment_out`; `apps/extension/src/content-script.ts` poller | Add bounded pagination/deltas, batched author/signing work and measured limits. |
| F33 | P2 | Access changes do not purge sensitive cached subresources. `AccessSync` invalidates the project root (and broad lists), but does not remove old project/page/comment/asset results; React Query retains successful cached data on a failing refetch. Automatic auth loss also clears user/token state without the explicit logout path's cache clear. | `apps/web/src/app/AccessSync.tsx`; `features/auth/AuthContext.tsx`; `lib/query-keys.ts` | Clear protected results on access loss/account identity change, cancel in-flight reads and gate rendering against the current authorization result. |
| F34 | P2 | Expired cached guest identity has no reliable rejoin path. `ReviewEntryPage` restores a stored token without checking expiry, then offers handoff again; its website handoff branch has no Leave/reidentify action. Widget `ensureGuestSession` likewise reuses stored credentials without a 401 reset. Browser review retry reuses the same guest token. | `features/review/ReviewEntryPage.tsx`; `features/review/NativeReviewButton.tsx`; `apps/widget/src/guest-session.ts::ensureGuestSession` | On expired/invalid identity, clear that stored session and return to name/passcode verification with an explicit rejoin action. |
| F35 | P3 | Product/acceptance claims diverge from current code. FD-22/23 still describe AI/billing as nonfunctional, though real paths exist. BugHunt says “Reads every open comment” but sends at most 40 comments, truncated to 400 characters each. Earlier cloud-login/session-sync guidance and many source comments describe retired behavior. | `docs/implementation/02-flow-matrix.md` FD-22/23; `features/projects/panel/AiTab.tsx::CHECKS`; `ai/service.py::MAX_ANALYZED_COMMENTS/analyze_project`; TDR-0048 | Reconcile acceptance rows against current TDRs, state analysis coverage explicitly, and remove stale user-facing guidance. |

## Explicit capability limits

These are not additional proof of bugs. Decide which are acceptable scope and which
must become supported features; do not claim they are already implemented.

| ID | Current limit | Evidence and practical effect |
|---|---|---|
| L01 | Embedded review is not a universal authenticated browser | `proxy/service.py`, `proxy/interceptor.py`, TDR-0048. Separate-domain APIs, OAuth callback/origin rules, storage and bot protections may prevent sign-in. Opening an identity provider in a separate tab does not transfer its resulting session into the canvas. Requests in workers/nested documents are not all intercepted. |
| L02 | No reviewed-site WebSocket or streaming relay | `proxy/service.py` states this boundary and `preview_middleware.py` rejects preview-host WebSockets. Chat/live dashboards and SSE/streaming apps can fail or lose live behavior in embedded review. |
| L03 | Authenticated native review requires desktop extension setup | `NativeReviewButton.tsx`, extension manifest, TDR-0048. Unpacked install/update is manual; no Firefox/Safari/mobile implementation is shipped. Provider/restricted browser pages and cross-origin child frames cannot be annotated. Per-tab review state uses `chrome.storage.session` and is lost on browser restart/update; Chrome documents that lifecycle in its [storage API](https://developer.chrome.com/docs/extensions/reference/api/storage). |
| L04 | Native/embedded pin cards are read-only except eligible member status updates | `apps/widget/src/ui-comment-view.ts`, `thread-manager.ts`, native relay allowlist. No inline reply/edit/delete/guest-resolve control is wired into these cards, although server APIs and richer dashboard/guest-board flows exist. Do not describe those operations as available in every review mode. |
| L05 | Version menu lists metadata; it does not replay historical website versions | `features/projects/footer/VersionMenu.tsx` selects only `revision.page_id`; canvas continues to load the live URL. Server-rendered alternate-browser results are static screenshots with a fresh unauthenticated browser context, not interactive logged-in Safari/Firefox sessions. |
| L06 | Several visible roadmap capabilities remain unavailable | `ProjectForm.tsx`, `ProjectFooter.tsx`, `billing/plans.py`: dedicated Web App/Mobile App project types, deploy-triggered capture, page approval, private canvas-comment mode, video/audio recording, console replay, custom branding/domains and white-label portals. Client digest and global persisted undo/redo also remain outside the shipped UI. Existing responsive web/image/PDF review is separate from these roadmap types. |
| L07 | BugHunt triages existing text feedback, not the website itself | `ai/service.py::analyze_project`. At most 40 open root comments are considered, with 400 characters per comment. It does not crawl pages, attempt target-site login/signup, inspect screenshots or independently discover all website defects. Replies and closed issues are outside that project-analysis prompt. |
| L08 | Asset and proxy submissions have format/size ceilings | `assets/service.py`, `projects/ProjectForm.tsx`, `proxy/service.py`: one unencrypted PDF (1–200 pages) or up to 50 images per project, 20 MiB asset limit, no SVG assets, and 2 MiB proxied form bodies. These constraints need clear preflight messages when they affect a review flow. |

## Recommended repair order and acceptance coverage

1. **Authorization and identity:** F01–F09, F14–F15. Verify guest/team separation,
   cross-project keys, hidden-record idempotency, all revoked-link mutations, revoked
   sockets, private notifications and outbound browser requests. Use isolated tenants.
2. **Sign-in reliability:** F10–F13, F16–F21, F34. Cover first signup, invited signup,
   Google/OTP recovery, refresh after expiry, two tabs, path-based targets, legacy
   cookie deletion, failed capture and stale guest identity. For the originally
   reported limitation, exercise both proxy and native review against the actual
   affected sites before choosing which mode to support.
3. **Persistence and commercial behavior:** F22–F26, F29–F31. Exercise upload/queue
   failure and retry, concurrent limits, partial saves, billing entitlements and
   image/PDF request retries. Preserve legacy records and use additive contracts.
4. **Mode parity and UX:** F27–F28, F32–F35 and accepted L items. Reconcile mode support,
   feedback/email expectations, cache access loss and product promises.

Acceptance mapping: FD-25 (accounts) → F01/F02/F10–F14/F18; FD-08 (review/navigation)
→ F16–F21/F23/F27/L01–L05; FD-09/16/17/19/21 (threads, guest policies and uploads)
→ F03–F08/F15/F31/F34; FD-05/20 (asset/region review) → F21/F31/L08;
FD-10/11/12/15/18/24 (workflow, activity and notifications) → F08/F28/F29/F32/F33;
FD-22/23 (AI/billing) → F24–F26/F29/F35/L07. FD-26 undo/redo remains a capability gap.

## Verification and remaining uncertainty

- Initial frontend command could not find Turbo because dependencies were absent.
  Installed the locked dependencies with `pnpm install --frozen-lockfile`; did not
  update dependency manifests or lockfiles. Backend environment was prepared through
  `uv run --frozen`.
- Passed: backend `ruff check app/ scripts/`; `ruff format --check app/ scripts/`
  (209 files); `scripts/check_workspace_scoping.py` (20 repository files).
- Passed: backend `mypy app/` (194 source files).
- Passed: `pnpm turbo run lint typecheck build` (12/12 tasks, no cache hits), covering
  web, widget, extension, shared UI and generated-types checks where scripts exist.
  Production web build transformed 654 modules; widget and extension builds completed.
  These checks validate compilation/static rules, not the functional scenarios above.
- Passed: `git diff --check`. Only audit/TDR/acceptance/ledger documentation changed;
  generated API declarations and application source were preserved.
- Not executed: test suites, browser journeys, live Google/SSO/payment/email-provider
  checks, real MongoDB/Redis/S3 integration runs, migrations, production probes or deploys.
  Historical checks in `06-delivery.md` do not establish current deployed behavior.
- Still needed: a verified deployed-version/config inventory; actual failing target
  URLs and login methods; desktop/phone/browser matrix; provider readiness and callback
  registrations; wildcard preview DNS/TLS and secure-cookie behavior; worker/browser
  binaries and queues; dry-run migration/index status; accessibility and responsive
  browser pass; load/reconnect/offline behavior; live checkout/webhook verification.
- Billing taxes/receipt details remain an owner decision previously recorded in the
  ledger; this audit makes no legal or production-payment readiness claim.

The source scan found important defects even though the scoping lint passes. That
lint does not establish object ownership, nested notification filtering, replay
authorization or WebSocket lifetime policy.
