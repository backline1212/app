Warning: truncated output (original token count: 77964)
Total output lines: 4651

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
the three data-use statements and
authorized their checkboxes; saved all three.

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
`076a2744-b278-4c77-81bb-406082fbdab2`, and `Cache-Control: n…72964 tokens truncated…)**:
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
