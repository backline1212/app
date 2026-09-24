# TDR-0030: The comment card changes status through the dashboard, not as a guest

Date: 2026-09-22
Status: Accepted

## Context

Clicking an existing pin opens the widget's read-only comment card
(`ui-comment-view.ts`). It showed the comment's text, tag and attachments but not its
status, and gave no way to change it. Team members reviewing in the dashboard's canvas
wanted to move a comment along ("In progress", "Resolved", ...) from that card, from its
dark header, without going to the Comments drawer.

The widget always talks to the API as a guest, even in the canvas: the member's
display name is passed in, but the calls carry an `X-Guest-Session` token. Guests never
change a comment's status (13-Authentication.md §13.5). The one exception,
`PATCH /comments/{id}/resolve` (TDR-0015), is own-comment, one-way and project-gated,
and doesn't cover the rest of the workflow.

## Decision

The card's header carries the comment's status as a pill (dot + label, the hand-kept
copy of `@backline/ui`'s labels and colors in the widget's `status.ts`). Whether it's a
menu depends on who can actually make the change:

- **Dashboard canvas.** The widget asks its parent, `backline:request-status-access`.
  `ProjectOverviewPage` answers `backline:status-access` with `canUpdateStatus` (every
  workspace role holds `comment:update_status`). Choosing a status posts
  `backline:update-comment-status` with a request id; the dashboard makes the change
  with the member's own session, the same `PATCH /comments/{id}` the Comments drawer
  uses, merges the result into its comment cache, and replies
  `backline:comment-status-result` with what was saved. The widget shows the new status
  at once, then settles to the dashboard's answer, or puts the old one back with an
  error line if it fails or no answer comes within 15 s.
- **Extension.** It already holds a member token, so it calls the same PATCH directly.
- **Guest reviewers on the client's site.** Read-only pill. Guest permissions are
  unchanged.

The dashboard checks that each message came from its own canvas iframe
(`event.source`) and that the status is in the workflow vocabulary. The widget accepts
answers only from `window.parent`. It posts to `"*"`, like its other dashboard messages,
because it has no fixed dashboard origin. A page that frames the site and answers in
the dashboard's place gains nothing: the change is only ever made by the dashboard, with
a member session.

Status changes made elsewhere reach an open card through the existing guest socket
(`comment.updated`, client-layer comments only), which now also updates the widget's
thread state.

## Consequences

- Members can triage straight from the pin in the canvas, and the drawer updates with
  it.
- No new endpoint, permission or guest capability. The backend is untouched.
- The widget's copy of the status labels/colors must still be kept in sync with
  `packages/ui/src/workflow.ts` by hand (now in `apps/widget/src/status.ts`).
- A member who created a comment in this canvas session still gets the existing
  "Your comment was updated" toast when they change its status themselves.
