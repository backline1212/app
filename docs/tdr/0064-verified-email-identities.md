# TDR-0064: Prove inbox ownership before activating member credentials

Date: 2026-10-19
Status: Implemented in source as a CR-01 increment; static checks passed.
Not deployed. Audit F01 stays open for manual identity/recovery acceptance.

## Decision and normal flow

`POST /auth/signup` validates the name/email/password draft and emails a six-digit
signup-purpose code, returning `SignupChallengeOut` with HTTP 202 and its lifetime.
It creates no account, stores no password and issues no tokens. The signup page
keeps the draft in tab memory, shows the code screen, supports resend and cancellation,
and returns to sign-in if the draft is lost on reload. No password is put in storage.

`POST /auth/signup/verify` receives the draft and code. Reuse the atomic OTP
attempt/consumption helper with the distinct `signup` purpose; a sign-in code or
email-change code cannot activate signup. Only after proof, hash the password,
create/reuse the invited or unverified account, and conditionally activate its
`email_verified_at`, chosen name and password in one account update. A concurrent
verification cannot overwrite an account already activated elsewhere. Successful
activation issues the normal member session. Verified existing accounts use sign-in
and password recovery; unauthenticated signup cannot replace their password.

Google's verified email and the existing sign-in email code also record explicit
inbox proof. On the first proof for an old/unverified record, clear its old password:
historical provider arrays alone do not prove that password was set by the owner.
Google users continue with Google/code; code users can set a fresh password in the
existing recent-code-only step. Preserve user IDs, workspace membership, comments,
projects and audit history. Invited member rows remain, but yield no usable member
access before proof. No account merging or bulk deletion is performed.

## Existing accounts and credentials

**Intentional rollout behavior:** accounts without an explicit verification marker
must sign in once with an inbox code or verified Google identity. Their old password
cannot sign them in until that recovery. Existing member sessions without a login
family or explicit inbox proof fail closed. After proof, credentials originating
before it remain invalid: compare the refresh family's original `authenticated_at`,
extension/MCP token `created_at`, or the member-bound canvas session's original
`member_authenticated_at` with the proof timestamp. Rotating a refresh cookie cannot
rejuvenate an old login.
Ordinary share-link guests remain independent of member email verification.

The guard runs on HTTP member validation, refresh, realtime member checks, extension
verification, MCP token verification and member-bound canvas access. Canvas session
reuse excludes pre-proof records and creates a current session after recovery.
Existing external tools need newly issued credentials. This is identity recovery,
not a completed general token-expiry/scoping policy (F14 remains open).

Confirming an email change records proof for the new address and signs out existing
member sessions. The endpoint removes its refresh cookie; the frontend clears the
access token/cache and tells the user to sign in with the new email. Older tool and
canvas credentials must reconnect under the new proof cutoff.

## Rollout, recovery and verification

No migration marks historical accounts verified based on provider strings or a
password alone. A read-only dry-run inventory is available as
`python -m scripts.audit_email_verification_rollout` from `backend/`. It prints
aggregate account/token counts, never addresses/secrets, and has no apply mode.
It has not been run against a shared or production database in this task.

Before deployment: confirm real email delivery and Google redirect configuration,
document the one-time inbox recovery for existing members, and verify one operator
can recover. Roll out backend and rebuilt frontend together because signup changes
from immediate token issuance to a challenge. Do not deploy an old frontend against
the new signup contract. Do not roll back to unverified signup/password linking;
stop new signup instead if verification is unavailable. Accounts/evidence remain
stored; a consumed code or a delivery/save failure can require a fresh code.

Manual acceptance still needs new signup, wrong/expired/replayed/resend code,
purpose mismatch, invited signup, concurrent Google/signup, pre-registered email
recovery, old password retirement, password reset, member/tool/canvas cutoff,
email-change re-login and ordinary guest regression. Pydantic owns both new
contracts; regenerate OpenAPI/types and run the prescribed lint/typecheck/build.
No new test suite under the Codex-specific AGENTS.md instruction.
