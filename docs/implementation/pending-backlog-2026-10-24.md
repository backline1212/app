# Backline pending work and improvement review — 2026-10-24

Date: 2026-10-24 (Asia/Calcutta). Original review baseline: `c583569`.
The matching component observation for this inventory is API, worker and
public web alias `22999a0`; later documentation-only commits can move the web
marker independently of the API and worker.
Scope: documentation and selected source review across web, widget, extension,
API, repositories, workers, contracts, deployment and product plans. This is the
current consolidated inventory, superseding the 2026-10-22 snapshot where evidence
has advanced. Historical audit rows remain historical evidence.

There are **53 existing tracked work items** below: 4 release, 13 reliability,
9 flow, 5 optimization, 12 feature and 10 acceptance items. They overlap: a source
fix, its rollout and its acceptance can appear in separate rows. This is **not
53 unfixed bugs**, an estimate of remaining effort, or proof that all defects have
been found. Fifteen additional recommendations follow, with overlaps identified.

Priority: **P1** before a wider pilot; **P2** next reliability/product work;
**P3** later expansion/refinement. Status means:

- **Open:** implementation or operational work remains.
- **Source:** implementation exists; matching rollout and acceptance remain.
- **Web:** web rollout is recorded; affected live browser behavior remains unverified.
- **Acceptance:** implementation exists, but the stated scenario needs evidence.
- **Roadmap:** an explicitly unshipped capability, separate from a defect.

## Status update - 2026-10-25 (TDR-0146 to TDR-0168)

Source changes merged since this inventory (each with its TDR and delivery-log entry);
rollout and browser/provider acceptance still apply as described below.

| Item | Now |
|---|---|
| FEAT-03 video/audio | Source: screen/voice recording in widget, extension and file review (TDR-0147). |
| FEAT-04 console/network evidence | Source: opt-in, scrubbed capture + steps to reproduce (TDR-0147/0149). |
| FEAT-01 Web App review | Source: Web App/Mobile App project kinds, build/device fields (TDR-0149). |
| FEAT-05/06/07 branding, domains, white-label | Source: client branding, verified review domains, white-label portal (TDR-0150). |
| FEAT-12 fix-and-verify loop | Partial: MCP `submit_fix` + Verified/Reopen in the ticket view (TDR-0158); no automated verification run. |
| OPT-02 extension polling | Source: comment-list fingerprint polling (TDR-0152); file review uses it too (TDR-0167). |
| OPT-03 measurement | Partial: 2,000-comment local measurement; API gzip (5.4 MB → 53 KB) (TDR-0167). |
| SUG-09 file replacement | Source: file versions with per-version pins (TDR-0165). |
| SUG-11 search | Source: ticket-number search, clients in search (TDR-0153/0157). |
| FLOW-01 URL bearer handoff | Source: single-use, two-minute handoff code replaces the session token in the website URL (TDR-0173). Installation ID/allowed-origin setup remains. |
| FEAT-08 undo | Partial: Undo for closing a ticket and for bulk changes (TDR-0179); no persisted global history. |
| FLOW-06 capture control | Source: reviewers can leave the automatic screenshot out (`capture_status: skipped`, TDR-0176). Capture preview remains. |
| FLOW-05 open on site | Source: Open with extension from a selected thread opens it on the live page, after sign-in too (TDR-0174). Manual reanchor and preview/verification history remain. |
| FLOW-04 own comments | Source: Edit/Delete/Mark resolved on the reviewer's own comment in widget, extension and file review (TDR-0172); reply attachments everywhere (TDR-0175); one overlay when snippet + extension (TDR-0169). Mentions stay dashboard-only by decision. |
| SUG-07 interaction consistency | Partial: axe-core WCAG A/AA clean on main pages (TDR-0166); manual a11y acceptance open. |
| BUG-08 (DOM/privacy) | Unchanged. |
| New fixes | Sign-in self-revocation (TDR-0156), stale-chunk crash after deploys (TDR-0159), double widget in preview (TDR-0162), missing-file state (TDR-0161), client reply emails (TDR-0164), security headers (TDR-0168). |

Operator follow-ups from this round: submit extension 0.5.2 to the Chrome Web Store and
set `VITE_EXTENSION_STORE_URL` after approval; run
`scripts.migrate_ticket_numbers --apply` and `scripts.migrate_event_projects --apply`
(dry-run first); make sure the Arq worker and email provider run for client emails.

