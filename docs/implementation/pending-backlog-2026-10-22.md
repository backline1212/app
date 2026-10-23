# Backline pending work — 2026-10-22

This consolidates the current audit, implementation decisions and delivery evidence.
It supersedes older "pending" statements only where a later delivery entry supplies
evidence. The original 35 audit findings are historical findings, not 35 untouched
bugs. This inventory is all currently identified work in the reviewed scope; it is
not proof that every possible defect has been found.

Priority: **P1** = before a wider pilot; **P2** = next reliability/product work;
**P3** = later expansion or refinement. These are backlog priorities, not claims of
a live incident. Status distinguishes **open implementation**, **source implemented /
rollout pending**, **live verification pending**, and **platform limitation**.

## Execution checklist

Work one bounded slice at a time: trace contracts/access rules, record its plan/TDR,
implement, run applicable checks, inspect the diff, commit/push, attempt supported
rollout, and record actual acceptance separately. Never mark full completion from
a source change or build alone. Codex follows AGENTS.md: lint/typecheck/build and
affected backend Ruff/mypy/workspace-scope checks, without new test suites.

| Sequence | Items | Status | Next action |
|---|---|---|---|
| 1 | BUG-01 | Source checked; rollout/acceptance pending | TDR-0104: scoped mappings/current recipient checks; Ruff/mypy/scope pass. |
| 2 | BUG-02 | Source checked; indexes applied; rollout/acceptance pending | TDR-0105: durable scoped recipient rows before checkpoint; leases, bounded scans/retries and recovery sweeps. |
| 3 | DEP-01/02/04 | Pending | Matching source rollout, actual SHA/contracts/ZIP and updated-extension acceptance. |
| 4 | BUG-03 | Web deployed; browser acceptance pending | TDR-0106: served bundle includes one root-route blocker for nested ticket, reply and file drafts. Browser use was disabled at acceptance. |
| 5 | BUG-04 | Source checked; rollout/acceptance pending | TDR-0107: revision-checked comment/ticket/file updates with conflict recovery. |
| 6 | BUG-05 | Source checked; rollout/acceptance pending | TDR-0108/0109: transactional project and comment notifier intent, leases and recovery; additive index applied. |
| 7 | BUG-08 | Portal display web deployed; integration/DOM/proxy-egress slices source checked | TDR-0110/0113/0114/0116 mask portal labels, external page fields, private DOM areas and guest handoff sent through the proxy; screenshot/history/logs/snippet URL and live acceptance remain. |
| 8 | BUG-06/07 | Portal relay web deployed; widget/backend rollout/acceptance pending | TDR-0111/0112 reuse a relay object on retry and avoid new signed grants in first-party flows; historical grants/evidence reconciliation remains. |
| 9 | BUG-12 | Source checked; backend rollout/form acceptance pending | TDR-0115 keeps 307/308 method and body in the legacy proxy form flow. This is not established as the cause of the observed example.com failure. |
| 10 | BUG-14 | Source checked; backend rollout/HEAD acceptance pending | TDR-0118 routes HEAD through proxy root/path and fallback, with bodyless response handling. No observed site failure has been attributed to it. |
| 11 | Remaining FLOW/OPT/FEAT/QA | Pending | Follow priority tables and record dependencies/acceptance per slice. |

## 1. Deployment and release

| ID | Priority | Pending item | Current evidence / completion condition |
|---|---|---|---|
| DEP-01 | P1 | Restore API routing and release the newer API/worker changes together | On 2026-10-24 the API host returned Railway fallback 404 for `/health`, auth capabilities and the legacy extension manifest. Railway's platform incident was in monitoring, but the service-specific cause is unverified. CLI access was unauthorized and the dashboard required login. Reauthorize service access, inspect deployment/domain state and logs, restore routing, then verify exact SHA, contracts, health and jobs. Last successful read-only status had app, worker and cloud-login on `7b25ac3`; later exact-SHA deploy attempts were rejected during a pause. |
| DEP-02 | P1 | Align extension source, download and installed version | Source and public portal ZIP are **0.4.13** with matching hash/manifest under TDR-0130; Vercel rollout succeeded. The API's unversioned ZIP was last fetched at **0.4.4** before the host began returning fallback 404, and the Web Store draft still contains **0.4.9**. Installed Chrome has not been rechecked. Restore API routing, replace the store draft, update installed Chrome and accept replies, snapshots, hash routes and access cleanup. |
| DEP-03 | P2 | Complete Chrome Web Store release | Local icon/store preparation exists separately. Publisher registration/agreements/payment, public policy/support information, real listing screenshots, submission, approval and install URL are still pending. Do not count local ZIP preparation as publication. |
| DEP-04 | P1 | Verify mixed-version rollout and rollback | New web code can meet the older API/SDK. Check capability gates, contract compatibility and preservation of old comments/pages/evidence during upgrade/rollback. |

