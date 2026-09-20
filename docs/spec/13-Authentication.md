# 13 - Authentication & Authorization

## 13.1 Agency Member Auth: Google OAuth

Standard Authorization Code flow. Backend exchanges the code server-side (client secret never reaches the frontend), verifies the ID token, upserts a `users` document keyed on verified email, issues an access JWT (15 min TTL) + refresh token (30 day TTL, stored hashed in a `refresh_tokens` collection, rotated on every use).

## 13.2 Agency Member Auth: Email OTP

`POST /auth/otp/request` generates a 6-digit code, stores a hash + expiry (10 min) keyed to email, sends via Resend. `POST /auth/otp/verify` checks the hash, rate-limited to 5 attempts per code (Rule 6). On success, same JWT issuance as Google flow.

## 13.2a Agency Member Auth: Email + Password

`POST /auth/signup` creates an account from name/email/password and signs it in; `POST
/auth/login` verifies an existing password. Both issue the same token pair as §13.1/§13.2.
Passwords are stored as scrypt (`n=2**15, r=8, p=1`, 32 MiB) in a self-describing
`scrypt$n$r$p$salt$digest` string on `users.password_hash`, derived off the event loop.
The field is null for members created by Google or OTP, who continue to sign in that way;
"Forgot password?" sends an OTP rather than a reset link. Signup refuses an address that
already exists (409) instead of attaching a password to it. Login answers every failure
identically and is rate-limited per IP and per email (Rule 6). Minimum 12 characters,
at least 4 distinct characters, and the email's local part may not appear in it.

## 13.3 JWT Structure

```json
{
  "sub": "user_id",
  "workspace_id": "ws_id",     // set after workspace selection, not at raw login
  "role": "owner" | "admin" | "member",
  "iat": ..., "exp": ...
}
```
A member with multiple workspace memberships gets a **separate token per active workspace context** (re-issued on workspace switch via `POST /auth/switch-workspace`), not a single token with an embedded list - this keeps every downstream permission check a single-field comparison (`workspace_id` in the token vs. `workspace_id` on the resource) instead of a membership lookup on every request.

## 13.3a Reviewed-Site Sessions (Proxy Mode)

Not Backline auth: the review proxy can now carry a login form to the site under review
and keep the session it returns (TDR-0026), so members-area pages can be reviewed. The
site's cookies are re-emitted to the reviewer as `blp_{share_token}_{name}` scoped to
`Path=/proxy/{share_token}`, and only cookies with that prefix are forwarded upstream -
so no Backline cookie can reach a third-party site and no share link sees another's
session. Nothing is stored server-side; the session lives in the reviewer's browser.

## 13.4 Guest Auth: Share Links

No password, no account. Flow:
1. Client opens `/review/{share_token}`.
2. Backend validates: not expired, not revoked, passcode correct if set (Rule 6: passcode checked server-side, rate-limited).
3. First visit: SDK prompts for display name only -> `POST /guest-sessions` -> returns an opaque guest session token (JWT-like, but `sub` is a `guest_session_id`, no `role`, hardcoded `scope: "guest"`).
4. Every subsequent request from that browser tab carries `X-Guest-Session: <token>`.

Guest tokens are scoped to exactly one `share_link_id` - a guest token from Project A's link is rejected by any endpoint resolving Project B's resources, checked at the same middleware layer as member workspace-scoping (`06-Backend-Architecture.md` §6.4).

## 13.5 Permission Matrix

| Action | Owner | Admin | Member | Guest |
|---|---|---|---|---|
| View workspace settings | Yes | Yes | Yes | No |
| Manage billing (v-next) | Yes | No | No | No |
| Invite/remove members | Yes | Yes | No | No |
| Create/manage projects | Yes | Yes | Yes | No |
| Create/revoke share links | Yes | Yes | Yes | No |
| Connect/disconnect integrations | Yes | Yes | No | No |
| View client-visible comments | Yes | Yes | Yes | Yes (own project only) |
| View team-only comments | Yes | Yes | Yes | No (never, server-enforced) |
| Toggle a comment's layer | Yes | Yes | Yes | No |
| Change comment status/assignee | Yes | Yes | Yes | No |
| Post a comment | Yes | Yes | Yes | Yes (`layer=client` only) |
| Reply to a comment | Yes | Yes | Yes | Yes (on client-visible threads only) |
| Manually reanchor a comment | Yes | Yes | Yes | No |

Enforced via a single `require_permission(action)` FastAPI dependency (`06-Backend-Architecture.md` §6.3) referencing this exact table as a Python dict - the table above and the code are the same source, generated from one `permissions.py` constant, never hand-duplicated into router-level `if` checks scattered across files (Rule 3, Single Source of Truth).

## 13.6 Session Management

- Access JWT: 15-minute TTL, held in memory (not `localStorage`) on the frontend to reduce XSS exfiltration surface; refreshed silently via the refresh token (httpOnly, secure, `SameSite=Strict` cookie).
- Refresh tokens are rotated on every use (old one invalidated) - detects token theft (reuse of an already-rotated token immediately revokes the whole session family).
- Guest session tokens: no refresh mechanism, simply re-issued if expired via the same `/guest-sessions` flow (low stakes - no PII beyond an optional display name/email).
