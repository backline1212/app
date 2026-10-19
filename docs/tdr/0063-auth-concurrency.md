# TDR-0063: Serialize session refresh and consume email codes atomically

Date: 2026-10-19
Status: Implemented in CR-01; static checks recorded in the delivery ledger.
Live multi-tab and database concurrency acceptance remains outstanding.

## Context and decision

Audit F12 identified a gap between single-tab refresh de-duplication and rotating
refresh cookies shared across tabs. F13 identified check-then-write OTP consumption
and attempt accounting. Connected review adds more tabs/windows, so these existing
account flows must not create avoidable sign-outs or duplicate sessions.

Member refresh keeps its per-tab promise and adds an origin-scoped Web Lock around
the complete refresh/workspace restoration operation. Each queued tab sends the
current browser cookie after the previous operation finishes. Tokens remain in
their own tab's memory; no access token is broadcast or stored in localStorage.
The queued operation rechecks the local token revision before its HTTP request and
after responses, so logout/context changes cannot be overwritten by a late refresh.
Backend replay/theft detection remains intact. This does not serialize other
independent apps/origins using the same API cookie, or every login/logout operation.
Each lock holder has a 20-second deadline for refresh plus workspace restoration;
a stalled network operation aborts and releases the lock with a retryable error.

Browsers without Web Locks retain the existing single-tab guard. Do not claim
cross-tab refresh reliability for them without a supported alternative and live
evidence. Do not implement a localStorage mutex with indefinite stale locks or weaken
backend refresh-token reuse detection to simulate compatibility.

Startup AuthProvider restoration now accepts a result only while its installed
token is still current. A failed startup refresh cannot replace a later successful
login with an unauthenticated state. The API client installs the restored token once;
the provider supplies the matching user/status without reinstalling stale credentials.

OTP sign-in and email-change confirmation share one service helper. The repository
selects the newest retained code for email/purpose, reserves each evaluation with an
atomic attempt-limit/expiry/consumption predicate, and consumes a matching code with
a conditional update. Only the caller that modifies the unconsumed record may
continue to issue a session or change email. Correct-code attempts count against the
same total evaluation budget. Consumed/exhausted newest records cannot cause a
fallback to an older retained code. Legacy records without purpose still match the
sign-in purpose; the email-change purpose remains user-bound.

No account record, index or external API schema migration is required by this
increment. OTP failures after successful consumption require requesting a new code;
this does not introduce distributed transactions between OTP consumption and later
account/session writes. Email ownership and safe linking for password signup/legacy
accounts (F01) remain a separate required change.

## Verification boundary

Use the repository's Codex lint/typecheck/build checks, not a new test suite.
Manual acceptance still needs: simultaneous refresh from two supported tabs;
logout/login during startup restore; expiry and network failure; simultaneous valid
OTP submissions; concurrent wrong guesses near the attempt limit; resend/newest-code
behavior; and the separate email-change purpose. Static checks alone do not close
F12/F13 or the CR-A02/05/06 release gates.