## Current evidence and first decision

The first review found an API routing outage. Read-only HTTP checks on
2026-10-24 now show:

| Endpoint | Result | Interpretation |
|---|---|---|
| API `/health` | HTTP 200; Mongo/Redis `ok`, API SHA `22999a0`, recent worker SHA `22999a0` with distinct deployment IDs | API routing and recent Arq reporting job are confirmed. Domain queue jobs and live user flows need separate checks. |
| API `/api/v1/auth/capabilities` | HTTP 200 | The sign-in capability endpoint is reachable; actual sign-in remains unverified. |
| API `/openapi.json` | HTTP 200; equal to saved 132-path contract | The running API matches the generated contract for this release. |
| Web `/release.json` at `backline-qa.vercel.app` | HTTP 200 JSON, `Cache-Control: no-store`, full SHA `22999a0` | The public alias served that web build at this checkpoint; web can move independently of the API. |
| Web `/login`, `/privacy`, `/support` | HTTP 200 HTML | The SPA document is served; this alone does not verify rendering, sign-in or policy approval. |

The extension source manifest is **0.4.13**. The latest ledger records a matching
versioned portal ZIP. The API ZIP now also contains the same 0.4.13 files as
the source build after line-ending normalization. The Web Store draft was
last observed at **0.4.9**; installed-browser state is not freshly verified.
GitHub statuses report success for API, worker, cloud-login and Vercel on
`22999a0`; the public exact API-plus-worker smoke gate passed. Browser
acceptance and worker domain-job behavior remain open.

## 1. Deployment and release — 4 items

| ID | Priority/status | Remaining work and completion condition |
|---|---|---|
| DEP-01 | P1 / Partial | API routing recovered: `/health` reports API commit `22999a0`, healthy Mongo/Redis and a recent worker heartbeat at the same revision; live OpenAPI equals the saved contract. The public QA web alias reported `22999a0` through `/release.json` with no-store (TDR-0142). The combined read-only API/worker/web SHA and contract gate passes with independent component revisions (TDR-0141/0144/0145). Restore authenticated Railway/Vercel access for logs/configuration and queue/domain-job evidence; verify rollback and live user flows. A reporting heartbeat is not proof of provider delivery. |
| DEP-02 | P1 / Partial | Extension source, portal ZIP and API ZIP now contain matching 0.4.13 files (archive hashes differ by build metadata/line endings). Replace the older Web Store draft and verify installed Chrome, actual review behavior and download/link surfaces before closing alignment. |
| DEP-03 | P2 / Open | Finish Web Store publisher/trader and contact verification, inspect registration/payment state, replace the draft package, capture real screenshots, complete source-matched data declarations and reviewer access, submit, obtain approval and wire the actual install URL into the product. Public privacy/support source now exists; owner certification and browser acceptance remain. |
| DEP-04 | P1 / Acceptance | A read-only component release matrix now records distinct API and web revisions in the delivery ledger. Exercise old web/new API, new web/old API and SDK version gates; prove compatible legacy reads and rollback without losing comments, pages or private evidence. |

## 2. Reliability, privacy and unfinished repairs — 13 items

