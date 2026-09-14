# Backline — Production Readiness Master Plan
**Date:** 2026-09-13. Compiled from a 6-agent parallel audit (2 frontend, 1 UI-bug trace, 3 backend) covering every frontend feature, every backend module, and the frontend↔backend gap map. This is the single working document for the "ship to production in a few days" push — check items off as you go. Full agent transcripts are not preserved; this file is the source of truth going forward.

**Status update — 2026-09-14:** Parts A, B, C, D, E, and G1-G3 are all fixed and committed to the working tree (not yet pushed/committed to git — see the resume prompt at the bottom of this doc). F1's real-provider half (Slack/Trello/ClickUp toggle) is wired up; F1's Jira/Asana decision, F2, F3(cleanup - done), G4-G6 (cosmetic polish), and Part I (the Slack/MCP feature build) are still open. Verified via `mypy`/`ruff`/`tsc`/`eslint` (all clean) — the backend `pytest` suite could **not** be run in this environment (no local MongoDB/Redis binary available; `infra/local/start-all.sh` fails on missing `mongod`). Run it before trusting this beyond static verification.

**Headline finding, so you don't over-scope the work:** the app is in much better shape than it looked from the outside. There is **no hidden fake/mock data** anywhere in the real product (dashboards, lists, stats are all backend-driven), and **all 16 frontend features have real, matching, reachable backend endpoints** — nothing is silently stubbed. The real problems are: a handful of **serious security bugs** (fix these before any public launch, not after), a few **dead links/components**, one **actively-flashing UI bug** with a confirmed root cause, and a **handful of honestly-disclosed "coming soon" shells** (Jira/Asana toggles, MCP connectors, billing/usage pages) that are a product decision, not a hidden bug.

---

## Part A — CRITICAL bugs (fix before launch, no exceptions)

- [x] **A1. Committed encryption key in source** — FIXED: startup now fails outside `environment == "local"` if unset (`config.py`). Rotating the actual key + re-encrypting existing stored secrets is still an operational step you need to do against your real deployment. — `backend/app/core/config.py:46`. `integrations_encryption_key` defaults to a real, working Fernet key committed in the repo, not a placeholder. Anyone who reads this repo can decrypt every OAuth token stored at rest (ClickUp tokens etc.) in any environment that doesn't explicitly override the env var. **Fix:** remove the default entirely, make the app fail to start if `INTEGRATIONS_ENCRYPTION_KEY` is unset outside `environment == "local"`, and rotate the key + re-encrypt existing stored secrets.
- [x] **A2. Default JWT signing secret** — FIXED: same startup guard as A1. — `backend/app/core/config.py:22`. Defaults to literal `"dev-only-change-me"` with no startup guard for non-local environments. If ever deployed unchanged, anyone can forge access/guest JWTs. **Fix:** same pattern as A1 — fail-fast on boot if unset outside local, rotate before launch.
- [x] **A3. AI summarize/suggest-reply endpoints have no workspace check (cross-tenant IDOR)** — FIXED: router now derives `workspace_id` from the caller's own session via `require_permission`/`require_workspace_context`, never the path param. — `backend/app/modules/ai/router.py:13-38` + `backend/app/modules/ai/service.py:24-28`. Only checks the comment's *stored* workspace matches the `workspace_id` **path param** — never that the *caller* belongs to that workspace. Any authenticated user (or guest session) can read AI summaries of any other tenant's comment threads by guessing/enumerating `workspace_id` + `comment_id`. **Fix:** add the same `require_workspace_match`/permission check every other router uses. Also validate the unused `project_id` path param.
- [x] **A4. Unauthenticated SSRF via the proxy feature** — FIXED: new `core/ssrf_guard.py`, save-time IP-literal check in `normalize_origin`, fetch-time DNS-resolution check re-validated on every manual redirect hop (auto-follow disabled). — `backend/app/modules/proxy/service.py:54-105` + `projects/schemas.py:11-23` (`normalize_origin`). The public, share-token-gated `/proxy/{token}/...` route does a server-side fetch to `project["target_origin"]` with `follow_redirects=True`, and origin validation never blocks private/loopback/link-local IPs (127.0.0.1, 169.254.169.254 cloud metadata, 10.x/192.168.x). A workspace member can point `target_origin` at an internal address, share the link, and anyone can then read back internal responses. **Fix:** resolve and block private/reserved IP ranges at both save-time and fetch-time, and disable `follow_redirects` or re-validate every redirect hop.
- [x] **A5. SSRF via browser-render worker** — FIXED: `assert_safe_to_fetch` guard before Playwright ever navigates. — `backend/app/modules/browser_render/service.py:48-198`. Playwright navigates to `page["url_normalized"]` with no origin allowlist tying it to the project's `target_origin`. A project member can get the render worker to screenshot arbitrary/internal URLs. **Fix:** same allowlist/private-IP-block approach as A4, scoped to the page's project origin.

