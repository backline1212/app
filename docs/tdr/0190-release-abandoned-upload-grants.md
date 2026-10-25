# TDR-0190: Release storage held by abandoned presigned uploads

Date: 2026-10-25. Source: BUG-06 - a presigned PUT grant (`POST /api/v1/uploads`, still
available to API clients; first-party clients use the relay since TDR-0112) reserves its
bytes before the client uploads. When the object never arrives, the reconciliation job
kept the hold forever (re-checking every 15 minutes), because an absent HEAD cannot prove
an upload that started before the URL expired won't still finish. Abandoned grants
therefore counted against the workspace's storage limit permanently.

## Decision

- A grant's URL is valid for five minutes and the object is at most 20 MB, so any upload
  that started in time has finished well within a day. If the object is still missing 24
  hours after the reservation, the worker releases the hold (`state: deleted`), with the
  reservation token, as it already did at once for relay uploads.
- Before 24 hours nothing changes: a missing object keeps its hold and is re-checked; a
  present object is marked stored at its real size.
- Existing stale grants older than a day are released by the regular sweep after deploy.

## Verification

Backend ruff/mypy. Against local Mongo and S3 with three reserved rows (1 MB each) whose
check was due: a 25-hour-old grant was released, a 1-hour-old grant stayed reserved with a
new check time, and a relay reservation was released as before; workspace usage dropped
by exactly the two released megabytes. Test rows removed.