| ID | Priority/status | Remaining work and completion condition |
|---|---|---|
| BUG-01 | P1 / Source | Digest privacy repair exists in TDR-0104. Roll out and verify missing/foreign page/project mapping, current recipient membership, verified email, preferences and project access. No live leak was established by this audit. |
| BUG-02 | P2 / Source | Durable digest preparation, recipient outbox, leases and retries exist in TDR-0105; additive indexes are recorded applied. Verify actual provider failure/crash/restart behavior, checkpoint boundaries, duplicate schedules and recipient changes. Provider delivery is not an exactly-once inbox guarantee. |
| BUG-03 | P1 / Web | Coordinated nested draft navigation protection exists in TDR-0106. Verify Back/Forward, nested ticket/reply/file drafts, Stay/Discard, pending writes, ambiguous saves and access-loss cleanup in the deployed browser. |
| BUG-04 | P2 / Source | Revision-checked ticket/comment/file changes exist in TDR-0107. Deploy matching API and verify two editors, rapid quick edits, 409 recovery and retained losing drafts. Legacy callers without a revision expectation remain compatible but do not gain the same protection. |
| BUG-05 | P2 / Source | Transactional project/comment integration intents and worker recovery exist in TDR-0108/0109. Verify provider failures, leases, restarts and duplicate/replayed deliveries. Add user-visible delivery outcomes separately; durable intent is not proof of provider receipt. |
| BUG-06 | P2 / Source + Open | First-party relay avoids creating new signed PUT grants (TDR-0112). Historical/custom-client grants can retain quota. Implement bounded confirmation/reconciliation that accounts for a still-completing upload; URL expiry alone must not release the reservation. |
| BUG-07 | P2 / Source + Open | Direct relay replay and widget Retry/Remove exist in TDR-0111/0112. Deploy and accept partial failures/lost acknowledgements; finish conservative cleanup for unused evidence, ambiguous signed PUTs and orphaned objects. Asset upload replay does not cover every transport. |
| BUG-08 | P1 / Partial | URL labels, integration page fields, new private/editable DOM exclusions, proxy egress, guest file transport, MCP page labels/briefs and ticket board/list path labels have source repairs (TDR-0110/0113/0114/0116/0132/0135/0136); API release is confirmed, while live export and browser acceptance remain. Still address initial browser/Backline URLs, snippet bearer handoff, screenshots, historical snapshots, arbitrary visible text, logs and other exports. No cross-tenant disclosure is claimed from the former MCP page fields. |
| BUG-09 | P2 / Open investigation | The recorded example.com preview failure has no established network/proxy root cause. Capture supported request/response evidence after API recovery, isolate site vs proxy vs API failure and verify a repair on an authorized target. Existing fallback UI does not close the cause. |
| BUG-10 | P2 / Source + Open | New `#/` and `#!/` identity exists (TDR-0096), requiring matching API/SDK rollout and acceptance. Old merged hash-route feedback needs an explicitly reviewed reassignment workflow if recovery is required. Do not infer original routes or silently rewrite history. |
| BUG-11 | P2 / Web + decision | **Corrected stale backlog:** login/signup now link to real `/privacy` and `/support` routes (TDR-0121); these are no longer `#` placeholders. Verify rendering/contact paths and owner approval of service-wide disclosures. There is no standalone Terms route in the current router; decide whether separate terms are required and supply approved content if so. |
| BUG-12 | P2 / Source | Legacy proxy 307/308 method/body preservation exists in TDR-0115. Deploy and verify 307/308 POST preservation and 303 GET against a controlled form/login site. This has not been established as the cause of BUG-09. |
| BUG-14 | P2 / Source | HEAD forwarding and bodyless handling exist in TDR-0118. Deploy and verify root/path/fallback website and PDF/asset probes. No observed production failure is attributed to this source finding. |

BUG-13 does not exist in the previous tracker; IDs are retained without renumbering.

## 3. Product flow and UX — 9 items

| ID | Priority/status | Remaining work and completion condition |
|---|---|---|
| FLOW-01 | P1 / Open | Complete CR-02/03 connected-site setup and launch: public installation ID, exact allowed origins, real SDK readiness and short-lived challenge-bound authorization exchange. Replace reusable URL bearer handoff. Preserve an explicit extension alternative and legacy opt-in migration. Existing snippet/proxy/extension paths do not equal the complete planned flow. |
| FLOW-02 | P1 / Web + Open | TDR-0128/0133 improve waiting, install/update and reload guidance. Accept missing/incompatible/wrong-server/reloaded states; finish project-bound resume, expired/reconnect states and return to the original thread. Store installation remains dependent on DEP-03. |
| FLOW-03 | P1 / Source + Acceptance | TDR-0123/0130 retain native review through slow website sign-in and initial API outage. Install the current extension and verify password/Google/other SSO redirects, popups, return routes, selected ticket and existing website session. Keep Backline identity separate; no universal login claim. |
| FLOW-04 | P2 / Partial | Newer native/standalone source supports text replies. Finish authorized inline edit/delete, guest own-resolution, attachments and mentions across the intended adapters. Embedded member replies/team content stay in the authorized portal or isolated surface. Verify one overlay when widget and extension coexist. |
| FLOW-05 | P2 / Open | Complete Open on site with route/ticket/anchor continuity after login, clear moved/missing element and different user/data/viewport/deployment states, immutable original evidence and authorized manual reanchor. Add fix/preview and verification history under FEAT-12. |
| FLOW-06 | P2 / Partial | TDR-0125 adds saved/failed screenshot outcomes. Accept installed behavior and add capture preview, explicit approximate-DOM vs native quality, retry/manual attachment and denied-permission recovery without losing the draft. JPEG encoding is not fidelity evidence. |
| FLOW-07 | P2 / Partial + Acceptance | TDR-0129 preserves portal guests through edge outages. Verify browser restart/update, extension expiry, guest expiry/rejoin, link revoke, account/workspace changes and standalone disconnect/logout policy. No stale overlay or old-project data may return. |
| FLOW-08 | P2 / Web + Acceptance | TDR-0117/0131 improve file shortcuts and loaded-data recovery. Verify real PDFs/images, touch/zoom/rotation/pins, narrow or wrapped native toolbar/composer, focus/keyboard/screen-reader behavior, menus, date controls, upload errors and safe return/close. |
| FLOW-09 | P2 / Partial | TDR-0124 makes native Mobile App/pricing availability clearer. Reconcile all capability, plan and setup labels against current configuration. Distinguish implemented, unavailable infrastructure and roadmap features; audit optional screenshot/device capture wording and operational SLA claims (SUG-13). |

