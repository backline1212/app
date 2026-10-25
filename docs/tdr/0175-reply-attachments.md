# TDR-0175: Attachments on replies in every review surface

Date: 2026-10-25. Source: FLOW-04 remainder (pending backlog 2026-10-24) - the API
accepted attachments on replies, but the website widget, the extension and the guest
image/PDF review only sent text, and the widget never showed a reply's attachments
(a team reply with a screenshot reached the client as text only).

## Decisions

- The widget thread card shows each reply's attachments (images as thumbnails,
  video/audio inline, other files as links), the same way it shows the comment's.
- The reply form gets "Attach a file" (same picker, size limits and per-file
  retry/remove as the new-comment composer). Posting waits for uploads and refuses
  failed ones; a saved-but-unconfirmed reply retries with exactly the files it first
  sent. Files count as part of the draft for the leave/switch guards.
- Website widget uploads through the review's guest session; the extension through
  its upload relay; the relay accepts an `attachments` list on replies (up to 10,
  `key`/`filename`/`content_type` only) and the API validates every key.
- Guest image/PDF review: "Attach file" on the reply form, up to 10 per reply.
- Mentions stay in the dashboard: a client must not see the team's member list.
- Extension 0.5.7 (supersedes 0.5.6).

## Verification

Workspace lint/typecheck/build. Chromium: a guest in a proxied website review, a guest
in image review and a guest in an extension review each attached a PNG to a reply and
posted it; the reply showed the file in the thread.
