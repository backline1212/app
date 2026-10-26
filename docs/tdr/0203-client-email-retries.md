# TDR-0203: Client reply/resolved emails retry and don't duplicate

Date: 2026-10-27. Source: deploy/infra audit (finding 10).

## Findings

These two emails go straight to Arq instead of the durable outbox. A provider failure
raised a plain error, which Arq doesn't retry, so the email was lost; a deploy that
interrupted a job and retried it could send it twice.

## Decisions

- Each job carries an idempotency key, also used as the Arq job id: per resolve
  (`guest-resolved:<comment>:<revision>`) and per queued reply email (a random suffix;
  the 15-minute per-thread throttle still applies). Resend drops a repeat with the same
  key, and Arq won't queue the same job id twice.
- A provider error (`ExternalServiceError`) retries after 1, 2 and 3 minutes, then gives
  up (4 tries). Other errors still fail at once.
- Moving these emails into the durable outbox stays a later option; with
  `job_completion_wait` (TDR-0200) and retries, the remaining loss case is the worker
  being down for longer than the retry window.
