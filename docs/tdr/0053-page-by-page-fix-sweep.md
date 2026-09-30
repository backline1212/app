# TDR-0053: Page-by-page fix sweep — auth, plan limits, AI usage, links and access

Date: 2026-09-30
Status: Implemented. Verified by ruff/mypy/lint/typecheck/build and by the backend suite
on a real MongoDB 7.0 replica set (270 passed; the 11 failures are pre-existing and
listed under Verification).

## Context

The user asked for the rest of the code to be fixed, page by page, across UI, backend and
database. The billing branch's own open item (enforcing the integration, cloud-login and
MCP rows of the pricing table) is a product decision left open in
`docs/BILLING_BRANCH_OVERVIEW.md`, so it was not decided here.

For the first time the backend suite ran locally against a real database rather than
mongomock. The stack was an official `mongod` 7.0 single-node replica set, fakeredis's
TCP server and a moto S3 server. It ran from a scratch directory with its own `.env`, so
the checked-in `.env` (remote services, live Resend/Groq/Sentry keys) was never loaded.

## Decisions

**Sign-in emails are case-insensitive.** Pydantic's `EmailStr` lowercases only the
domain. An invite to `Bob@acme.com` followed by Bob's Google or code sign-in
(`bob@acme.com`) therefore created a second, empty account, and password sign-in was
case-sensitive.
- Auth and invite requests use `NormalizedEmail` (`core/email_address.py`), which
  lowercases the address, and new users are stored lowercase.
- `UserRepository.find_by_email` tries the exact lowercase match first. When that
  misses, an anchored case-insensitive regex finds accounts stored before this change.
- `scripts/migrate_lowercase_user_emails.py` is dry-run by default. It lowercases stored
  addresses and reports accounts that differ only by case, without merging them.

**"Set a password" requires a fresh code sign-in.** `POST /auth/password` replaced a
password without the old one for any live session. That made the current-password check
on "Change password" pointless, since a borrowed laptop or a leaked access token could
take the account over.
- Each login family now records `auth_method` and `authenticated_at`, and they are
  copied on refresh.
- `set_password` accepts only a family started by an emailed code within the last 15
  minutes. This is the only path the UI offers: the step right after a code sign-in.

**The seeded sample project doesn't use up the plan.** Every new workspace starts with
"Example Project", which counted toward Free's two active projects, leaving one.
- The seed is flagged `is_sample`. The count skips it while it still points at the
  sample site; pointed at a real site, it counts.
- Restoring an archived sample skips the limit check.
- `scripts/migrate_mark_sample_projects.py` (dry-run default) flags existing seeds: named
  "Example Project", still on the sample origin, and created within a minute of their
  workspace.

**AI Usage shows real data.** The page still said nothing was recorded, although billing
already meters one credit per Groq call.
- Credits now record the member who used them.
- `GET /workspaces/{id}/billing/ai-usage` (any member) returns:
  - the month's used/limit and the reset time;
  - counts by feature and by member;
  - every day of the month;
  - the last six months.
- It reads the same `ai_usage` ledger the plan limit counts, via the existing
  `(workspace_id, created_at)` index. The contract change is additive.
- The page shows a meter and single-hue column charts, each with a table view. Its
  `--bl-chart-1` token was checked with the palette validator on both theme surfaces.
- When credits run out, AI actions now show the server's plan message instead of a
  generic failure.

**A changed role no longer strands a session.** A stale workspace role now returns
403 `WORKSPACE_ACCESS_CHANGED`, a subclass of `PERMISSION_DENIED`.
- The web client reopens the workspace once and retries.
- If reopening is refused (the member was removed), it reloads the workspace list,
  which routes to the picker.
- Before, every request failed until a reload.

**Integration OAuth connects again.** The ClickUp, Jira and Asana callback page fired
its connect request before the session was restored, with a refreshed token that has no
workspace. So it always got 403, and its 401 retry raced the start-up refresh, which
risks revoking the session.
- Every `/auth/refresh` now goes through one shared in-flight request.
- The callback waits for the session, switches into the workspace that started the
  flow, and then connects.

**Guest passcodes resist distributed guessing.** Passcode attempts were limited per IP
only, and a passcode can be 4 digits. Each link now allows 25 wrong passcodes per 15
minutes from all addresses combined, then answers 429. Correct passcodes are never
counted.

**Smaller fixes:**
- **Ticket links.** Global search, asset review and the dashboard linked `?ticket=`
  after the Tickets page had moved to `?comment=`, so the ticket never opened. The links
  now use `comment`, and `ticket` is still accepted for saved links. A page offset past
  the end moves back to the last page.
- **Blank names.** Whitespace-only workspace names, comment bodies, extension-token
  names and MCP labels are rejected (`core/text.py`'s `Trimmed`). Fields that already
  trimmed in their services keep their own messages. The OpenAPI schema is unchanged.
- **Sign-in page.** `/login` with a live session goes to the app.
- **Filter boxes.** Typing in the Projects and Clients filters no longer adds a history
  entry per keystroke.
- **Clients.** Export moved from each row's menu (where it exported every client) to
  the header. "Show archived" is a URL parameter.
- **Activity.** Older rows show their date, and a filter that matches nothing says so.
- **Settings.** Members see the name read-only instead of a Save that always failed. The
  fake "click the avatar to upload" instruction is gone. The rename is a labelled form,
  and its event records the actor.
- **Members, extension tokens and MCP tokens.** Failed role changes, removals and
  revocations show their error. Revoking an extension token asks first.
  `ConfirmDialog` renders its message in a `div`, so the paragraphs callers pass are
  valid HTML.
- **Smaller UI fixes.**
  - The workspace picker shows list errors and refuses blank names.
  - Ticket screenshots that uploaded before a failure stay attached.
  - The hard-delete name check trims both sides.
- **CSV exports.** Their formula guards also cover a leading tab or carriage return.

## Not done

- Enforcing the integration, cloud-login and MCP pricing rows (open product decision).
- Updating the 5 stale tests (4 proxy, 1 Jira); per this repo's Claude Code
  instruction, test suites were not written or rewritten.
- A browser pass of the new AI Usage page and of the OAuth round trip with real
  provider apps.

## Verification

- Backend: `ruff check`, `ruff format --check` (246 files), strict `mypy app scripts`
  (205 files) and the workspace-scoping check pass.
- Backend suite on MongoDB 7.0: 270 passed, 11 failed. Every failure predates this work:
  - 6 publish over Redis pub/sub, which the fakeredis TCP server accepts but never
    delivers (checked directly).
  - 4 proxy tests mock `httpx.AsyncClient.get` and skip DNS, while the proxy now uses
    `client.request` behind its SSRF guard.
  - 1 Jira test calls `_get_fresh_access_token(on_rotate=...)`, which no longer exists.
  - The one failure this work fixed was `test_resolve_project_creates_once...`, which
    had hit the sample-project limit.
- Scratch checks (not checked in):
  - mixed-case signup and login;
  - an invite with capitals then a lowercase code sign-in reaching one account;
  - a legacy mixed-case user found;
  - `/auth/password` refused for a password session and allowed after a code, including
    after a refresh;
  - Free allowing two real projects;
  - AI usage totals, buckets, zero-filled days, the six-month trend and cross-workspace
    403;
  - the passcode lockout after 25 wrong tries across 25 IPs, per link only.
  - Both migrations were run dry-run and then `--apply` against local data.
- OpenAPI re-exported; the `packages/types` diff is additive.
- `pnpm turbo run lint typecheck build --force`: 12/12 with zero lint warnings.
