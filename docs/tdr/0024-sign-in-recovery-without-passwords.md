# TDR-0024: Sign-in recovery, not password reset

Date: 2026-09-20
Status: Accepted

## Context

`design/index.html` is a password product: its sign-in panel carries a password field,
a SHOW toggle, "Keep me signed in" and "Forgot password?", which opens a `#lg-reset`
panel ("We send a link that sets a new password") and then a `#lg-sent` panel ("Check
your email"). The shipped product is passwordless - `docs/spec/13-Authentication.md`
§13.2 specifies email OTP plus Google, and the backend has `otp/request`, `otp/verify`,
`google/callback` and `refresh` with no password field, no hash and no reset token
anywhere in the database.

The sign-in screen offered no recovery affordance at all, so a member who couldn't get
in had nothing to click.

## Decision

Keep the product passwordless and give the missing affordance an honest meaning. The
design's `lg-forgot` control is on the sign-in screen, worded "Trouble signing in?", and
it opens the design's two panels rebuilt as real views:

- `#lg-reset` - back-arrow, heading, lede, email field, primary action, swap row - which
  sends the same six-digit OTP the sign-in form sends, since that *is* the only way back
  into an account here.
- `#lg-sent` - the mail badge, "Check your email", the address in `lg-mailbox` - now
  carrying the code field, the live expiry countdown, Resend and "Use a different email"
  that the OTP flow actually needs.

No "Forgot password?" wording, no reset link, no promise of an email that sets a
password. The three panels are mutually exclusive, each owning its heading, the way the
design switches `#lg-in` / `#lg-reset` / `#lg-sent`.

## Consequences

- The copy deliberately differs from the design ("Send the sign-in code", not "Send the
  reset link"), and `#lg-sent` gains an input the design didn't have. Everything else -
  structure, classes, spacing, order - matches, and all of that CSS was already in
  `backline.css`.
- If passwords are ever added, this view is where the reset flow would attach; the
  wording and the spec would change together, through a new TDR.
- The design's password field, strength meter, "Keep me signed in" and separate sign-up
  panel remain unbuilt on purpose. First OTP verify still creates the account, which the
  sign-in screen states.
