# TDR-0072: Restore a comment draft after submission exceptions

Date: 2026-10-19. Status: deployed in 0.4.3; updated-browser failure-path acceptance pending.

## Context

Audit F21 remains present in the shared widget composer. Its submit handler sets
`submitted` and disables controls, then handles only a fulfilled callback. Native
point capture computes an anchor and captures/uploads its screenshot before its
POST error handler. A rejected capture/upload or a synchronous callback exception
therefore strands the draft with Post and Cancel disabled. The installed widget
and extension both consume this composer.

## Decision

Invoke the adapter callback inside a promise boundary and handle rejection at the
shared composer. Restore pending state and controls, retain the text, attachments,
selected tag and pin, show an actionable error, and focus the text field for an
explicit retry. Ignore late completion after teardown. Keep existing successful
submission and fulfilled-failure behavior, request identity and backend contracts.
Do not automatically retry, fabricate a successful capture or change screenshot
privacy, tenant scope or permissions.

Ship extension 0.4.2 because its content script bundles the shared composer. Its
permissions and protocol are unchanged. The portal's minimum 0.4.1 remains the
compatibility boundary for correct tab selection/return; the recovery repair needs
the new extension download and reload. Existing native sessions are not claimed to
have the new code merely because the API was deployed.

No API/schema/index/data migration. The broader capture/evidence, ambiguous-save
retry and CR-04 parity acceptance requirements remain open.

## Verification

Full frontend lint/typecheck/build passes 12/12 (three cached), with the existing
large-chunk advisory. Record exact rollout evidence in the delivery ledger. No
test suite written/run under this Codex task's instructions. Source review confirms
that both callback rejection and synchronous throws
reach the recovery handler; induced capture/upload failure in an updated real
browser remains a separate acceptance item.

The final 679c1c1 release also contains TDR-0073's measured toolbar-space repair.
API/worker/Vercel rollout and matching served SDK/0.4.3 ZIP are recorded in the
ledger. The explicitly approved normal native save/screenshot/reload pass uses
installed 0.4.1 and does not substitute for updated-build failure acceptance.