## Part B — HIGH priority bugs

- [x] **B1. Rate limiter trusts spoofable `X-Forwarded-For`** — FIXED: now trusts the last (proxy-appended) hop, not the first (client-controlled) one. — `backend/app/core/rate_limit.py:16-22`. Used for OTP request throttling and guest passcode attempts. If the app is ever reachable directly (or the proxy doesn't overwrite the header), an attacker can rotate the header for unlimited buckets — defeats OTP-spam and guest-passcode brute-force protection. **Fix:** only trust `X-Forwarded-For`/`X-Real-IP` when set by your own trusted proxy (verify against Railway's actual forwarding behavior), otherwise fall back to the raw socket IP.
- [x] **B2. Comment `assignee_id` (legacy singular field) skips membership validation** — FIXED: validation now runs against whatever ended up in `patch`, regardless of source field. — `backend/app/modules/comments/service.py:774-784`. Supplying only `assignee_id` (not `assignee_ids`) bypasses the workspace-membership check that the plural field path already does correctly. Any member with `comment:update_status` can set it to an arbitrary string. **Fix:** validate `assignee_id` the same way `assignee_ids` is validated.
- [x] **B3. Crash site for B2** — FIXED: uses `to_object_id()` now (also fixed the same pattern in `family_is_active`). — `backend/app/modules/auth/repository.py:19-20`. `find_by_id` calls `ObjectId(user_id)` with no `InvalidId` handling (unlike the `to_object_id()` helper used elsewhere). A malformed assignee written via B2 later 500s CSV export (`projects/service.py:427-431`) and the guest board (`comments/service.py:992-996`) for the **entire project**. **Fix:** use `to_object_id()` here, or wrap in try/except.
- [x] **B4. Trello credentials stored in plaintext** — FIXED: encrypted the same way ClickUp's token is. — `backend/app/modules/integrations/service.py:64` (`config_json = {"api_key": ..., "token": ..., "list_id": ...}`), inconsistent with ClickUp's `encrypt_secret(token)` a few lines below. A DB read/backup leak exposes usable Trello credentials directly. **Fix:** encrypt Trello's `api_key`/`token` the same way ClickUp's are encrypted.
- [x] **B5. Slack webhook URL SSRF** — FIXED: `SlackIntegrationCreate` now validates `webhook_url` host is exactly `hooks.slack.com`. — `backend/app/modules/integrations/service.py:57-62` + `schemas.py:11`. `webhook_url` has no domain allowlist (only `min_length=1`); the backend will POST to whatever URL is configured, both on connect-test and every future dispatch. **Fix:** require the URL host to match `hooks.slack.com` (or an explicit allowlist) before saving/using it.

## Part C — MEDIUM priority bugs (fix soon, not necessarily pre-launch blockers)

