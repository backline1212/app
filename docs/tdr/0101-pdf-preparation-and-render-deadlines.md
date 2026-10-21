# TDR-0101: PDF preparation and render deadlines

Date: 2026-10-21. Scope: F31, FD-12 file preview recovery.

## Decision

The private-content fetch has a deadline in TDR-0100, but PDF worker preparation,
page parsing and rendering could still leave an indefinite loading indicator.
Bound document preparation and each page render independently to 30 seconds.
Preparation timeout destroys its loading task; render timeout cancels its task and
keeps annotation readiness false. Existing Retry PDF starts a fresh document task.
Late callbacks from a timed-out, replaced or unmounted task cannot mark the preview
ready. Timer cleanup covers success, error, replacement and unmount.

Validate finite, positive page dimensions before computing the existing pixel cap
and viewport. A malformed page reports a readable error instead of attempting an
invalid canvas allocation. Existing 4096-pixel side/8-million-pixel area limits and
per-document/page readiness gates remain in force.

## Verification boundary

Affected web lint/typecheck/build pass 3/3; diff checks pass and the existing chunk
advisory remains. No
suite, upload, fixture, storage write or permission change. Actual PDF decode,
timeout, cancellation/retry, rapid page changes, malformed dimensions, pin placement
and narrow/touch acceptance remain pending. These are recoverable UI deadlines;
browser suspension can delay timers, and task cancellation is not a guarantee
against every browser/worker resource failure. No universal PDF compatibility claim.
