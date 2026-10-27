# TDR-0216: Feedback emails for every notification type

Date: 2026-10-27. Source: follow-up check of TDR-0208.

## Finding

The opted-in feedback email looked up its subject with `_SUBJECTS[type]`. The new
`client_feedback` notification (TDR-0208) had no entry, so for anyone with email
notifications on, the job raised `KeyError` and the minute sweep kept retrying it; no
email was sent.

## Decision

`client_feedback` has its subject ("A client left feedback"), and an unknown type falls
back to a generic subject instead of failing the job. Verified locally: a client comment
on a file produced "Backline: A client left feedback" for the owner, with no errors in
the worker log.