The web client now distinguishes Railway edge fallback 404 from an application
resource 404 (TDR-0126), deployed in the web bundle with browser acceptance pending. This changes
the user-facing diagnosis; it does not restore a missing API service.
TDR-0127 extends the distinction to native and guest review transports so
transient edge fallback does not clear valid review sessions; the portal
package is deployed, while API rollout and access-denial/outage browser
acceptance remain open.
TDR-0129 extends the same distinction to direct portal guest session, board
and PDF/image requests. Source checks and web rollout pass; live acceptance
remains open.

On 2026-10-24, API `/health` returned Railway edge fallback 404. Earlier
health checks do not prove current availability or newer feature rollout.

## 2. Known bugs and unfinished reliability changes

| ID | Priority | Pending item | Required change / evidence |
|---|---|---|---|
| BUG-01 | P1 | Digest project/recipient privacy — source repaired, not yet verified live | TDR-0104 removes Unknown project disclosure, scopes page/project queries and rechecks current member/verified-email/preference/project access. Static checks pass; rollout and live negative acceptance remain pending. No live leak established. |
| BUG-02 | P2 | Digest delivery durability — source repaired, not yet verified live | TDR-0105 materializes durable recipient rows before checkpoint advance, resumes preparation/scans and records send/retry outcomes. Link-only digests limit queued content exposure. Static checks pass; four additive indexes applied and re-inspected with no conflicts/data changes. Rollout and actual crash/provider acceptance remain pending. |
| BUG-03 | P1 | New-ticket/file-manager SPA navigation protection — deployed, browser acceptance pending | TDR-0106 adds one coordinated router guard for ticket, reply and file review drafts, including nested forms, pending saves, and access-loss cleanup. Lint/typecheck/build pass and the served bundle matches; browser Back/Forward/failure acceptance remains pending while browser use is disabled. |
| BUG-04 | P2 | Concurrent metadata overwrite — source repaired, rollout/acceptance pending | TDR-0107 adds scoped atomic revision checks to member ticket/comment and file edits; new web callers send the viewed revision, 409 retains drafts. Legacy callers without an expectation remain compatible; actual API rollout and two-editor/rapid-edit acceptance are pending. |
| BUG-05 | P2 | Integration dispatch durability — source checked, rollout/acceptance pending | TDR-0108/0109 move project-update and comment create/status notifier intents into their Mongo transactions. Retry/lease worker passes static checks; additive due index is applied. Rollout, provider/crash acceptance and user-visible failed-delivery status remain. Existing snapshot/email outboxes are separate. |
| BUG-06 | P2 | Unused upload grants can retain storage quota — first-party transport source checked | TDR-0112 routes widget/portal review uploads through the API relay; signed PUT reservations deliberately remain held because an earlier request may still finish. Historical/custom-client grants need safe bounded confirmation/reconciliation; never release solely because a URL expired. |
| BUG-07 | P2 | Attachment fallback/orphan handling is incomplete — API-relay source checked | TDR-0111 reuses an actor/project/content key on repeat direct uploads; TDR-0112 retains a failed widget attachment for explicit Retry/Remove. Backend/frontend static checks pass; rollout/acceptance, signed PUT ambiguity, unused evidence and safe orphan reconciliation remain. The PDF/image asset replay contract does not cover every attachment transport. |
| BUG-08 | P1 | Sensitive URL/evidence redaction is incomplete — portal display deployed, integration/DOM/proxy-egress slices source checked | TDR-0110 masks portal labels, TDR-0113 sends origin-only page fields to integrations, TDR-0114 excludes editable/private DOM from new captures, and TDR-0116 removes guest handoff fields from proxy egress. Route/query identity stays exact. Initial Backline/browser URLs, snippet handoff, existing snapshots, screenshots, arbitrary visible text, server logs, user text, live acceptance and other exports remain. |
| BUG-09 | P2 | Preview failure root cause remains unproven | The example.com canvas failed in live checks. Extension/retry/saved-feedback recovery works, but the underlying network/proxy failure was not established. Diagnose with supported network evidence before calling it repaired. |
| BUG-10 | P2 | Legacy hash-route feedback remains merged | New #/ and #!/ identities are implemented in source, awaiting the matching rollout. Old merged feedback stays on the legacy page. Provide a reviewed mapping/reassignment workflow if required; no guessed migration. |
| BUG-11 | P2 | Privacy, Terms and Support links are placeholders | Login footer and signup agreement still link to `#`. Supply actual approved policy/support destinations and verify every entry point. Do not invent legal text or organizational practices. |
| BUG-12 | P2 | Legacy preview changes method-preserving form redirects to GET — source repaired, rollout/acceptance pending | TDR-0115 relays upstream redirect status for legacy `/proxy/{token}/` form requests. Ruff, format, mypy (217 files), workspace scope (25 repositories) and diff checks pass; verify 307/308 POST body and 303 GET with an authorized test site after rollout. This is not proof of the example.com root cause. |
| BUG-14 | P2 | HEAD requests cannot pass through preview routes — source repaired, rollout/acceptance pending | TDR-0118 adds HEAD root/path/fallback routes with bodyless upstream handling. Ruff, format, mypy (217 files), scope (25 repositories) and diff checks pass; actual website/PDF asset probes remain. No production root cause is claimed. |

