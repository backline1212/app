# TDR-0037: Set-password from the OTP flow, and six login-screen UI bugs

Date: 2026-09-27
Status: Accepted

## Context

A client bug report against the sign-in/sign-up/forgot-password screens (six items,
each with a screenshot) asked for:

1. After "Forgot password?" -> code, be able to update the password. Frontend+Backend.
2. The focus ring on a password field shows two outlines with a gap between them; the
   bigger one should replace the thin one, no gap.
3. A Caps Lock indicator on password fields.
4. The signup password field's length requirement surfaces as a native browser
   validation bubble ("Please lengthen this text to 12 characters or more"), overlapping
   other controls instead of the app's own styled error.
5. A member who already has an account (created via Google or an OTP code, no password
   yet) should be able to create a password for it the first time - reported against the
   409 "That email already has a Backline account" signup collision, with the reporter's
   own suggested path being "Try forgetting the password."
6. No space between an error message and the submit button below it, and the error
   icon's alignment looks off.

TDR-0024 and TDR-0025 deliberately left "changing or setting a password from account
settings" and "a password reset link flow" unbuilt - a member who forgot their password
could get back in by code but couldn't yet replace it. Items 1 and 5 both point at that
same gap: whether the account has no password yet or an existing one, the fix is the
same capability, reached the same way.

This branch was written against `34879ac`, one commit behind where `main` had already
landed TDR-0034 the day before: `POST /auth/me/password` (account-settings "Change
password", requires the *current* password, refuses accounts with none) plus
`UserOut.has_password`. Merging `main` in did not change the plan here - TDR-0034
explicitly declined the case this bug report is about ("Accounts without a password
... are told there is none to change"), so the two endpoints are complementary, not
competing. See Decision below for how they coexist.

## Decision

**One endpoint, reached from the code screen, not a reset-link or account-settings
flow.** `POST /auth/password` (`PasswordSetRequest{password}`, 204) is authenticated by
the caller's session and sets/replaces `password_hash` unconditionally - it does not ask
for the current password, because the OTP the caller just verified already proved
control of the inbox, the same evidentiary bar a mailed reset link would clear. This
covers item 5 for free: a Google/OTP member has no password to know, so any flow that
required the old one could never work for them anyway.

`otp/verify` already leaves the caller authenticated (13-Authentication.md §13.2); the
frontend's code-verification step now shows a "Set a password" panel instead of
navigating straight to `/`, with a "Skip for now" escape so a member who only wanted a
one-time code back in is never forced through it. The signup screen's 409 collision
message is unchanged - it is correct, documented behavior (TDR-0025), and item 5's real
complaint was the missing way to attach a password after proving ownership, not the
collision check itself.

**Distinct from `POST /auth/me/password` (TDR-0034), on purpose.** That endpoint is a
voluntary change from account settings and rightly demands the current password; it
already refuses accounts with none, by design. `POST /auth/password` exists only to
clear that specific case (and forgotten-password recovery), gated by proof-of-inbox
(the OTP) instead of proof-of-current-password. After it runs, `UserOut.has_password`
is true and TDR-0034's "Change password" section works normally from then on - the
frontend also patches the in-memory user (`updateUser`) right after a successful save,
so the account modal doesn't show stale "no password to change" copy before the next
token refresh.

**Items 2, 4 and 6 are CSS/markup-only, scoped to `apps/web/src/styles/backline.css`
and `LoginPage.tsx`:**
- Item 2: `.lg-f input:focus{border-color:...}` plus the global
  `input:focus-visible{outline:2px solid var(--bl-focus);outline-offset:2px}` were both
  firing on the same field - a darker 1px border plus a 2px outline offset 2px outside
  it. Added `.lg-f input:focus-visible{border-color:transparent;outline-offset:0}`
  (higher specificity than the global rule) so exactly one ring shows, flush against the
  field.
- Item 4: dropped the `minLength` attribute from the signup and set-password inputs
  (kept `required`, which the report didn't flag) and added an equivalent client-side
  check in `handleSignup`/`handleSetPassword` that shows the same
  `Use at least 12 characters.` message the backend already returns, through the
  existing `.lg-err` component instead of the native constraint-validation bubble.
- Item 6: `.lg-err` gained `margin-bottom` (previously only `margin-top`, so it sat
  flush against whatever followed it) and switched `align-items` from `flex-start` +
  a manual icon `margin-top` hack to `center`, which is correct for the single-line
  messages this component actually renders.

**Item 3 scoped to password fields, not literally "every input."** The existing
`.lg-caps`/`.capson` CSS was already in `backline.css` (carried over from the design)
but nothing rendered it. Wired `getModifierState("CapsLock")` on `keydown`/`keyup` for
each password input (sign-in, sign-up, and the new set-password field) into one `capsOn`
flag, reset on every step change. Caps Lock only matters where typed characters are
hidden; an indicator on the email/name/code fields would show real characters that
already reveal the case, so those were left alone.

## Consequences

- `packages/types/openapi.json` and `src/openapi.ts` regenerated for the new endpoint;
  no other route changed shape.
- The set-password screen is optional by design - skipping it leaves the account exactly
  as before (code-only sign-in, or its existing password unchanged).
- Not built: a mailed password-reset link. Changing a password from account settings
  *is* now built, as of TDR-0034 (merged from `main` after this branch started) - it
  requires the current password and is unrelated to this endpoint, which requires none
  because it is reached a different, already-proven way (see Decision above).
- `capsOn` is a single flag shared across panels; because the sign-in, sign-up and
  set-password panels are mutually exclusive (one `step` at a time, same as
  TDR-0024/0025), this doesn't cross-contaminate between fields.