- [x] **C1.** (FIXED — retries on `DuplicateKeyError` with the next candidate slug.) Workspace creation slug-uniqueness is check-then-act, not atomic — `workspaces/service.py:54-66`. Concurrent identical-name creates can hit an uncaught `DuplicateKeyError` → 500 instead of a clean 409.
- [x] **C2.** (FIXED — compensating delete of the workspace if the membership insert fails.) Workspace + owner-membership insert are two non-transactional writes — `workspaces/service.py:61-66`. A failure between them orphans a workspace with no owner and no repair path.
- [x] **C3.** (FIXED — catches `DuplicateKeyError`, returns 409.) Same check-then-act race on member invites — `workspaces/service.py:161-173` — uncaught `DuplicateKeyError` instead of 409.
- [x] **C4.** (FIXED — register_page falls back to the existing doc on race, create_page returns 409.) `register_page`/`create_page` promise idempotency but aren't race-safe against the unique index — `pages/service.py:29-52, 65-91`. Concurrent registration of the same URL (realistic for a widget on a busy page) can 500 instead of returning the existing page.
- [x] **C5.** (FIXED — idempotency guard checks `revision_diffs` for this (page_id, revision_id) before doing any work, backed by a new unique index.) Recovery pipeline isn't retry-idempotent — `recovery_engine/service.py:89-199`. Arq job retries duplicate `revision_diffs` rows (doubling change counts in `list_project_revisions`) and can prematurely mark comments `permanently_orphaned` by re-incrementing an already-persisted streak.
- [x] **C6.** (FIXED — new partial unique index enforces at most one `is_current: true` per page at the DB layer, with an app-level retry loop.) Snapshot submission race — `snapshot_engine/service.py:75-149`. Non-atomic read-current → insert-new → mark-old-not-current sequence; concurrent submissions for the same page can leave two revisions both `is_current: True`.
- [x] **C7.** (FIXED — atomic compare-and-swap claims the digest window before sending; N+1 batched via `find_many_by_ids`.) Digest emails aren't retry-safe and can duplicate-send — `notifications/digest.py:48-88`. Emails go out before the checkpoint write; a crash or overlapping run re-sends the same digest. Also an N+1 (`find_by_id` per member instead of one `$in` query, lines 80-85).
- [x] **C8.** (FIXED — `html.escape` on both fields.) HTML injection in guest-resolved emails — `backend/app/workers/notifications.py:11-22`. `comment_body`/`guest_name` interpolated into email HTML with no escaping (unlike `digest.py` which correctly uses `html.escape`). Lets a comment author inject arbitrary HTML/links into an outgoing email.
- [x] **C9.** (FIXED — falls through to Resend on a Google Apps Script failure instead of re-raising.) Email fallback chain is broken — `backend/app/core/email.py:18-40`. If Google Apps Script is configured but fails, the exception is re-raised instead of falling through to Resend — a GAS outage kills all email (OTP, invites) even with Resend configured.
- [x] **C10.** (FIXED — `page_id` validated against the connecting actor's workspace/project before use.) Realtime presence spoofing — `backend/app/modules/realtime/router.py:39-113`. `page_id` query param isn't validated as belonging to the connecting actor's workspace before being broadcast — a member/guest can spoof presence for a foreign page into their own workspace channel.
- [x] **C11.** (FIXED — both now catch `KeyError` too.) Trello/ClickUp card-creation return values sit outside the `try/except` — `trello.py:62`, `clickup.py:82`. A malformed API response 500s instead of raising the intended `ExternalServiceError`.
- [x] **C12.** (FIXED — best-effort delete of the card/task on attachment-upload failure.) Screenshot-attachment upload happens after card/task creation with no cleanup on failure — `trello.py:52-57`, `clickup.py:72-78`. Failure leaves an orphaned card/task and invites duplicate-creation on retry.

## Part D — LOW priority / cleanup

- [x] D1. (FIXED — real HMAC now, plus a `secrets_match` constant-time comparison used for OTP verification.) `hash_secret` is `sha256(key:value)` not real HMAC, and OTP verification uses `!=` instead of `hmac.compare_digest` (share-link passcode already does this correctly) — `core/security.py:108-112`, `auth/service.py:165`. Minor timing-channel exposure.
- [x] D2. (FIXED — real prefix check.) `check_domain_restriction` uses `str.lstrip("*.")` which strips characters, not the literal prefix — `share_links/policy.py:58`. Works by coincidence for the normal case; fix with a proper prefix check.
- [x] D3. (FIXED — batched member-name resolution via a cache + `find_many_by_ids`.) Dashboard `list_tickets` N+1 — `dashboard/service.py:106-129`. Up to ~100 sequential lookups per ticket page instead of a batched author/attachment resolution.
- [ ] D4. No incoming-webhook receivers exist for Slack/ClickUp/Trello (outbound only) — not a bug, just confirming there's no unvalidated-inbound-payload surface to worry about here.

---

## Part E — The flashing red error box (root cause found)

**What you're seeing:** the red "You are offline. Changes may not be saved." / "Reconnecting to Backline…" banner (`.bl-conn-banner`), rendered inside the main content pane in `apps/web/src/app/layout/WorkspaceLayout.tsx:177-190`.

**Why it flashes:** `connStatus` (`apps/web/src/stores/connectionStore.ts:14-17`) defaults to `"disconnected"` on mount. `WSProvider` (mounted once near the app root) only calls `client.connect()` in a `useEffect` that fires *after* first paint — so on every login, page refresh, and workspace switch, the red banner is already visible for one frame before the socket even starts connecting. It disappears the instant `onopen` fires (typically tens–hundreds of ms later). It only replays on load/login/workspace-switch, not on ordinary navigation — which matches "I only see it sometimes."

- [x] **E1 (fix — DONE).** Don't render the banner during the initial connect attempt. Either: (a) add a distinct `"connecting"` status separate from `"disconnected"`/`"reconnecting"` and only banner on the latter two, or (b) debounce: only show the banner if `connStatus !== "connected"` for >400-600ms, clearing the timer on success. Files: `apps/web/src/stores/connectionStore.ts`, `apps/web/src/app/WSProvider.tsx:28-36`, `apps/web/src/app/layout/WorkspaceLayout.tsx:177-190`.
- [x] E2 (DONE as a precaution — secondary, lower confidence — investigate only if E1 doesn't fully resolve it). `TicketsPage.tsx:180-184` renders `update.error?.message` as a red `.bl-error` box; a mutation's error only clears on the next `mutate()` call, so a flash requires two rapid `update.mutate()` calls (e.g. a double-fire on drag-drop). `TicketBoard.tsx`'s `onDrop` has no guard against re-firing while `update.isPending` (the `StatusSelect` path already has one via `disabled={update.isPending}`). Add the same guard to `onDrop`, and/or call `update.reset()` at the start of a new action.

---

## Part F — Static/dummy data inventory

**Good news: there is no fake data problem in this app.** A dedicated audit grepped for mock/faker/Math.random/sample-data patterns and manually reviewed every dashboard, list, and stat tile across all 16 features (dashboard, projects, clients, tickets, board, activity, notifications, integrations, assets, review, workspaces, auth). Everything traces back to a real `useQuery`/API call backed by a real backend module. Nothing needs to be "de-mocked."

The only residual items are **honestly-disclosed, non-functional UI shells** — not hidden fake data, but still worth a decision before launch since they could visually mislead a user:

- [x] **F1a (DONE).** Slack/Trello/ClickUp toggles in `IntegrationsTab.tsx` now reflect real connection state (`listIntegrations`) and disconnect for real; turning one on navigates to the full Integrations settings page (can't collect webhook URL/API key in a toggle).
- [ ] **F1b (still open — your call).** Jira/Asana still have no backend at all. Currently shown as a visibly-disabled "Coming soon" row (not a live toggle) rather than removed entirely — decide whether to keep that or drop them from the list until real backend work is scoped (see Part H).
- [ ] **F2.** `apps/web/src/features/projects/panel/McpTab.tsx` + `apps/web/src/features/workspaces/McpServerPage.tsx` — connector list (Claude/Cursor/Codex/Antigravity) where "Connect" is a no-op toast. Correctly disclosed as "coming soon." Decide: ship as-is (already honest), or make the "not real yet" badge more prominent. Real build plan is in Part H.
- [x] F3 (DONE). Stale comment describing a `PLACEHOLDER_OPEN_SPLIT` constant that no longer exists — `apps/web/src/styles/backline.css:557-563`. Delete the comment; `ProjectsPage.tsx:212` already uses real per-status counts.
- [ ] F4 (no action needed). `LoginPage.tsx:229-262`'s marketing-panel sample comment thread is `aria-hidden`, decorative, and never presented as real user data — leave as-is unless you want the illustration content changed for other reasons.

---

## Part G — Frontend page/route completeness

17 routes were enumerated from `apps/web/src/app/router.tsx` and every page was individually reviewed. **Verdict: the "many pages look undeveloped" concern is largely unfounded** — every routed page has a full layout, loading/error/empty states, and dark-mode-safe styling. The real, concrete issues:

- [x] **G1 (dead links — DONE).** `apps/web/src/features/projects/ProjectsPage.tsx:~255` — "Web App · Soon" / "Mobile · Soon" tabs render real `<Link to="/apps">` / `<Link to="/mobile">`, but neither route exists in `router.tsx` → falls through to `NotFoundPage`. **Fix:** replace with disabled `<span>`/buttons matching how every other "coming soon" surface (`ComingSoonModal`, `AiTab`, `McpTab`) discloses unbuilt features without a live link.
- [x] **G2 (dead components — DONE, deleted).** `apps/web/src/features/workspaces/ProjectCard.tsx`, `NewProjectMenu.tsx`, `NewProjectModal.tsx` — fully written but imported nowhere; superseded by `ProjectsPage.tsx`'s inline card renderer and `ProjectForm.tsx`. Also visually inconsistent (raw Tailwind vs. the app's `bl-*` CSS-variable system). **Fix:** delete, or move out of `features/` if intentionally kept as a redesign reference.
- [x] **G3 (dark-mode color miss — DONE).** `apps/web/src/features/assets/AssetReview.tsx:~236-244` — comment-pin resize handle hardcodes `background: 'white', border: '1px solid black'` while everything else in the file is theme-aware via CSS vars. **Fix:** swap to `var(--bl-*)`.
- [ ] G4 (visual-weight polish, not a bug). `UsagePage.tsx`, `BillingPage.tsx`, `McpServerPage.tsx`, `projects/panel/McpTab.tsx` are the thinnest-looking pages in the app (single card/paragraph) — these are the ones most likely to read as "unfinished" in a walkthrough even though they're intentionally-disclosed placeholders. Give them the same visual treatment as `AiTab.tsx` (icon/graphic block + short "what's coming" list) rather than a bare text card.
- [ ] G5 (consistency nit, not a bug). `SettingsPage.tsx`, `IntegrationsPage.tsx`, `ExtensionSettingsPage.tsx`, `MembersPage.tsx`, `BillingPage.tsx`, `McpServerPage.tsx`, `ShareLinksPage.tsx` use ad-hoc inline `style={{}}` for layout instead of the `bl-*` classes the rest of the app uses. Renders fine and is dark-mode-safe, but normalize during a polish pass.
- [ ] G6 (optional second pass). Not individually deep-reviewed but sampled as fine: `TicketDetail.tsx` and `CollaboratorsModal.tsx` are the two most complex sub-components worth a closer look if you want zero blind spots before shipping.

---

## Part H — Frontend↔backend gap map (mostly complete — here's what's actually missing)

All 16 frontend feature folders were checked call-by-call against backend routes. **Every frontend API call resolves to a real, matching, reachable backend endpoint.** No dead frontend calls, no stubbed backend modules. The naming between frontend folders and backend modules doesn't always match 1:1 (e.g. frontend "dashboard" folder = backend `/search`; "tickets" lives in the `dashboard` module; revisions live in `snapshot_engine` not `revision_engine`) but nothing is functionally missing because of it.

**The only genuinely unbuilt frontend-facing features** are the ones already flagged as honest placeholders in Part F/G:
- Jira/Asana integrations (no backend at all) — Part F1.
- MCP agent-connector feature (Claude/Cursor/Codex/Antigravity) — Part F2, full architecture already scoped in `docs/implementation/slack-ai-mcp-architecture.md` (see Part I below).
- Billing/Usage pages — intentionally deferred, no backend, correctly disclosed.

---

## Part I — Slack + AI/MCP integration plan

A full architecture doc already exists from a prior session: **`docs/implementation/slack-ai-mcp-architecture.md`** — read that file in full before starting this work; the summary below is just the checklist derived from it.

**Key facts it establishes:**
- Slack integration is **already real and shipped** (incoming webhook, not OAuth — deliberate MVP choice). Gaps: no delivery/retry table, no per-project/per-member notification opt-outs, "project updated" events aren't wired.
- There are **two unrelated "AI" features** in this codebase — don't conflate them: (1) `backend/app/modules/ai/` — real, shipped, Gemini-backed thread-summarizer/reply-drafter (has the A3 security bug above, otherwise done); (2) the MCP agent-connector feature in `McpTab.tsx`/`McpServerPage.tsx` — **not built yet**, this is what "connect Claude/Cursor/Codex/Antigravity" actually refers to.
- **Open decision needed from you:** the shipped AI summarizer defaults to Google Gemini, which contradicts this project's own stated provider preference (Claude/Anthropic) in `MASTER_PROMPT.md`. Decide: keep Gemini, migrate to the Claude API, or run both behind a per-workspace setting. Blocks nothing else — just needs a decision before someone builds on top of it.

**Build order from the architecture doc:**
1. `webhook_events` + `webhook_deliveries` tables — unblocks real Slack delivery retries, prerequisite for a future custom-webhook feature.
2. MCP personal-access-token issuance + `POST /api/v1/comments/{id}/mcp/generate-prompt` endpoint — the smallest real slice of the MCP feature (ships something functional before the fancier per-tool OAuth-style integrations).
3. Per-project/per-member Slack notification opt-outs.
4. The Claude-vs-Gemini provider decision.

**The "detailed prompt" you asked for** — paste this back to an agent session when you're ready to actually build this (adjust the numbered scope to whichever phase you want first):

> Implement Phase 1 of the Slack + AI/MCP integration plan in `docs/implementation/slack-ai-mcp-architecture.md`: add the `webhook_events`/`webhook_deliveries` collections and a delivery-retry worker (reuse the existing background-job mechanism in `backend/app/modules/notifications/digest.py` rather than introducing a new queue system — check that module's scheduling approach first). Wire Slack's existing `on_comment_created`/`on_status_changed` calls to go through this new delivery table instead of firing-and-forgetting, with exponential backoff (30s, 2m, 10m, 1h, then mark `exhausted`). Do not touch the MCP feature, the AI summarizer, or the provider-choice decision in this pass — those are separate follow-ups. Read `docs/implementation/production-readiness-master-plan-2026-09-13.md` Part I first for the full context on why this is scoped this way.

---

## Suggested execution order for "ship in a few days"

1. **Day 1 morning:** Part A (all 5 critical security bugs) — these are launch-blocking regardless of anything else. A1/A2 are config changes + a startup guard, small and fast. A3/A4/A5 need real code changes but are well-scoped.
2. **Day 1 afternoon–Day 2:** Part B (high-priority bugs) — B1 (rate limiter), B2/B3 (assignee validation + crash guard), B4/B5 (secret encryption + SSRF allowlist).
3. **Day 2:** Part E1 (the flashing red banner — quick, high-visibility win) + Part G1-G3 (dead links, dead components, one color fix — all small, mechanical).
4. **Day 2-3:** Part F1/F2 policy decisions (wire up Slack/Trello/ClickUp toggle in `IntegrationsTab.tsx` since the backend already supports it; decide whether to hide or keep-as-honest-placeholder the Jira/Asana/MCP shells) + Part G4/G5 (visual polish on the thin placeholder pages).
5. **Day 3+ (post-launch is fine):** Part C/D (medium/low bugs — real but not launch-blocking) and Part I (Slack/MCP feature build) whenever you're ready to use the prompt above.
