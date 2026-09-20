# TDR-0025: Password signup and sign-in alongside OTP and Google

Date: 2026-09-20
Status: Accepted

## Context

Backline was passwordless by design (TDR-0024, `13-Authentication.md` §13.2): email OTP
and Google, no password field anywhere. `design/index.html` had always shown a password
product, and the product owner asked for signup with email and a password. Signup with
a password that can't then be used to sign in would be write-only, so this covers both.

## Decision

**Hashing: scrypt, via the `cryptography` dependency already in `pyproject.toml`.** No
new dependency, so no lock regeneration - which the existing comments in `pyproject.toml`
record as having silently dropped packages before. `n=2**15, r=8, p=1` is ~32 MiB and
~175 ms per derivation. The digest is self-describing (`scrypt$n$r$p$salt$digest`), so
the parameters can be raised later without invalidating stored passwords. `hash_secret()`
is deliberately not reused: it is a single-pass HMAC, right for tokens we generate and
far too fast for a human-chosen password. Every derivation runs through
`anyio.to_thread.run_sync`, because 175 ms on the event loop would stall every other
request in the worker.

**Two endpoints.** `POST /auth/signup` (201) creates the account and signs it straight
in; `POST /auth/login` verifies a password. Both set the same refresh cookie and return
the same `TokenPairOut` as the Google and OTP routes, so everything downstream - token
rotation, sessions, workspace switching - is unchanged.

**Signing up with an address that already exists is refused (409), never merged.** A
member who joined by Google or OTP has a real account; letting an unauthenticated caller
attach a password to it because they know the address would hand the account over. They
sign in the way they already do.

**One failure message for every login failure** - no account, account without a password,
wrong password. An absent password is verified against a dummy digest so the response
time doesn't separate those cases either. Rate limits are per-IP *and* per-email (10/min
each): one bounds a distributed run at a single account, the other one host working
through many accounts. Signup is limited per-IP at 5/min.

**Password policy is deliberately small**: at least 12 characters (enforced in the
request schema), at least 4 distinct characters, and it may not contain the email's local
part. The four-point strength meter on the signup panel is the design's own scoring and
is advisory - it gates nothing.

**Existing members keep working.** `password_hash` is nullable and only ever set by
signup; Google and OTP users have `None`, and the sign-in panel says so and points at
"Forgot password?", which emails the six-digit code (TDR-0024's recovery panel). Nobody
is locked out and no migration is needed - the unique `email` index already exists.

## Consequences

- The four login panels now match `design/index.html`: `#lg-in` (email + password, SHOW
  toggle, "Forgot password?"), `#lg-up` (name, email, password, strength meter, terms),
  `#lg-reset` and `#lg-sent`.
- **Not built, on purpose**: a password *reset* link flow (the recovery panel signs you
  in with a code instead), changing or setting a password from account settings, and the
  design's "Keep me signed in" checkbox - the refresh cookie's lifetime is fixed, so that
  control would have been inert. A member who forgets their password can still get in by
  code but cannot yet replace the password.
- Email addresses are still matched exactly, not case-folded - pre-existing behavior for
  OTP and Google, now also true of password login. `Foo@x.com` and `foo@x.com` remain
  separate accounts; normalizing is a cross-cutting change to existing records, not
  something this slice should do silently.
- Regenerating `packages/types` for the two new routes also picked up drift that was
  already on `main`: the removed `modules/auth/account` router's paths and schemas were
  still in the checked-in `openapi.json`, and dropping them renamed
  `app__modules__auth__schemas__SessionOut` back to `SessionOut` (its Python-module
  qualifier only existed because two `SessionOut` schemas collided). The one frontend
  reference was updated.
