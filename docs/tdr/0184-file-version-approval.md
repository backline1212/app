# TDR-0184: Clients and the team can approve a file version

Date: 2026-10-25. Source: image/PDF review parity - website pages had a team-only
"Approve" for a captured page version; files had no sign-off at all, so a client's
"looks good, ship it" lived in a comment or an email.

## Decisions

- Approval belongs to one file version (each version is its own asset, TDR-0165): a new
  version starts unapproved; earlier versions keep theirs and can't be approved.
- `PUT /projects/{project}/assets/{asset}/approval {approved}`. Anyone who may comment
  on the project can approve, including client reviewers. Withdrawing is limited to
  whoever approved, or a team member who manages files.
- Stored on the asset as `approval {approved, by_type, by_id, by_name, at}`, separate
  from the asset `revision` so it never conflicts with a rename. `AssetOut.approval`
  (additive) exposes type, name, time and a per-reader `by_you`; never the approver's id.
- File review shows "Approve this version" with a confirm step that mentions open
  comments on the file ("Approve v4 with 4 open comments?"), then "Approved by <name>"
  with Withdraw where allowed.
- Recorded as `asset.approved` / `asset.approval_withdrawn` activity; the uploader gets
  a `file_approved` in-app notification ("<name> approved hero.png (v4)") linking to the
  file. The review report shows a file's approval under its heading.

## Verification

Backend ruff/format/mypy/scoping; workspace lint/typecheck/build. Chromium: a client
approved v4 (confirm mentioned 4 open comments), saw "Approved by you"; the owner saw
"Approved by Client Approver", got the notification, withdrew it; the client then saw
"Approve this version" again; activity listed both. API: a second client's withdrawal of
another client's approval returned 403 and `by_you` was false for them.
