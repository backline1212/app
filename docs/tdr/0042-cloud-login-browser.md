# TDR-0042: A cloud login browser, for reviewers without the extension

Date: 2026-09-27
Status: Accepted, deploying (see docs/implementation/06-delivery.md for the current state)

## Context

TDR-0041 lets a member carry a session they already have into the canvas, but only if
they have the Backline extension installed and are willing to sign into the reviewed site
themselves first. Two cases that still don't work:

- A reviewer (agency client, teammate without the extension) who needs to review a page
  behind a login they don't want to, or can't, sign into on their own machine.
- A site whose session is bound to the signing-in device or IP: a session synced in from
  a member's own laptop (TDR-0041) gets replayed through the proxy's server IP on every
  later request and such a site rejects it on sight. A session established *from that same
  IP in the first place* doesn't have this problem.

## Decision

**A real, server-side Chromium a member drives interactively, streamed into a dashboard
modal, whose captured session hands off through TDR-0041's own ticket pipeline.**

- New Railway service, not the API and not the existing arq worker:
  `backend/app/cloud_login_app.py`, a second, minimal FastAPI app carrying only
  `GET /ws`. Deployed from its own `backend/Dockerfile.cloud_login` - not a stage inside
  `backend/Dockerfile`. That was the first attempt (`FROM worker`, reusing the same
  Playwright-install layer `worker` already pays for), matching how `worker` itself is
  meant to select a non-default stage; it doesn't work in this project, though - neither
  the Railway dashboard (checked directly) nor the public GraphQL API (searched
  thoroughly - no `target`/`buildTarget`/`dockerfileTarget` field on `ServiceInstance`,
  `ServiceInstanceUpdateInput`, or `ServiceSource`) exposes a way to pick a non-last
  stage, and `Dockerfile#stagename` path syntax isn't supported either (Railway just
  fails to find that literal filename). Whether `worker`'s own "Docker Build Target"
  setting (referenced in `backend/Dockerfile`'s comments) still works wasn't confirmed
  either way - not verified in this pass. A dedicated file removes the ambiguity for this
  service entirely, at the cost of a small duplicated base-image setup (no shared stage
  with `backend/Dockerfile`, so nothing about `app`'s or `worker`'s own build is at risk
  from this).
- `POST /api/v1/projects/{id}/cloud-login/sessions` (`modules/cloud_login`,
  `project:manage`-gated, on the main API - it never touches Playwright) mints a
  short-lived Redis ticket and returns the separate service's `ws_url` with the ticket
  embedded. Refuses outright, same as TDR-0041, when `PROXY_PREVIEW_DOMAIN` isn't set.
- The dashboard (`CloudLoginModal.tsx`, opened from Quick Tools) connects that websocket
  directly - never through the API. The service validates the ticket (one-time, like
  TDR-0041's), checks the `Origin` header against the dashboard's own allowlist, and
  claims one of `CLOUD_LOGIN_MAX_CONCURRENT_SESSIONS` (default 2) Redis-backed slots
  (`SET NX EX`, same pattern `ai/key_pool.py`'s Groq key claiming already uses) - a
  session with no free slot gets a clear "busy" message, not a silent hang.
- Once claimed: launches `chromium`, navigates to the project's `target_origin` behind
  the same SSRF guard `browser_render/service.py` already uses (`page.route` intercepting
  every document navigation, not just the first - this is an interactive session, so the
  member's own clicks can navigate anywhere), starts a CDP `Page.startScreencast` (JPEG,
  1280×800), and streams each frame to the client. Mouse/keyboard from the modal's canvas
  (+ a hidden capture `<input>` for typed text, the same technique other browser-in-canvas
  tools use to avoid a hand-built keycode table) drive `page.mouse`/`page.keyboard`
  directly.
- On "finish", a hard `CLOUD_LOGIN_SESSION_TTL_SECONDS` timeout (default 240s), or the
  socket closing: captures `context.cookies()` + `localStorage`, then calls
  **`session_sync.service.create_ticket` directly** (same process, same codebase - not a
  second HTTP hop) to mint a TDR-0041 ticket. The modal opens that `redeem_url` in a
  hidden iframe exactly the way the extension does, and the dashboard canvas (same
  preview origin) picks up the session on its next load.

## Cost

**Not a new fixed monthly cost by itself** - Railway bills actual vCPU/RAM-seconds
consumed, not a flat per-service fee, and no Chromium process runs until a member actually
opens the modal. What this does add:

- The new service's own idle footprint while deployed and listening for a websocket -
  small (an idle uvicorn process), roughly $1-2/month depending on plan.
- Per session actually used: one Chromium instance (~150-300MB RAM, modest CPU) for up to
  `CLOUD_LOGIN_SESSION_TTL_SECONDS`. At Railway's per-second compute billing this is
  fractions of a cent per sign-in - materially the same math as the general-purpose cloud
  browser cost estimate already given for this feature (a 3-4 minute session, ≈$0.005-
  0.01).
- This project's only Railway environment (`believable-caring` / `production`) had
  **$4.41 of credit left over the remaining 25 days** when this was built, with no
  staging environment to try a new service against first - flagged to the user before
  provisioning anything. The user chose to add balance and deploy; see
  docs/implementation/06-delivery.md for the deploy timeline and what's still pending.

## Consequences

- Egress IP matches the proxy's own, so a device/IP-bound session survives being replayed
  through later proxied requests - the one thing TDR-0041's extension-based sync can't do.
- Still doesn't help a site that specifically detects automated/server-side Chromium
  (Google's own sign-in does this) - same limitation TDR-0035/0040 already documented for
  the plain proxy fetch. For Google/Microsoft SSO specifically, TDR-0041 (session synced
  from the member's *own*, real, human-driven browser) remains the reliable path; this
  feature exists for reviewers who don't have the extension, not as a Google-SSO
  workaround.
- Concurrency is capped low by design (2 by default) - a burst of simultaneous sessions
  queues behind a clear "busy" message rather than exhausting the service's memory, the
  same trade-off `app/workers/main.py`'s `max_jobs=3` already makes for render jobs.
- Typed text goes through a hidden `<input>`'s native `input` events plus `insertText`,
  not a full keycode-accurate emulation - good enough for filling in a username/password/
  OTP, not a substitute for a real keyboard on every possible key combination (dead keys,
  IME composition aren't handled).
- Not yet verified in a live browser session (would need the service actually deployed) -
  see the delivery log entry for exactly what was verified without it: module import
  without the browser binaries installed, the Redis slot semaphore under contention, the
  one-time ticket round trip, and the origin allowlist - all via a scratch harness, no
  real Chromium involved.
