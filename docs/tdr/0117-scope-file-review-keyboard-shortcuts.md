# TDR-0117: Scope file-review keyboard shortcuts to the review surface

Date: 2026-10-22. Backlog item: FLOW-08, PDF/image keyboard UX slice.

## Plan and decision

The file-review screen listens for zoom, rotation and previous/next-page keys
on `window`. It previously suppressed them only when an input or textarea had
focus, or while a review draft existed. Arrow keys in a selector, dialog,
tablist or button could therefore turn a PDF page; Ctrl/Alt/Meta key chords
could also alter the file while invoking browser or assistive shortcuts.

Ignore already-handled and modified key events, and events from editable
controls, buttons, dialogs and tablists. Preserve the existing shortcuts when
focus is on the review surface and no draft is active. This changes only
browser-side event handling: no API, stored data or migration.

## Acceptance and verification

Run web lint, typecheck and production build plus diff checks. Codex adds no
test suite under this task's AGENTS.md rule. Browser acceptance after rollout
should open a multipage PDF, confirm unmodified arrows/zoom/rotation work on
the review surface, and confirm file controls, dialogs, tablists and modified
keys keep their own behavior. PDF rendering, upload and coordinate/pin QA
remain separate; this source check does not establish end-to-end PDF support.

Source and rollout verification on 2026-10-22: web lint, typecheck and build
pass; GitHub reports the Vercel context successful for `bce57e8`, and the
public `backline-qa.vercel.app` root returns HTTP 200. No browser keyboard or
actual PDF journey was run.
