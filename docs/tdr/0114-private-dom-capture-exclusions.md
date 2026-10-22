# TDR-0114: Exclude editable and marked-private DOM content from review evidence

Date: 2026-10-22. Backlog item: BUG-08, widget DOM-evidence slice.

## Plan and decision

The normalized DOM snapshot stores direct text, stable attributes and accessible
labels for visible elements. The anchor fingerprint uses the same text/attribute
hashes. Editable fields can contain user data; a reviewed site can also mark a
private region that should never enter review evidence.

Treat input, textarea, select, editable subtrees and `[data-backline-private]`
subtrees as private. Snapshot only their outer tag, bounding box and required
structural hashes: no text, stable attributes, style subset, accessible name, role
or descendants. Anchor hashes use the
same empty text/attributes, and exact selector paths use structural indexes rather
than IDs within private subtrees. This keeps snapshot and anchor hashes aligned
without storing field contents. An element inside a private subtree may not be
found by automatic revision recovery because the snapshot deliberately excludes
its children; the visible comment and its exact live selector remain available.

This is an exclusion rule for known editable/private areas, not automatic PII
detection for arbitrary visible page text or screenshots. Screenshot capture,
historical evidence, comment bodies and server log/export redaction remain open.
No stored evidence is rewritten and no backend/API contract changes.

## Acceptance and verification

Run widget lint, typecheck and production build, plus diff checks. Codex adds no
test suite under this task's AGENTS.md rule. After the widget SDK rolls out,
acceptance should inspect a newly captured version of a representative form and
private-marked region, confirm no contents/IDs/labels are stored, and verify
ordinary anchors, comments, reload and version capture still work. Do not capture
a shared signed-in page merely for source verification.

Source verification on 2026-10-22: widget and extension lint, typecheck and
build pass, as do diff checks. The extension's existing local store-preparation
changes were used for its build but remain unstaged. No suite or signed-in capture
was run. The widget/extension rollout and live evidence review remain pending.