The two new digest findings are source-derived from
[`digest.py`](../../backend/app/modules/notifications/digest.py), especially
`run_digest_for_workspace`; no email or production state was changed for this audit.

## 3. User flow and product UX

| ID | Priority | Pending item | Completion condition |
|---|---|---|---|
| FLOW-01 | P1 | Finish the consistent connected-review launch flow | Complete CR-02/03 setup, actual SDK readiness and secure short-lived authorization exchange. Widget-first review with extension fallback remains a planned direction, not a universally shipped install-free flow. |
| FLOW-02 | P1 | Make installation, update and reconnect predictable | TDR-0128 no longer calls an unconfirmed website launch connected or allows repeat clicks from its waiting dialog; web deployed, browser acceptance pending while API routing is down. Still complete one project-bound setup, clear installed/connected/outdated/expired states, install/update-and-resume, and a safe return to the original project/thread. Remove manual ZIP friction once a store release exists. |
| FLOW-03 | P1 | Complete target-site login and return acceptance | TDR-0123 keeps the tab-bound session beyond the first 15-second toolbar check; TDR-0130 keeps its toolbar through an initial API outage and retries access. Extension 0.4.13 source/package and public ZIP checks pass; installed acceptance remains. Test real password/Google/other SSO redirects, popups and return URLs with the user's own website account. Keep Backline identity separate and retain the selected issue; no universal login guarantee. |
| FLOW-04 | P2 | Finish website thread-card actions | Native/standalone text replies exist in newer source. Inline editing/deleting, guest resolution, attachments and mentions do not have parity across every adapter. Keep team content in the authorized portal/isolated surface. |
| FLOW-05 | P2 | Improve reopen-on-site and reproduction | Locate the reported route/anchor after login; explain different user data, moved elements, viewport and deployment mismatch. Preserve original evidence and support authorized manual reanchor. |
| FLOW-06 | P2 | Make screenshot quality explicit | TDR-0125 reports saved/failed automatic captures in the on-site composer and thread card; rollout and browser acceptance are pending. Still distinguish approximate DOM capture from native tab capture, and add preview/retry/manual attachment and denial handling that preserve the draft. A generated JPEG alone is not fidelity evidence. |
| FLOW-07 | P2 | Complete session restart/rejoin recovery | TDR-0129 keeps portal guest sessions through Railway edge fallback in status, board and file requests; web rollout passed, browser acceptance pending. Verify browser restart/update, extension expiry, guest link expiry, revoked access and reconnect without stale overlays or wrong-project data. Standalone extension connection/logout policy needs explicit acceptance. |
| FLOW-08 | P2 | Finish narrow, touch and keyboard UX acceptance — file-review shortcut web deployed | TDR-0117 stops global PDF/image shortcuts from taking modified keys or keys in controls/dialogs/tablists. TDR-0131 keeps loaded files/comments visible through refresh errors while hiding them after an explicit access denial; source checks pass, rollout/browser acceptance pending. Actual PDF keyboard/browser acceptance, wrapped toolbar/composer, nested focus, date menus, screen-reader labels, file/page/thread controls, upload errors and return/close paths remain. |
| FLOW-09 | P2 | Keep availability and pricing consistent with actual support | TDR-0124 clarifies native Mobile App's planned status, links existing screenshot review and removes a pricing checkmark from `coming_soon` rows. Remaining: reconcile other capability/readiness labels, limits, legacy guidance and plan comparison. Distinguish implemented features, disabled infrastructure and roadmap features. |

