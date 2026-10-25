# TDR-0182: Cleaning up uploads no comment ever used

Date: 2026-10-25. Source: BUG-07 (pending backlog 2026-10-24, "conservative cleanup for
unused evidence ... and orphaned objects").

## Problem

Screenshots and attachments are uploaded before a comment, reply or ticket is posted.
A cancelled draft or a post that never completes leaves the object in storage, still
counted against the workspace's storage quota, with nothing to remove it.

## Decisions

- An operator script, not an automatic job: `python -m scripts.gc_unreferenced_uploads`
  (dry-run by default; `--apply`, `--workspace`, `--min-age-days`, minimum 2, default 7).
- Candidates are upload records older than the cut-off whose key no comment in the
  same workspace names as `screenshot_key` or an attachment key. Replies, standalone
  tickets, asset comments and soft-deleted comments all count as references, so a
  deleted comment's evidence is kept.
- With `--apply`, per candidate: delete the object, release its storage-accounting
  entry (quota goes down), remove the upload record. A failure leaves the rest for the
  next run; re-running is safe.
- Objects outside `uploads/` (files, previews, branding, snapshots) are never touched;
  project deletion keeps its own tombstone GC.

## Verification

Backend ruff/format/mypy. Local data: the dry run over 13 aged uploads found none
unreferenced; after uploading a file without posting (aged 9 days) the dry run listed
exactly that key, `--apply` removed the object, released its ledger entry and record,
and a re-run found nothing. The 13 referenced uploads remained.
