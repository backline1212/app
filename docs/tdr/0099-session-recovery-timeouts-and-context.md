# TDR-0099: Bound session recovery and retain retry ownership

Date: 2026-10-21. Scope: F12, FD-02/09/18, member session recovery.

## Problem and decision

A caller's AbortSignal previously stopped fetch but not the wait for a shared
refresh or workspace recovery. The refresh Web Lock queue had no deadline, even
though its acquired HTTP operation did. Workspace recovery had no network deadline
or token-revision check, so a late response could replace a newer login/workspace.
The generic 401 retry also retried failed password/code/signup requests.

Bound the Web Lock queue to 20 seconds and retain the independent 20-second bound
after acquisition. A timeout in the queue reports that another tab is still
refreshing. Caller cancellation ends only that caller's wait, without cancelling a
shared refresh needed by other requests. Timer/listener cleanup covers settlement
and abort. A refresh failure retains its useful error instead of reverting to the
original generic 401 response.

Automatic workspace recovery now has a 20-second deadline, coalesces only the
same token revision, checks revision before token installation, validates the
returned subject/workspace, and cannot clear a newer recovery promise. Access-loss
events occur for authoritative 403/404, not a temporary server failure.

Automatic request retries require the original account and workspace. An in-memory
context revision also rejects old retries after logout/re-entry or switching away
and back. Token refresh or role renewal within the same context does not increment
that revision. A concurrently refreshed token is reused once instead of starting
another cookie rotation. The existing server authorization and refresh replay
detection remain unchanged; client JWT decoding is only a continuity check.

Password login, signup/verification, OTP, Google entry/callback and logout are
excluded from generic authentication retries. Startup restoration remains explicit
through refreshSession. No token is persisted or broadcast, and no credentials,
OAuth permission or cookie policy is changed.

## Verification boundary

Final affected web lint/typecheck/build pass 3/3 and diff checks pass; the existing
chunk advisory remains. No test suite. Manual
acceptance remains blocked by disabled browser use. Verify suspended/slow lock
holders, queue and HTTP timeouts, caller abort while another caller continues,
concurrent 401s, role-change recovery, logout/login and workspace changes during
each await, transient recovery failure and one request for invalid sign-in codes.

These bounds cover session recovery, not every initial API fetch, upload or provider
redirect. Browser suspension can delay timer execution. No rollback of a submitted
write is claimed. Cross-origin cookie rotation and browsers without Web Locks still
need separate acceptance; ordinary explicit login/workspace-switch UI sequencing
is outside this automatic-recovery slice.