## 4. Performance and optimization — 5 items

| ID | Priority/status | Remaining work and implementation approach |
|---|---|---|
| OPT-01 | P2 / Open | Add bounded cursor pagination to project/page/project-comment and other unbounded reads. Current project/page/comment repositories still materialize complete lists. Filter by workspace/project/access before paging; use deterministic tie-breaks, enrich only the returned window and preserve full history through Load more. Workspace ticket pagination already exists. |
| OPT-02 | P2 / Open | Native content script fetches the full page comment list every 10 seconds. Introduce authenticated deltas or push with update/delete/layer-change tombstones, reconnect/reset semantics and periodic authorization checks. The existing `since` filter uses creation time; it cannot alone synchronize edits/deletions/revocation safely. |
| OPT-03 | P2 / Open measurement | Benchmark representative large projects: p50/p95 API latency, payload, query/signing work, socket authorization fan-out, snapshot capture, CPU/memory and queue age. Batched author enrichment exists; optimize measured remaining cost. Record controlled local/staging results rather than treating builds as load tests. |
| OPT-04 | P3 / Web + Acceptance | File/PDF lazy loading is implemented (TDR-0119), so do not repeat the original split. Measure actual startup/network behavior. Current build output reports main JS 444.95 kB (140.62 kB gzip), project page 130.21 kB (36.33 gzip), file review 26.34 kB (8.57 gzip), deferred PDF parser 483.14 kB (144.26 gzip), PDF worker 1,265.41 kB and CSS 270.32 kB (49.79 gzip). Check which assets each route actually requests before further splitting. |
| OPT-05 | P2 / Open | Define a supported-site/browser matrix and metrics for launch-to-ready, website auth return, save, capture quality, locate success and rejoin. Report denominators/failure categories. Spot checks do not justify universal or 99% website compatibility. |

## 5. Missing features and expansion — 12 items

