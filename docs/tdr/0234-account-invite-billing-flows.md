# TDR-0234: Account, invitation and billing flow fixes

Date: 2026-11-07. Source: audit of sign-up, onboarding, workspaces, invites, account and
billing (17 findings, each checked in code).

## Account
- One form holds every Account tab, so Enter in Change password, the email-change code
  or the delete-account code submitted "Save changes" and closed the dialog with nothing
  changed. Enter now runs that box's own button; in the delete section it does nothing.
- Saving while an email change is in progress keeps the dialog open (closing lost the
  code box, and reopening reset the field).
- Accounts that sign in with Google are warned that a new email stops Google sign-in
  matching unless it is that Google account (`UserOut.uses_google`).
- The sessions note says up to 5 devices stay signed in (it said one).

## Sign-in and invitations
- A password reset by email code ends other sessions and revokes extension/MCP tokens
  and canvas sessions, as Change password does (a first password doesn't).
- The wrong-code lockout suggests a password only for sign-in codes.
- An invited teammate signing in with Google gets Google's name (and photo) while the
  account still has the email-derived placeholder.
- Invitation links carry the workspace; after signing in, the invitee lands there. If a
  different account is already signed in, the page says so and offers to sign out
  instead of entering the wrong account's last workspace.
- A failed invitation email is reported ("…was added, but the invitation email couldn't
  be sent") via `MemberOut.invite_email_sent`; admins can "Resend invite" from the
  person's profile (`POST …/members/{id}/resend-invite`, 3 per 10 minutes).
- "Use a different email" during sign-up goes back to sign-up with the fields kept.
- The code sign-in's password step says "Choose a new password / Replace password /
  Keep my current password" when the account already has one.
- Unknown addresses show "Page not found" without asking a signed-out visitor to sign in.
- "Open {workspace}" on the Join page shows why it failed instead of doing nothing.

## Billing
- The Team card no longer sells integrations every plan has (Free lists them).
- At the Enterprise limit the message says to contact support (no checkout for the same
  plan); `upgrade_plan_id` is null.
- A failed invoice load shows an error with Try again (not "No invoices yet").
- Returning from Stripe before the payment clears re-checks every 15 s for 3 minutes.
