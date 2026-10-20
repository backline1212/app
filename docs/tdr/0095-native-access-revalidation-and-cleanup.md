# TDR-0095: Revalidate native review access and clear ended review state

Date: 2026-10-21. Scope: FD-08/09/16/17/25, native F33 follow-up and draft teardown.

## Problem

Native comment polling only displayed access errors. It left old pins, threads and
drafts available after access ended, and paused entirely while a draft was open.
Chrome session storage read/modify/write operations could also interleave: a late
successful response could save an old credential/session over a cleared record.
Shared new-comment composers were removed with their host without always releasing
their active global handle on session teardown.

## Decision

Check native access every 30 seconds while visible and on focus/visibility return,
independently of drafts and comment polling, without overlapping checks. Bound this
probe to 12 seconds. Member checks use the current project authorization response;
guest checks use the current guest-session policy and matching review/project/link.
Archived projects, removed access, expired credentials/links, deletion in progress
and a changed website origin end the review. Network/timeout/5xx failures preserve
drafts and report retryable access uncertainty; they are not proof of revocation.

On an authoritative access denial, clear the native context, pins, threads, local
composer/reply text and draft handles. Remove the toolbar's project title and disable
review modes. Keep Return to Backline and Close website tools available. The worker
marks that launch ended, blanks its credential/author and clears known page/comment
IDs; only local return/close remains available until a fresh portal launch. Comment
GET denial does the same. A reply conflict remains an unconfirmed immutable save,
not an access-end event. Pending requests can already have committed: local cleanup
does not promise cancellation/rollback or permit blindly posting a replacement.

Serialize all per-tab session read/modify/write operations. Scope additions require
the same launch/credential and cannot restore an ended record. Successful probes
cannot undo an ended marker. Close/rollback callbacks require the original launch;
failed launches cannot restore an ended state. Tab close and connection clear use
the same writer queue. A connection-clear epoch prevents older in-flight launches
from reappearing after clear. Browser restart still clears Chrome's session storage;
this is not a durable offline review queue.

Refresh current project role. A changed role clears held action callbacks/drafts and
explains re-opening tools; a viewer cannot activate a new comment/draw mode. Individual
API mutations retain their authoritative current-role checks. Toolbar mode changes
do not overlap or overwrite an ended-access notice after a delayed result, and a
late close callback cannot clear a newer review. Cleanup of the shared composer is
idempotent and also runs when a standalone widget session ends.

This is observed-revocation cleanup, not instantaneous offline revocation: hidden
tabs are checked on return and visible checks have the interval/network bound above.
Unconfirmed in-flight writes must be checked in the portal. No new HTTP schema,
credentials, extension permissions, collection/index or migration is introduced.

## Verification and release

Affected widget/extension lint/typecheck/build passes 6/6 after access, serialized
storage, composer cleanup and toolbar race refinements, including the final
launch-waiter cleanup. Diff checks pass. Earlier TDR-0093 full frontend graph passed 12/12 and TDR-0094 backend
Ruff/full mypy (214 files)/scope (23 repositories) passed. No test suite written/run,
no shared permission change, feedback write, identity-provider request or new upload.

Extension source version is 0.4.8. Installed browser remains 0.4.3; served rollout is
pending Railway's temporary deployment pause. Local icon/store changes are separate.
Manual acceptance remains open for guest/member expiry, revoked link/member/project,
archive/origin/role change, offline/5xx/timeout recovery, hidden/foreground transitions,
draft/pending writes, late polling/launch/close/logout responses, return/close after
denial and a clean new launch. Do not infer acceptance from static checks.
