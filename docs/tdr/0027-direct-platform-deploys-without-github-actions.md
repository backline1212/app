# TDR-0027: Direct platform deploys without GitHub Actions

Date: 2026-09-23
Status: Accepted

## Context

Vercel and Railway already receive repository events through their own GitHub
integrations. The checked-in GitHub Actions workflow did not perform either deployment;
it ran verification jobs and a conditional post-deploy smoke test. Its historical runs
were consistently failing, while Vercel still deployed and Railway independently
evaluated its service watch paths.

The repository owner explicitly chose not to retain or repair that hosted workflow.
Historical TDRs remain accurate descriptions of the earlier implementation, but this
decision supersedes their operational GitHub Actions requirements.

## Decision

- Remove `.github/workflows/ci.yml` and do not use GitHub Actions for this repository.
- Keep Vercel and Railway connected directly to the repository and production branch.
- Keep Railway watch paths: a service deploys only when its relevant source changes.
- Run affected lint, typecheck, build, contract-drift, security, and permitted isolated
  test checks locally before merge, recording evidence in the delivery ledger.
- Run the documented production smoke test manually after significant deployments.

## Consequences

- A push to the configured production branch can deploy without a hosted quality gate.
  Review discipline and recorded local verification are therefore required.
- GitHub will no longer show the failing `CI / backend`, `CI / frontend`, or
  `CI / test-e2e` checks on new commits.
- Existing check history remains visible on old commits; deleting the workflow cannot
  rewrite that history.
- Vercel and Railway account usage is unchanged by removing GitHub Actions. Their own
  builds and running services still consume each platform's plan allowances.
