# TDR-0034: One active session per member; self-service photo, email and password

Date: 2026-09-26
Status: Accepted

## Context

Every sign-in created a new refresh-token family and nothing retired the old ones, so
the account modal listed 5-10 "sessions" for someone using a single device. The
product decision is that a member works from one active session at a time. The
design's Account modal also has photo upload, email change and password change, and
none of them had an API.

## Decision

- **One session.** `_issue_tokens` revokes every other refresh family for the user
  after minting a new one (`RefreshTokenRepository.revoke_other_families`). Access
  tokens carry their family as `sid`, and `validate_member_session` already rejects a
  revoked family. So the other device is signed out on its next request, not after
  the 15-minute access TTL. Refresh rotation stays inside one family and is unaffected.
- **Password change** (`POST /auth/me/password`) needs the current password, applies
  the signup password policy, and revokes every other family. Accounts without a
  password (Google / email code) are told there is none to change. Rate-limited per user.
- **Email change** is two steps: `POST /auth/me/email` (current password required when
  the account has one) sends a code to the *new* address, and `POST /auth/me/email/confirm`
  applies it. Codes are stored in `otp_codes` with `purpose: "email_change:<user_id>"`.
  Sign-in lookups match only `purpose: null`, which includes legacy rows, so a change
  code can never sign anyone in.
- **Photo** is a ≤200 KB `data:image/(jpeg|png|webp);base64` URL. The browser crops and
  downscales it to 256px first, and it is saved through `PATCH /auth/me` as `avatar_url`
  (null removes it). Every surface already renders `avatar_url`, so no signed-URL
  plumbing is needed.
- `UserOut.has_password` tells the UI whether to offer password change and whether an
  email change needs the password.
- The language picker is removed and the app is pinned to English. The Hindi strings
  stay on disk, unused.

## Consequences

Additive fields and endpoints only; legacy users and OTP rows stay readable. Signing in
on a second browser now signs out the first. The design's "How you appear to clients"
field and AI-credit meter are not built: neither has a backend, and the AI numbers
would be fabricated.
