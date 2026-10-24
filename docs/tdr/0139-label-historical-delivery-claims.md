# TDR-0139: Distinguish historical milestones from current delivery evidence

Date: 2026-10-24 (Asia/Calcutta). Backlog item: SUG-15.

## Decision

The top-level README displays permanent passing CI, test-count and M0–M12
complete badges, although GitHub Actions was removed and later work has open
deployment and browser acceptance. Replace those timeless claims with links
to the current pending inventory and delivery ledger. Describe M0–M12 and the
launch-readiness audit as historical milestones. Add the same context banner
to the old launch-readiness and backend implementation-plan documents so
direct readers see where current status lives.

The README also says unconfigured OTP email always logs to the console and
claims clean security audits and zero tenant leaks without current evidence.
State the actual local-only email preview/production failure behavior, point
to the workspace-scope script, and remove unsupported current audit claims.
Keep runnable local setup and architecture guidance. Verification commands
refer to current task instructions in AGENTS.md instead of prescribing a
test suite for every Codex change.

No application, provider, API schema, generated type or deployment behavior
changes. Other older implementation/spec pages remain historical references;
their unchecked boxes require comparison with later TDRs and source, not an
automatic conversion into new backlog items.

## Acceptance and verification

Check changed Markdown links, diff and README claims against current source
and ledger. No test suite is added under AGENTS.md. Keep the 2026-10-24
inventory as the current work index and update it when slices are completed.
