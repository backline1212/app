# TDR-0140: Expose non-secret API release identity in health

Date: 2026-10-24 (Asia/Calcutta). Backlog item: SUG-01 / DEP-01.

## Decision

The health endpoint reports MongoDB and Redis reachability but cannot identify
which API deployment answered. Add a Pydantic `HealthOut` response with nullable
`release_sha` and `deployment_id`, and regenerate the saved OpenAPI contract and
TypeScript declarations. Read Railway's provided environment variables at
request time. Accept only a 40-hex-character commit SHA and a parseable UUID;
otherwise return null. Railway documents that `RAILWAY_GIT_COMMIT_SHA` is
available for GitHub-triggered deployments and `RAILWAY_DEPLOYMENT_ID` is a
deployment variable: [Railway variables reference](https://docs.railway.com/variables/reference).

Keep `/health` status 200/503 behavior and existing `status`, `mongo` and
`redis` fields. Mark the response `Cache-Control: no-store` so a release check
does not reuse a stale health body. No secret, credentials, branch name or
repository owner is returned. Existing clients can ignore the two additive
fields; callers must not assume a SHA is present for every deployment method.
This identifies the
API container only. Worker version/heartbeat reporting, SDK compatibility
and a repeatable pre-release command remain separate SUG-01 work.

## Acceptance and verification

Locally, verify the OpenAPI/type generation and static checks. After a
matching API release, compare `/health` release SHA and deployment ID with
Railway's actual API deployment, including a degraded 503 response if a
dependency is unavailable. Compare the worker revision separately. Do not
claim runtime acceptance from source checks alone.
No test suite is added under AGENTS.md.

Post-release observation on 2026-10-24: the API health response returned HTTP
200, `status: ok`, healthy MongoDB/Redis, release SHA
`612e60a19f38dde8846fec941cae2439feb245c9`, and a deployment ID matching
GitHub's Railway API deployment status URL. `Cache-Control: no-store` was
present, and live OpenAPI equaled the saved 132-path contract. A degraded 503
case and worker queue behavior were not exercised.
