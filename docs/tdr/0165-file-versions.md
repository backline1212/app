# TDR-0165: File versions for image and PDF review

Date: 2026-10-25. Source: backlog SUG-09 (replacement files) - agencies iterate a design
over rounds and had to upload a separate file each round.

## Decisions

- **Each version is its own asset.** Manage files → "New version" uploads a file that
  replaces one file (`replaces_asset_id` on upload). The new asset gets `version_group`
  (the original's id) and `version` (max + 1); the replaced one gets `superseded_by`.
  Every version keeps its own page and pins - comments are never moved or re-anchored,
  so earlier feedback stays exactly where it was given (immutable evidence).
- Only the current version can be replaced (conditional update in the upload
  transaction; a lost race returns 409), it must be the same kind (PDF ↔ PDF, image ↔
  image), and earlier versions don't count toward the file limit (a PDF project's one
  file can now get new versions).
- **Review UI.** Tabs show each file's latest version ("v3"); a version menu opens
  earlier ones, which show "You're viewing v1 … new feedback goes on the latest version"
  with Open latest, and take no new pins (the API refuses comments on a superseded
  version). Uploading a new version while viewing the old one switches to it.
- All fields are additive; existing files read as version 1 with no group.
- Side panel author labels now read Client/Team, matching the ticket view.

## Verification

Workspace lint/typecheck/build; backend ruff/format/mypy/scoping. Chromium: uploaded v2
of an image from Manage files; tab shows v2, version menu lists "v2 (latest)", "v1"; v1
shows the banner and its comments; a pin on v2 saved as #13.
