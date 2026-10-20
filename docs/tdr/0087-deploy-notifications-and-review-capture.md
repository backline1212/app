# TDR-0087: Signed deploy notifications and review capture

Date: 2026-10-20. Scope: replace Deploy sync's disabled placeholder with a real,
bounded CI-to-review flow. Implementation and verification are in progress.

## Decision

Project managers create, rotate or revoke an encrypted project credential. Mutations
use an expected credential version and actor-bound request replay, returning a
secret only for the just-created credential request. Guests cannot read settings,
history or secrets. Current issuer membership/manager access is required when a
hook arrives; archive/deletion blocks new delivery. Rotation/revocation cancels
pending capture so an older credential cannot be used after replacement. Changing
the project start address/environment cancels waiting rows and clears the latest
deployment pointer in the metadata transaction. Current page identities omit
fragments, so setup explicitly rejects fragment routes rather than claiming
route-specific capture for them. Website review remains available.

CI sends a bounded JSON body with delivery ID, environment, exact configured start
URL, actual deployment time and optional commit reference. Sign timestamp + dot +
raw bytes with HMAC-SHA256; reject invalid/stale signatures, payload reuse under
another body, unknown fields and cross-project addresses; retain older deployment
times as superseded history. Event order uses Mongo millisecond precision. No URL
is fetched by the hook. Keep a durable workspace/project delivery record, audit and
latest pointer in one workspace-serialized transaction. Preserve paginated history;
newer deployment times supersede waiting deliveries. Retries keep the same body and
delivery ID and refresh only the signature timestamp.

An authorized member-backed snapshot submission for the configured starting page,
whose server request began after receipt, can atomically link the pending delivery
to its saved revision. External guest snapshots cannot complete this team status.
The request boundary excludes in-flight submissions; it does not attest the client's
DOM capture time or prove the page loaded a particular build. Reload and inspect
the page during review. The existing durable
revision outbox drives recovery. Unchanged captured content can reuse its revision.
Capture proves observed browser state after a notification; it cannot prove a commit
is deployed, bypass cache or close tickets. The UI states this boundary and shows
awaiting/captured/superseded/cancelled history and recovery state. It never enables
the disabled shared-browser infrastructure. Background capture remains gated by
TDR-0065's actual isolation requirements.

The setup includes a dependency-free CI sender with explicit environment variables,
bounded timeout/retries and stable payload bytes. No credential or CI event is
created against shared production projects by this task. Secrets remain in the
creation response and dialog memory; no browser persistence or secret query data.
Unknown credential responses retain their request/version for retry. Revoke retries
keep their original version, so a late retry cannot revoke another manager's newer
credential. Confirm destructive credential changes and guard unsaved secret close.
The shared native dialog prevents default Escape close before applying its guarded
close handler. Storage of deploy metadata
is additive; project hard-deletion includes delivery rows in the graph.

## Source verification and pending acceptance

Contracts regenerated. Backend Ruff/full mypy (213 files), affected follow-up mypy
(20 files), scope audit (23 repositories), sender syntax and full frontend
lint/typecheck/build (12/12) pass before final navigation copy. Read-only production
index dry-run finds only the new deployments_project_history index missing with
no conflicts or data changed. Final affected checks/rollout follow in the ledger.
Final affected web lint/typecheck/build passes 3/3 after navigation/close copy.
MCP adds read-only paginated history using the same current project access gate;
it exposes neither secrets nor credential mutation. Version delivery completion
is reported separately from ticket recovery results.

Pending supported manual acceptance for setup/role/guest negatives,
secret replay/rotation/revoke, stale/invalid/oversize signatures, concurrent delivery
retries/order, matching/stale/in-flight snapshots, unchanged revisions, outbox
recovery and project hard-deletion. Browser use is currently unavailable. Source
checks, deployment success and contract presence do not close these journeys.
