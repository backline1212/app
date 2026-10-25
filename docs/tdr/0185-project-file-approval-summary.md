# TDR-0185: File sign-off on project cards

Date: 2026-10-25. Source: follow-up to TDR-0184 - approvals were only visible inside
a file's review, so the Projects page couldn't answer "which designs are signed off?".

## Decisions

- `ProjectOut.file_approval {approved, total}` (additive), set only in project lists
  and only for image/PDF/app-screen projects with current files: latest versions that
  aren't archived, and how many of them are approved. One workspace-scoped
  aggregation per list request (`AssetRepository.approval_summary`).
- The card footer and the table's stage column show "1 of 3 files approved", or
  "File approved" / "All files approved" when done. Nothing is shown until at least
  one file is approved, so teams that don't use approvals see no change.

## Verification

Backend ruff/format/mypy/scoping; workspace lint/typecheck/build. Chromium: after a
client approved the only current file of the image project, its card showed "File
approved"; other file projects showed nothing.
