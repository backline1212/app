# TDR-0172: Reviewers edit, delete and resolve their own comments

Date: 2026-10-25. Source: FLOW-04 (pending backlog 2026-10-24) - the API has had
author-only edit/delete and the project's "reviewers can resolve their own comments"
route, but no review surface offered them: a client who made a typo had to ask the team.

## Decisions

- One author-only action set, shown only on the viewer's own top-level comment:
  **Edit** (inline, Save/Cancel, guarded like other drafts), **Delete** (inline confirm;
  only while nobody has replied) and **Mark resolved** (guests, when the project's
  `reviewer_can_resolve` setting is on, until the thread is closed).
- Surfaces: the website widget (snippet/proxy guests), the extension (guest and member
  reviews, plus token-connected reviews) and the guest image/PDF review. The dashboard
  canvas and the widget's view mode keep these changes in the signed-in portal, as they
  already do for replies.
- "Own" is decided from identity the client already holds: `GuestSessionStatusOut`
  gains `guest_session_id` and `reviewer_can_resolve` (additive); member extension
  reviews use the token's `user_id`. The server still checks authorship on every call.
- `DELETE /comments/{id}` now refuses a top-level comment that has replies (409) instead
  of leaving those replies without a thread. Nothing called it before this change.
- Guests get `guest_safe_comment` responses from the own-edit and own-resolve routes too,
  so a comment the team has since assigned does not return assignees, due dates,
  priority or fix details to the client.
- The extension background relay allows only these three author-only routes on comment
  ids already loaded in the review (edit body shape is checked). Extension 0.5.5.

## Verification

Workspace lint/typecheck/build; backend ruff/format/mypy/scoping. Chromium: guest in a
proxied website review, guest image review, and guest and member extension reviews -
each created a comment, saw Edit/Delete (+ Mark resolved for guests with the setting
on), edited it, resolved it and deleted it; another person's comment showed no actions.
