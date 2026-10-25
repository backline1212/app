# TDR-0171: Carry open comments to a new file version

Date: 2026-10-25. Source: file-version workflow (TDR-0165) - after uploading v2 a team
had to re-find every open point on v1.

## Decisions

- Uploading a new version asks for confirmation with "Move open comments to the new
  version (same spot on the file). Resolved ones stay on vN" (on by default).
  `carry_open_comments` on the upload form; only with `replaces_asset_id`.
- In the same upload transaction, open root threads on the replaced version (not
  resolved/won't fix, not deleted) move to the new asset's page: `anchor.asset_id` and
  `page_id` change, the relative region stays (PDF page clamped to the new page count),
  the comment revision increments and `carried_from {asset_id, page_id, version}` is
  recorded; their replies follow. Ticket numbers, history, assignees and statuses are
  unchanged. Resolved threads stay on the version they were resolved on.
- `CommentOut.carried_from_version` (additive) shows as "From v1" in the comment
  panel; the upload response's `carried_comments` reports how many moved.
- After the upload, the review switches to the new version once the file dialog closes
  (switching during the upload tripped the unsaved-changes guard).

This revises TDR-0165's "comments are never moved": moving is now an explicit choice
per upload, and where a pin came from is recorded.

## Verification

Workspace lint/typecheck/build; backend ruff/format/mypy/scoping. Chromium: uploaded v4
of an image with the option on → "2 open comments moved to it"; #13/#14 now on v4 with
`carried_from.version = 3`; the view switched to v4 with both pins and no page error.