## 4. Performance and optimization

| ID | Priority | Pending item | Completion condition |
|---|---|---|---|
| OPT-01 | P2 | Paginate large project/page/comment collections | Batched enrichment is implemented, but full collection pagination/cursors remain open. Preserve access filtering and complete history. |
| OPT-02 | P2 | Replace full native comment polling with bounded deltas | Current full-page polling grows with history. Add reconnect/removal semantics and a push/delta strategy without weakening revocation. |
| OPT-03 | P2 | Measure real load and database/signing cost | Benchmark large projects, author/evidence enrichment, socket authorization fan-out, snapshot work, memory and latency. No load benchmark is recorded. |
| OPT-04 | P3 | Reduce the large web bundle chunk — web deployed, browser measurement pending | TDR-0119 defers file review and pdf.js: native-review 514.27 kB combined before vs 6.18 kB native review, 25.89 kB file review and 483.14 kB PDF parser after. Build warning cleared; Vercel reports `a86e919` successful and public root HTTP 200. Browser network/startup and image/PDF acceptance remain. |
| OPT-05 | P2 | Set product reliability metrics and a supported-site matrix | Measure launch-to-ready, auth-return success, save/capture success, locate success and rejoin frequency with denominators. Existing spot checks cannot substantiate "99% of websites." |

## 5. Missing features and planned expansion

| ID | Priority | Feature still pending | Actual missing scope |
|---|---|---|---|
| FEAT-01 | P2 | Dedicated Web App review mode | Explicit reproduction/app-state context, sanitized diagnostics and matching MCP contracts; ordinary website review already exists. |
| FEAT-02 | P3 | Native Mobile App review | Build/device records, real-device capture integration, build-linked screenshots/coordinates, permissions and distribution. |
| FEAT-03 | P2 | Video/audio recording | User-initiated permissions/start/stop/cancel, duration/size limits, validated private media storage, playback/download and quota handling. |
| FEAT-04 | P2 | Console/network diagnostics or replay | Opt-in bounded capture, secret redaction, restricted payloads, private evidence timeline and retention/deletion behavior. |
| FEAT-05 | P3 | Custom branding | Tenant-owned branding assets/settings and consistent authorized output. |
| FEAT-06 | P3 | Custom domains | Ownership verification, host/workspace binding, certificates, status/removal and cookie/CORS isolation. |
| FEAT-07 | P3 | White-label client portals | Branding/domain foundation plus guest screens, email identity, support/legal identity and lifecycle acceptance. |
| FEAT-08 | P3 | Persisted undo/redo | Authorized reversible operations, durable history and conflict semantics. Current local controls are not a global undo history. |
| FEAT-09 | P2 | Client digest and configurable digest schedule | Client-facing flow and settings remain separate from existing member daily/feedback emails. |
| FEAT-10 | P3 | Interactive historical website replay | The version menu shows metadata and the live page; normalized DOM is not an archived runnable website. |
| FEAT-11 | P3 | Actual browser/device QA lab | Separate isolated engines/devices, supported authenticated sessions, private-network connectivity, commercial/provider setup and real execution evidence. |
| FEAT-12 | P2 | Complete AI/MCP fix-and-verify loop | Beyond current project/ticket CRUD and briefs: authorized capture evidence, fix/preview reference, verification request/result and human resolve/reopen. Browser authority must be separate. |

## 6. Important capability limits

- An iframe/proxy cannot guarantee arbitrary website login, OAuth, storage, CAPTCHA,
  third-party API or anti-bot compatibility. A real user can complete supported
  challenges in the actual website; that does not make proxy login universal.
- The reviewed-site proxy has no general WebSocket/SSE/streaming relay.
- Desktop Chrome/Edge extension support does not establish Firefox/Safari/mobile,
  restricted browser-page or cross-origin child-frame annotation support.
- Alternate-browser static screenshots are not interactive signed-in browser sessions.
- Asset limits currently include one unencrypted PDF of 1–200 pages or up to 50
  images per project, 20 MiB assets, and no SVG asset review. Proxy form bodies
  have a separate 2 MiB ceiling. These are scope limits unless explicitly expanded.
- BugHunt analyzes bounded existing feedback text (up to 40 open root comments,
  400 characters each); it does not independently crawl/test every site or inspect
  all screenshots. It is not the full QA agent described in the future plan.
- Fresh shared server-browser capture remains disabled pending actual isolation.
  Deploy notification/snapshot receipt does not prove a commit or fix is live.