| ID | Priority/status | Actual missing scope |
|---|---|---|
| FEAT-01 | P2 / Roadmap | Dedicated Web App review: explicit reproduction/app-state context, sanitized opt-in diagnostics, state-aware navigation and matching MCP contracts. Ordinary authenticated website review already has a path. |
| FEAT-02 | P3 / Roadmap | Native Mobile App review: build/device records, real-device capture integration, version-linked screenshots/coordinates, permissions and distribution. Image/PDF screenshot review is already available and is a separate workflow. |
| FEAT-03 | P2 / Roadmap | Video/audio: explicit permission/start/stop/cancel, visible recording, duration/size limits, supported-browser fallback, validated private storage/quota, playback/download and deletion. |
| FEAT-04 | P2 / Roadmap | Console/network evidence or replay: opt-in bounded buffers, credentials/query redaction, no sensitive headers/bodies by default, private evidence timeline, retention/deletion and clear replay scope. |
| FEAT-05 | P3 / Roadmap | Custom branding: tenant settings/assets, ownership and authorized theme/output application. |
| FEAT-06 | P3 / Roadmap | Custom domains: DNS ownership, host/workspace binding, certificates/status, removal, routing and cookie/CORS isolation. |
| FEAT-07 | P3 / Roadmap | White-label portals: branding/domain foundation, guest gates/files/boards, email identity, title/support/privacy identity and lifecycle acceptance. |
| FEAT-08 | P3 / Roadmap | Durable undo/redo: specify reversible operations, actor authorization, history, conflicts and safe inverse actions. Existing local actions are not global persisted history. |
| FEAT-09 | P2 / Open decision + Roadmap | Client digest and configurable schedule. Existing member daily/feedback mail is different. Use verified recipients and client-only accessible content; never add clients to the member digest query. Decide inert `client_digest_enabled` semantics before enabling it. |
| FEAT-10 | P3 / Roadmap | Historical interactive replay: current version metadata and normalized DOM do not recreate a runnable old website. Define archival scope, asset handling, isolation and retention before promising replay. |
| FEAT-11 | P3 / Roadmap | Real browser/device QA lab: isolated engines/devices and authenticated sessions, private-network strategy, provider/commercial setup and execution evidence. Static alternate-engine screenshots do not supply this. |
| FEAT-12 | P2 / Open | AI/MCP fix-and-verify loop: authorized complete evidence access, issue creation from capture, fix/preview reference, verification request/result/history and human resolve/reopen. Existing MCP project/ticket reads, replies, updates, briefs, tracker export and deploy-history reads are implemented. Browser/repository/deploy authority remains separately authorized. |

## 6. Implemented functionality needing acceptance — 10 items

These are verification groups, not additional claims of broken functionality. Record
browser/provider/manual evidence and current component versions for each scenario.

| ID | Priority | Remaining acceptance |
|---|---|---|
| QA-01 | P1 | Real signup/inbox ownership, legacy identity recovery, password set/reset/change, OTP expiry/resend/reuse/concurrency, configured Google callback/cookies, logout/revocation and multi-tab session/workspace recovery. |
| QA-02 | P1 | Current installed extension; member/guest and standalone launch; target website sign-in, text reply/save/capture/portal return, restart/update, SPA/hash routes and access cleanup. |
| QA-03 | P1 | Offline/slow/lost acknowledgement, exact original retry yielding one record, double submit, partial upload, failed post-save refresh, retained draft/copy and page/context changes across every review surface. |
| QA-04 | P1 | Actual private PDF/image upload/read/decode/render, page and URL selection, rotated/zoomed/touch pins, reanchor, guest/member comments/replies, reload, timeout/retry and archived/missing files. |
| QA-05 | P1 | Viewer/commenter/editor/manager, guest/team/client-contact isolation, wrong tenant/project/object, revoked links/sessions, archive/origin/role changes during HTTP/socket/poll/drafts and cache cleanup. |
| QA-06 | P2 | Actual OTP/invite/feedback/digest receipt; preferences/recipient changes; worker retry/restart; stable links after rename; real notifier/tracker/webhook delivery and duplicates. Apps Script provider deduplication remains unverified. |
| QA-07 | P2 | Real configured Stripe/Razorpay checkout and callback/webhook replay, expired payment/entitlement/renewal/invoice behavior; concurrent near-limit projects/seats/AI/storage; reservation failure/reconciliation. Storage accounting and quota enforcement already have implementations and recorded rollout. |
| QA-08 | P2 | Signed deploy notifications and credential rotate/revoke/replay/order/role negatives, exact route/version association, recovery outbox, approval/reopen and stale approval. Notification receipt never alone proves a commit or fix is live. |
| QA-09 | P2 | Project/client/settings/rename concurrency, request replay/rollback, old/missing fields, permission loss, conflict reload/copy; owner-only permanent-delete preview/graph change/GC/resume acceptance in isolated data if exercised. |
| QA-10 | P2 | Real AI provider outputs/conditional changes/events, MCP read-only vs write permissions, evidence/fix verification once built, accessibility/touch and representative supported-site pilot. |

## 7. Additional implementation and optimization suggestions — 15 recommendations

These are proposals, not newly demonstrated production incidents or blanket
requirements. Some extend tracked items; they must not inflate defect counts.

