# TDR-0176: Reviewers can leave the automatic screenshot out

Date: 2026-10-25. Source: FLOW-06 / BUG-08 (pending backlog 2026-10-24) - every comment
captured the page automatically, with no way for a reviewer to keep something private
on screen (account data, another customer's details) out of the evidence.

## Decisions

- The comment composer (website widget, extension, point and area comments) has
  "Add an automatic screenshot of this page", ticked by default. Unticking it skips
  capture and upload entirely. The choice is remembered for the rest of the tab's
  review in sessionStorage (a per-viewer convenience, not business data).
- `capture_status` gains `"skipped"` (additive, request and response). A skipped
  comment never stores a screenshot key, even if one is sent. "Failed" keeps meaning
  the capture was attempted and did not work.
- The dashboard comment detail says "No screenshot: the reviewer chose not to include
  one" instead of showing a capture failure.
- Extension 0.5.8.

## Verification

Workspace lint/typecheck/build; backend ruff/format/mypy. Chromium: a guest unticked
the option and posted - stored `capture_status: skipped`, no screenshot key; the next
composer opened unticked and also saved as skipped; the dashboard detail showed the note.
