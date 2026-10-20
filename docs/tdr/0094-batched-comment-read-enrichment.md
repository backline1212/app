# TDR-0094: Bound comment-list enrichment work

Date: 2026-10-21. Scope: F32, FD-09/10/11/12/18 read performance, partial repair.

## Problem

Page/project comment lists already batch member names, but still look up each
page, guest author and missing reply parent individually. Evidence URLs create a
storage client/thread per attachment. An unbounded gather fans out this work for
every returned comment. Ticket lists likewise repeat page/guest/signing work.

## Decision

Use one request-local, workspace-bound read context for already-authorized page,
project and ticket lists. Reject mixed-workspace input before enrichment. Process
100 rows at a time; query missing page/project references, member/guest names and
reply parents in batches. Cache positive and missing lookups for this request only.
Guest name queries carry workspace scope and select display names without contact
fields. Single-comment guest labels also verify workspace ownership.

Sign only keys passing the existing workspace/project upload validation, through
the existing bulk signer in batches of at most 100 unique keys. Reuse the resulting
URLs within this response. Never put private signed URLs in process-global caches.
Keep parent workspace/page consistency checks, original ordering, complete fields,
legacy anchor/context fallback and existing current-access/layer filters. Rendering
yields between row batches; it no longer creates a task per listed comment.

This does not replace authorization. It also does not close F32: the legacy
page/project collection APIs remain unpaginated and native polling still requests
the complete page list. Bounded cursor/thread loading, deltas/removal semantics,
large-workspace memory and measured response/latency budgets remain open work.
No HTTP/Pydantic contract, generated declaration, collection/index or migration
changes are needed. Single-comment mutation responses retain their direct path.

## Verification

Backend Ruff checks pass across app/scripts; strict mypy app passes all 214 files;
workspace scope check passes 23 repositories. A first typecheck caught nullable page
IDs in cache lookups, fixed before the final pass. No test suite was written/run.
Source review confirms tenant-scoped guest/parent/page batches, request-local caches,
key validation before signing and retained output order. These are not load,
storage-provider or live negative-authorization acceptance results.

Pending: repeated/missing authors/pages/parents, cross-workspace corrupt references,
legacy replies, mixed client/team layers, private evidence and standalone tickets;
compare small/large response fields/order and measure DB/signing counts and latency.
Railway still rejects deployment requests with a temporary pause (including the
preceding 44602d7 dispatch). No new live source version is inferred from a push.
