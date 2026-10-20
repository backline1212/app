# TDR-0085: Account for and reserve private storage bytes

Date: 2026-10-20. Scope: audit F24, continuing core product and file-review repairs.

## Decision

Add a workspace-scoped object ledger keyed by bucket/object identity. All object
writes reserve their byte size under the existing workspace plan transaction before
granting a signed PUT or uploading through the server. Screenshots/attachments,
PDF/image files, compressed snapshots, project previews and browser renders use
the same boundary. Decimal GB matches pricing. Reads and existing content continue
at/above quota; new reservations fail with PLAN_LIMIT_EXCEEDED. Plan downgrades
retain content. A same-key/same-size retry reuses its hold, without extra capacity.

Reservations count immediately, including abandoned/uncertain writes. Successful
storage confirms the ledger. Confirmed deletion releases bytes; archiving retains
them. Existing project deletion includes ledger keys even if the object is missing.
Server uploads have bounded S3 connection/read/retry settings and a request deadline.
After fifteen minutes, a bounded worker sweep checks unfinished server reservations
with HEAD before releasing missing objects. Reservation tokens prevent an older
check from freeing a renewed hold. Visible objects retain their measured size.

Signed direct PUTs need a conservative exception: absence after URL expiry does not
prove that a request started earlier cannot finish. Their declared bytes stay held
until actual upload confirmation or confirmed project deletion. Billing explains
this tradeoff. Reclaiming unused signed grants more precisely needs a future bounded
API upload-grant transport; it must not be simulated by unsafe TTL-only accounting.
Existing deletion still requires the normal archive/preview/confirmation and is
not executed by this task. No automatic object deletion or retention change.

New workspaces know their initially empty bucket baseline. Existing workspaces use
an additive dry-run-first bucket inventory migration before enforcement. Inventory
maps object namespaces and legacy snapshot project IDs to workspaces, refuses
unattributed Backline objects and reports counts only. It imports actual sizes under
the workspace transaction without reducing concurrent live holds. Bucket identity
is part of readiness, so changing buckets requires another inventory. Billing shows
unknown usage until ready, then retained/reserved bytes and the real enforcement
state. No object keys/client contact data are exposed by the billing contract.

Rollout has two phases: deploy tracking with enforcement false, verify all services,
repeat inventory dry-run then import accounting, and enable enforcement consistently
on API/worker/cloud-login. Do not enable while old untracked writers are deployed.
The inventory and ledger are additive; no business records/objects are deleted.

## Verification and rollout evidence

Initial production dry-run: 10 workspaces, 177 attributable objects, 25,320,983
bytes, zero unattributed or unrelated objects. No data modified. Index dry-run:
existing review/notification indexes present, two additive storage ledger indexes
missing, no conflicts. Backend Ruff/full mypy (208 files), affected mypy (31 files),
migration mypy and expanded scope audit (22 repositories, including quota/deletion
repositories) pass. Frontend lint/typecheck/build passes 12/12 before the last copy
refinement; final affected checks/rollout remain in progress. Contracts regenerated.

No production upload, comment, snapshot or deletion was submitted for acceptance.
Pending manual checks: concurrent near-limit grants/server uploads, retries, failed
storage/reconciliation renewal race, all storage paths, downgrade/overage behavior,
confirmed deletion and billing UX. Browser use remains unavailable. Deployment and
inventory success are not evidence that these write-path journeys passed.

## 2026-10-20 rollout follow-up

Tracking commit 64639a7b107a4656654533dbdf721eb7d00b369f reached SUCCESS on
Railway API, worker and cloud-login. Repeated read-only inventory matched the
baseline. The initial sequential import stopped with OperationFailure; a separate
read-only report showed two ready workspaces and enforcement remained false. The
import now reads existing holds once and bulk-writes per workspace under the same
plan lock, preserving larger live holds and renewal tokens. This reduces database
round trips within the transaction; the original exception did not establish a
specific database error code. No objects or business records were deleted.

After Ruff/mypy/scope checks, another dry-run matched and the batched --apply
completed: 10 workspaces, 177 objects, 25,320,983 bytes, zero unattributed objects.
Read-only accounting report confirms all ten ready, exactly those held bytes,
zero recent untracked uploads and enforcement false. Read-only index inspection
finds both storage indexes present and no conflicts. The bounded report emits
aggregate totals only and can be rerun before future enforcement/bucket changes.
Enforcement configuration/deployment verification follows in the delivery ledger.

Rollout: 1aa9a2e2346818d756f6aefd9f21de89bdcaf0fd reached SUCCESS on all three
Railway services and Vercel. Enforcement configuration is true for API, worker and
cloud-login; read-only accounting remains ten ready / 177 objects / 25,320,983 bytes
with zero recent untracked uploads. Public health is status/mongo/redis ok. Actual
quota writes, near-limit races/reconciliation and billing browser acceptance remain
pending; no files were uploaded or deleted for this verification.
