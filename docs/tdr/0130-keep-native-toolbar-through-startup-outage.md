# TDR-0130: Keep a website review toolbar through startup API outages

Date: 2026-10-24. Status: source/package verified; web rollout and installed-browser acceptance pending.

## Problem and decision

When the extension opens a project website, its content script creates the
toolbar and confirms review access through the API. A Railway edge fallback or
browser network failure during that first check removed the toolbar. The
tab-bound session remained in extension storage, but no code retried attaching
the toolbar on the same page. A reviewer had to reload or launch again after
the service recovered, despite the earlier continuity fix in TDR-0127.

The extension now normalizes network failures to retryable service
unavailability. If initial access confirmation returns 503, it keeps the
toolbar and tab session, clearly reports the temporary problem, and lets the
existing visibility/focus/30-second access checks retry. On a successful
recheck, the toolbar returns to its browse guidance and can satisfy a still
pending launch-ready waiter. Real access denials still end the session and
remove the tools. API authorization remains required before loading or saving
feedback; retaining the toolbar does not bypass the backend.

Source manifest and versioned portal download advance to 0.4.13. The older
0.4.12 ZIP stays available for rollback. The Chrome Web Store draft remains
0.4.9 until the owner updates and publishes it.

## Verification boundary

Widget, extension and web lint/typecheck/build passed (7/7 Turbo tasks); web
build passed again after the ZIP was copied. Source, portal-public and built
ZIPs are 51,939 bytes with SHA-256
`62100C9FEFEDB1574891F71B74B40954C42DFC1EAB713630AFEEBC6E082C41C2`;
the archive manifest is 0.4.13. No test suite was written or run under the
Codex task instruction. The API still returns Railway edge fallback 404, so
live launch, recovery and genuine revocation acceptance remain pending.