| ID | Priority | Recommendation, evidence and implementation boundary |
|---|---|---|
| SUG-01 | P1 / Partial | **Expose release/config compatibility clearly.** Live `/health` identifies API and recently reporting worker at `22999a0`; the regenerated OpenAPI matches live (TDR-0140/0144). A repeatable local gate and combined API/worker/web SHA/contract post-deploy smoke command pass (TDR-0141/0145). The public QA alias served full web SHA `22999a0` with no-store at the matching rollout (TDR-0142); web can move independently afterward. Continue with SDK identifiers, versioned capability reporting and compatibility evidence for DEP-04. TDR-0027 deliberately removed GitHub Actions; do not restore it as an assumed requirement. |
| SUG-02 | P1 | **Verify operational recovery.** Record uptime/error/queue alerts, active ownership, database backup and isolated restore drill, private-object recovery/retention strategy and rollback evidence. Inspect credential-rotation evidence, including historical JWT/integration-key follow-ups, without logging secrets or assuming current credentials are compromised. These are unverified operational evidence gaps, not a claim that no backups exist. |
| SUG-03 | P2 | **Show delivery status.** Extend BUG-02/05 with scoped pending/retrying/delivered/failed views, last attempt, safe error text and authorized retry. Include digest/feedback/integration/snapshot backlog age; workers already have outboxes, so build on them. Prevent duplicate manual retry and private payload disclosure. |
| SUG-04 | P2 | **Make storage maintenance an explicit workflow.** Extend BUG-06/07 with dry-run inventory, reservation reconciliation, referenced-object checks, bounded batches, resumable tombstones and metrics. Never delete a file or release held quota merely because a grant expired. |
| SUG-05 | P1/P2 | **Complete evidence privacy controls.** Extend BUG-08/FLOW-06 with capture preview/redaction, clear private-selector policy, retention/deletion policy and support diagnostics that strip credentials. Include MCP/brief/export/log outputs and old objects; preserve exact canonical page identity instead of stripping query parameters indiscriminately. |
| SUG-06 | P2 | **Split the largest files by responsibility.** Current source includes comments service ~70 kB, ProjectOverview ~66 kB, projects service ~44 kB and CommentDetail ~44 kB. Extract access/replay/evidence orchestration and UI hooks/panels incrementally, retaining public interfaces and router/service/repository boundaries. File size is a maintenance signal, not proof of a runtime defect. |
| SUG-07 | P2 | **Finish shared interaction consistency.** A Toast component and existing modal helpers already exist. Standardize their adoption, focus return, route focus, menu semantics, keyboard alternatives, reduced motion, loading stability, long text and 200–400% reflow. Normalize repeated inline styles/design tokens through bounded polish slices. Verify before claiming a specific control is broken. |
| SUG-08 | P3 | **Treat localization as unfinished.** `lib/i18n.ts` intentionally loads English only; Hindi strings on disk are inactive and there is no language picker. If multilingual support is desired, finish string extraction, missing-key fallback, saved preference, dates/numbers/timezones, backend/email error text and RTL/long-string acceptance before exposing a picker. |
| SUG-09 | P2 | **Design immutable file replacement/version mapping.** Manage files supports upload/rename/archive/restore; replacement PDF pages/image versions and pin migration are separate. Preserve old evidence and require explicit page/version mapping, per-file status and rollback before adding Replace/Reorder promises. |
| SUG-10 | P2 | **Make recovery aware of environment/view context.** Current revision identity is workspace/page based. The connected-review plan requires compatible environment/user-view context so personalized DOMs do not redefine a shared canonical revision indiscriminately. Define additive context keys, uncertainty and authorized reanchor history; this review has not reproduced a production overwrite. Clarify the inert `reanchor_on_deploy` setting using a TDR rather than gating normal recovery silently. |
| SUG-11 | P2/P3 | **Improve search based on measured use.** Extend bounded current search with explicit grouping/ranking, client search and reliable placed-ticket deep links where still missing. Measure before selecting a search provider; preserve permission filtering, URL state, result limits and cancellation. Existing search is implemented, not absent. |
| SUG-12 | P3 / product choice | **Define the next identity/security scope.** Decide whether verified guest email/domain invitations, TOTP/passkeys or workspace enterprise SSO are desired. Current Google sign-in/password/OTP/session controls are different capabilities. Legacy Origin/Referer share filters do not verify a reviewer's identity; new unsupported restriction/export options are deliberately rejected. No fake 2FA or automatic privilege expansion. |
| SUG-13 | P2 / Partial | **Audit commercial claims and billing decisions.** Capture and optional-metadata rows are qualified, and the unverified four-hour enterprise support promise is removed from source copy (TDR-0137). Deploy and accept the pricing page; certify actual support arrangements, including priority email, and record invoice/tax/receipt and plan-change policy decisions. This is a source wording/operational check, not tax advice or evidence of payment fraud. |
| SUG-14 | P3 / Partial | **Remove unused runtime weight deliberately.** `google-genai==0.3.0` was removed from the backend manifest/lockfile after confirming no runtime imports (TDR-0138). Google sign-in and the directly used Pillow pin remain. Verify API/worker container builds on release. Review dependency freshness through a separate supported update/security pass; this audit did not query vulnerability databases or recommend unverified version upgrades. |
| SUG-15 | P1/P2 / Partial | **Reconcile project documentation.** README, launch-readiness and the original backend plan now distinguish historical M0–M12/CI/test claims from the current inventory and delivery ledger (TDR-0139). Continue reviewing older pages as needed; do not treat unchecked audit boxes as new work when later TDRs/source supersede them. Update acceptance rows from actual evidence, not compilation alone. |

