# TDR-0126: Distinguish an API outage from missing account data

Date: 2026-10-24. Status: web deployed; browser acceptance pending.

## Problem and decision

The public API host returned Railway's edge fallback 404 for `/health` and
authentication endpoints while FastAPI was unreachable. The web client would
otherwise turn that into "That couldn't be found. It may have been deleted,"
which falsely implies an account or resource problem. A 404 during workspace
reopen could also trigger the access-lost event, despite no authorization
decision having reached the application. The login page continued to suggest
email sign-in when its capabilities query failed, even though password and
email-code routes might fail for the same reason.

The API client recognizes the edge's `x-railway-fallback: true` 404 as a
temporary service error. It does not dispatch workspace-access-lost for that
response, and it gives a retryable message rather than a missing-resource
message. Fetch failures that hide the response under CORS now say the service
or the user's connection may be unavailable. The login page distinguishes
those network/service errors from a failure to check only Google sign-in.

Ordinary FastAPI 404 and 403 responses retain their existing behavior. This
does not restore a down API service, change authentication contracts or
persist browser credentials. The infrastructure still needs separate recovery
and end-to-end acceptance.

## Verification boundary

Web lint, typecheck and production build passed (3/3 Turbo tasks). Vercel
reported success for `917fd83`; the served login bundle includes the outage
message and the portal root returned HTTP 200. API `/health` still returned
Railway edge fallback 404. A signed-out in-app browser visit to `/login`
displayed the new service-unreachable message and a Check again control after
the capabilities request failed. Actual sign-in and recovery were not accepted.
After API routing recovers,
verify a real wrong password, absent
workspace, expired session and successful sign-in; on another controlled
outage, verify no false access-lost message. No test suite is written or run
under the Codex task instruction.
