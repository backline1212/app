# TDR-0090: Recover deployment dispatch without uploading a dirty checkout

Date: 2026-10-20. Scope: verified rollout of TDR-0089 and later backend changes.

## Decision and evidence

After pushing 93acf9fc8d5d826f17abc1fe756cf59fcfa9c6c7, Railway still reported
7b25ac3 as the successful backend deployment, with only the expected skipped web-only
5db789c record afterward. Origin/main matches the pushed SHA. Read-only environment
inspection confirms all three services use backline1212/app main and the checked-in
watch paths still match. No new automatic deployment for 93acf9f was observed.

Add a dry-run-first deploy command that validates exact origin/main and all three
configured repository/branch sources before dispatch. Use the live-introspected
serviceInstanceDeployV2 mutation with the explicit commit SHA. Never deploy this
dirty checkout or include unrelated extension/store preparation. Return accepted
deployment IDs only; dispatch acceptance is not build/health success. Stop on an
error so a partial dispatch is visible and can be inspected before another attempt.

Dry-run passed for API, worker and cloud-login. The first API dispatch returned
`Deploys have been paused temporarily`, with no deployment ID; worker/cloud-login
were not dispatched. A diagnostic request with errors exposed returned the same
provider pause. No settings, business data or billing configuration was changed.
TDR-0089 backend rollout remains pending this external condition. Continue source
work and recheck later; do not claim the version guards live from Vercel success.

## Verification

PowerShell parsed and dry-run validated the script against current source metadata.
Live mutation fields/argument/result types were inspected through Railway's API.
No suite, deployment upload, destructive fixture or production review write.
Future acceptance: exact SHA reaches SUCCESS on all services, health/OpenAPI expose
the expected contract, and separately verify actual write/browser behavior.