## 8. Platform limits and deliberate choices

- Proxy/iframe review cannot guarantee arbitrary password/SSO, cookies, CAPTCHA,
  third-party APIs or anti-bot support. Actual-site native review has a different
  compatibility boundary. No general reviewed-site WebSocket/SSE/streaming relay exists.
- Desktop Chrome/Edge extension behavior does not establish Safari/Firefox/mobile,
  restricted browser-page or cross-origin child-frame annotation support. Session
  storage/reconnect behavior must be accepted after restart/update.
- Fresh shared server-browser work defaults off under TDR-0065. Actual network and
  credential isolation is required before enabling it. Static captures and disabled
  cloud-login paths are not a signed-in browser/device lab.
- One unencrypted PDF of 1–200 pages or up to 50 images, 20 MiB asset limits, no SVG
  review and a separate 2 MiB proxy form limit remain documented scope. Decide any
  expansion explicitly; do not classify the limit itself as a bug.
- BugHunt reads bounded existing feedback text (up to 40 open roots, 400 characters
  each); it is not an independent crawler, screenshot analyzer or universal QA agent.
- Member/team content and client contact records remain outside guest/page-context
  access. A public installation ID, URL, display name or origin header is not identity.
- Per-member Slack channel mute and inbound two-way provider synchronization are
  optional product decisions, not established parity blockers. Channel delivery and
  personal notification preferences require distinct semantics. Custom outbound
  webhooks already appear in the integration contract; do not list them as absent.
- Historical replay, auto-resolve, unlimited browser support and zero-install
  authenticated compatibility remain unshipped unless their exact scope is accepted.

## 9. Work already implemented — avoid rebuilding it

Current source/ledger includes password/OTP/Google and session controls; workspace
and project roles, room codes and org chart; clients and bounded search; tickets,
board/calendar and replies; file management and PDF/image review; page approval and
team notes; signed deploy notifications/recovery; storage byte accounting; genuine
Stripe/Razorpay paths; Groq AI and credit reservations; real notifier/tracker/webhook
providers including Jira/Asana; and a personal-token MCP server.

Some have recorded live spot checks, but that does not close all QA rows. In
particular, earlier saved native comment/screenshot persistence and signed-in YouTube
launch do not establish the current 0.4.13 build, all providers/sites, PDF behavior,
failure recovery or role isolation. Preserve those evidence boundaries.

## 10. Suggested execution order and implementation approach

1. **Recover the running service:** DEP-01/02/04, compatible API/worker/SDK release,
   then auth/access smoke checks. Capture exact revisions and rollback target.
2. **Complete pilot safety and core saves:** BUG-01/08, QA-01..05, CR-01 acceptance,
   actual PDF/image and current extension use. Close observed failures with bounded
   source changes; keep unsupported server-browser execution disabled.
3. **Finish connected setup and launch:** CR-02/03, FLOW-01..03/07 and replacement
   of reusable URL bearer handoff. Scope contracts in Pydantic, export OpenAPI and
   regenerate `packages/types`; retain legacy reads and explicit migration choice.
