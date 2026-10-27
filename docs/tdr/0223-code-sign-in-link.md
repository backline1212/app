# TDR-0223: "Email me a sign-in code" on the sign-in page

Date: 2026-10-27. Source: walkthrough signing in as an invited teammate.

## Finding

Teammates who joined from an invite or with Google often have no password. The sign-in
page told them, in a footnote, to use "Forgot password?" to get a sign-in code: the one
way in for them looked like an account-recovery path.

## Decision

The footnote is replaced by "No password yet? Email me a sign-in code", which opens the
code form titled "Sign in with an email code" (the same screen invite links open with
`?use=code`). "Forgot password?" still opens it as "Trouble signing in?".
