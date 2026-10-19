# TDR-0073: Keep comment controls clear of the native toolbar

Date: 2026-10-19. Status: deployed and statically verified; updated-extension visual acceptance pending.

## Context

The real Chrome draft check on extension 0.4.1 found its bottom toolbar covering
the composer footer. DOM measurements put the toolbar top at 544.4 CSS pixels,
Post at 579.75–613.875 and the composer bottom at 626.675. The native toolbar never
configured the shared card placement inset already used by the embedded widget.
This makes pointer submission/cancellation unreliable in a shorter window.

The user separately approved one labelled QA comment and a screenshot of the
public example.com page. Its keyboard submission worked; the portal retains the
ticket and loaded screenshot after reload. That verifies normal persistence, not
the corrected layout or failure-path behavior on a newly installed extension.

## Decision

Reserve the native toolbar's measured height, bottom offset and a 12-pixel gap.
Observe its size so wrapping/status text changes update the inset. Keep the
reservation while native screenshot capture temporarily hides the overlay, and
reset it when the toolbar is removed.

Open composer/thread cards observe their size, viewport resize and inset changes.
Limit their height to the remaining viewport and scroll the body while retaining
the header. This keeps long text/attachments reachable above the toolbar. Close
removes card resize listeners/observers; composer close also disconnects its
textarea observer. Existing document-coordinate anchors, submission and visibility
policy remain intact.

Ship extension 0.4.3, including TDR-0072's recovery fix. Permissions/protocol and the
portal's minimum 0.4.1 compatibility boundary are unchanged. No API/schema/index
or data migration; an unpacked extension must be updated/reloaded to receive the
fix. The deployed SDK receives the shared card changes independently.

## Verification

Full frontend lint/typecheck/build passes 12/12 (six cached), retaining the
pre-existing large-chunk advisory. No test suite written/run under this Codex
task's instructions. Source/geometry review confirms inset propagation and
bounded scrollable cards. Actual 0.4.3 short/wrapped-window pointer access and
induced capture/upload error recovery remain acceptance items until the user
reloads the new extension. Record exact rollout IDs in the delivery ledger.

Source 679c1c1 succeeds on API/worker/Vercel. The served SDK matches local bytes;
all five deployed ZIP entries match local normalized text and report version
0.4.3. The user was asked to update/reload the unpacked installation because the
browser tool cannot open Chrome extension settings. The delivery ledger records
exact deployment IDs and preserves the remaining browser checks.