4. **Finish consistency and evidence:** BUG-02..07/10/12/14, thread actions, capture
   quality, context-aware recovery, conflict/draft/retry and worker/provider evidence.
5. **Measure then optimize:** OPT-01..05; paginate first, design complete deltas,
   measure query/signing/CPU/network cost and then split or cache proven hot paths.
6. **Complete the useful fix loop:** FEAT-12, portal evidence/preview and human
   verification, then opt-in diagnostics/recording/Web App context (FEAT-01/03/04).
7. **Expand deliberately:** client digests, branding/domains, mobile/device lab,
   historical replay, undo/redo, identity expansion and localization according to
   product demand. No completion dates/effort estimates are inferred from this audit.

Each application slice should have a dated TDR, access/legacy/contract trace,
recorded applicable lint/typecheck/build and backend scoping checks, separate rollout
evidence, and manual acceptance of the stated exit conditions. Follow the current
AGENTS.md Codex rule: do not add or run test suites for this task. Keep database
changes additive and migrations dry-run-first; never use shared destructive fixtures.

## 11. Verification performed in this review

| Check | Result |
|---|---|
| Initial Git status | Clean at `c583569`; existing user files preserved. |
| `pnpm exec turbo run lint typecheck build` | Passed: 12/12 tasks; 5 cache hits, 7 executed. No automated test task requested. Build sizes above come from this matching build output, including cached logs. |
| Backend `.venv/Scripts/python.exe -m ruff check app` | Passed. |
| Backend `.venv/Scripts/python.exe -m mypy app` | Passed: 217 source files. |
| Backend `.venv/Scripts/python.exe scripts/check_workspace_scoping.py` | Passed: 25 repository files. This static check alone does not prove all object/replay/socket authorization. |
| Compare `app.openapi()` with `packages/types/openapi.json` without lifespan/DB startup | Matched; 132 path entries. No contracts or generated declarations changed. This checks the JSON contract, not full live API behavior. |
| Read-only public HTTP probes | API health/capabilities 404 edge fallback; web login/privacy/support HTML 200. Web browsing tool could not access these hosts; direct HTTP supplied the observations. |
| `git diff --check` and local Markdown link checks | Passed; all local link targets in the five changed documents exist. Inventory check confirmed 53 unique tracked IDs and 15 unique recommendation IDs. |

No browser journey, new test suite, provider send, production write, credential
change, migration, deploy, dependency installation, store action or live database
operation was performed. Application source and generated API contracts were not
edited. A review of selected source paths cannot certify every line or discover
every possible defect.

## 12. Source map

- Current product/architecture: [implementation index](00-index.md),
  [PRD](01-prd.md), [flow/acceptance matrix](02-flow-matrix.md),
  [backend plan](04-backend.md), [database plan](05-database.md),
  [spec index](../spec/00-README.md), [system architecture](../spec/03-System-Architecture.md).
- Delivery and current direction: [ledger](06-delivery.md),
  [previous backlog](pending-backlog-2026-10-22.md),
  [historical 35-finding audit](site-gap-audit-2026-10-19.md),
  [connected-review plan](connected-review-plan-2026-10-19.md),
  [feature inventory](coming-soon-delivery-2026-10-20.md),
  [extension release handoff](chrome-web-store-release-2026-10-20.md).
- Deployment/legacy reconciliation: [direct deployment decision](../tdr/0027-direct-platform-deploys-without-github-actions.md),
  [server isolation gate](../tdr/0065-server-browser-isolation-gate.md),
  [inert settings decisions](../tdr/0015-guest-self-resolve-and-undecided-project-settings.md),
  [historical readiness plan](production-readiness-master-plan-2026-09-13.md),
  [historical launch readiness](../launch-readiness.md),
  [historical backend plan](../../backend/docs/completion-plan.md).
- Source anchors: web `app/router.tsx`, `features/pages/PublicInfoPages.tsx`,
  `features/auth/LoginPage.tsx`, `features/projects`, `features/assets`, `lib/i18n.ts`;
  extension `manifest.json`, `src/content-script.ts`, `src/native-review.ts`,
  `src/native-client.ts`; widget thread/capture/transport modules; backend project,
  page/comment repositories and services, storage/quota, snapshot revisions,
  notifications/digest, integrations/delivery, MCP tools, billing plans and
  `pyproject.toml`. Latest applicable decisions run through TDR-0133.