## 7. Implemented work still needing live verification

These are **acceptance tasks**, not assertions that each repaired behavior is broken.

| ID | Priority | Verification group | Remaining evidence |
|---|---|---|---|
| QA-01 | P1 | Backline authentication | Real signup/email ownership, password recovery, OTP resend/expiry/reuse/concurrency, Google redirect/cookies, logout/password changes and multi-tab recovery. |
| QA-02 | P1 | Native/installed review | Update to the served matching extension, member/guest launch, actual target-site sign-in, reply/save/capture/return, restart and supported SPA/hash navigation. |
| QA-03 | P1 | Persistence and failure recovery | Offline, slow/lost acknowledgement, original retry with one record, double submit, partial upload, failed refresh, copy/manual recovery and page/context changes on all review surfaces. |
| QA-04 | P1 | PDF/image review | Actual private upload, decode, page selection, rotated/zoomed/touch pins, reanchor, guest/member comments/replies, reload persistence, timeout/retry and archived/missing files. |
| QA-05 | P1 | Privacy/access boundaries | Viewer/commenter/editor/manager, team vs guest, wrong workspace/project/object, revoked links/sessions, role/archive changes during HTTP/socket/poll/draft, and cache cleanup. |
| QA-06 | P2 | Email and integrations | Actual OTP/invite/feedback/digest receipt, opt-out/revocation/retry/restart, frozen links after rename, provider deduplication and integration failure recovery. Apps Script deduplication is unverified. |
| QA-07 | P2 | Billing/quotas | Near-limit concurrent projects/members/AI/storage, failed reservations, reconciliation and plan/entitlement behavior. Storage accounting/enforcement is already deployed; do not list it as wholly missing. |
| QA-08 | P2 | Deploy sync/versions/approval | Real signed CI delivery, rotate/revoke/replay/order/role negatives, snapshot association, outbox/recovery, stale approval, approve/reopen and independent route histories. |
| QA-09 | P2 | Metadata and onboarding | Concurrent project/settings/rename/client saves, rollback/replay, missing legacy fields, permission loss and conflict reload/copy flows. Newer project CAS source still needs backend rollout. |
| QA-10 | P2 | AI/MCP and product acceptance | Real provider results, authorized conditional updates/events, read-only vs write tools, evidence/preview verification loop, keyboard/focus/touch and a representative supported-site pilot. |

## 8. Already changed — avoid duplicating this work

- Web session recovery, original reply retries, explicit AI suggestion application,
  draft copying, partial reply uploads and ticket-role controls are implemented.
- Reply, existing-ticket edit and New-ticket unsent Close/Stay/Discard flows have
  live evidence. New ticket's empty-save gate also passed. No new shared record was
  created for those checks.
- File request, PDF preparation/render and screenshot-helper deadlines are in source;
  actual PDF/failure acceptance remains QA-03/04.
- File management, page approval, team notes, deploy sync, asset-upload replay and
  storage-byte accounting have implementations. Their remaining scope is rollout,
  acceptance or the specific gaps above, not blanket "Coming soon" placeholders.
- One earlier approved native comment and screenshot persisted after portal reload;
  existing-login YouTube launch was observed. Those spot checks are not full site,
  provider, extension-version or failure acceptance.

## Recommended execution order

1. Address digest privacy/delivery findings, unblock matching backend/extension
   rollout, and complete core auth/access/save/PDF acceptance.
2. Close nested navigation guards, metadata conflicts, upload reconciliation and
   launch/install/return gaps; finish website thread action parity.
3. Measure and optimize large-project behavior, polling and startup cost.
4. Deliver diagnostics/recording and the scoped AI/MCP verification loop.
5. Expand to native mobile, real browser/device labs, domains and white-label work.

## Sources and check boundary

- [Delivery ledger](06-delivery.md), [historical audit](site-gap-audit-2026-10-19.md),
  [feature inventory](coming-soon-delivery-2026-10-20.md),
  [connected-review plan](connected-review-plan-2026-10-19.md),
  [Chrome store preparation](chrome-web-store-release-2026-10-20.md).
- TDRs 0060–0103, especially 0085/0087/0089 and 0093–0103, distinguish shipped
  contracts, remaining implementation and manual acceptance.
- Read-only checks today: Git state, Railway service SHAs/health, public extension
  ZIP manifest and relevant source. No new deploy, upload, email, shared mutation,
  migration, package installation or test suite was performed for this inventory.
- Existing local extension icon/store changes were preserved.
