# TDR-0057: Member-bound canvas sessions

Date: 2026-10-02
Status: Implemented. Verified by the backend suite, scratch API checks, lint, typecheck,
build and a browser pass.
Closes the known limit in TDR-0056.

## Context

The dashboard's review canvas loaded the site through one of the project's client review
links. Its widget then signed in as an ordinary guest of that link. That had two
consequences:

- **Viewers held a commenting credential.** A viewer had to be able to list the project's
  review links so the canvas could load. The canvas address, and the page source the
  proxy serves, carry the link's token. A viewer could open that link on its own and
  comment as a guest, like any client holding it. TDR-0056's view-only canvas hid the
  composer, but the API couldn't tell the viewer from a client.
- **Role checks stopped at the iframe.** Even for commenters and editors, the canvas
  posted as an anonymous guest. Nothing on the API side knew which member was behind it,
  so a role change or removal didn't reach a canvas that was already open.

## Decision

**A canvas link per project.**
- Each project gets one system-managed share link with `purpose: "canvas"`, made the
  first time someone opens the canvas. A unique partial index keeps it to one.
- It is proxy mode, with no passcode, expiry or name prompt.
- It is never listed with the client links, and it can't be revoked through the API.
- Links without `purpose` (every earlier link) are client links and behave as before.

**Canvas sessions are issued to members only.**
- `POST /projects/{id}/canvas-session` needs `project:view`.
- It returns the canvas link's token and preview origin, plus a guest token whose new
  `member_user_id` claim names the signed-in member.
- One guest session per member per link is reused across visits. It carries the
  member's name, so canvas comments read as before.
- `POST /guest-sessions` refuses a canvas link outright. Holding the token, whether it
  was copied from the iframe, the page source or the address bar, grants nothing.
- The review entry page and the widget say so (`canvas_only` on the resolve response)
  instead of asking for a name.

**The API checks the member's live role.** Whenever a guest token carries
`member_user_id`, or the link is a canvas link:
- `core/actor_access.py` looks up the member's current membership and checks their
  project role for the requested action, the same way a member request is checked.
- Every guest-capable path goes through it:
  - comments: list, create, reply, edit and delete own;
  - uploads and attachments;
  - page registration and snapshots;
  - the guest board.
- The realtime socket checks it on connect.
- So a viewer can read but never post. A demotion or removal takes effect on the next
  call. A canvas-link session with no member claim is refused.

**Client links are for those who may comment.** Listing a project's links needs the new
`share_link:view` action, at commenter or above. Viewers no longer receive any link, and
"Open review" is hidden for them. Creating and revoking links stays with editors.

**Signed-in sessions go to the canvas link.** Session sync (TDR-0041) and cloud login
(TDR-0042) carry a site's login into the canvas. They now always target the canvas link
rather than the newest client link, and no longer need a client proxy link to exist.

**Older clients keep working.**
- The widget asks the dashboard for its canvas session first. If no dashboard answers
  within three seconds, it falls back to the earlier guest flow.
- An older dashboard therefore still works with client links.
- An older widget on the new canvas link stops at the refused guest session instead of
  commenting.

## Consequences

- The canvas no longer depends on a client review link existing. Its "no active review
  link" empty states are gone.
- Canvas comments are still guest comments in the client layer, as before. Their guest
  session now records the member, which a later change could use to attribute them to
  the member.
- No migration is needed. New indexes are added to `ORG_ACCESS_INDEXES`:
  - `share_links_one_canvas_link`, unique and partial on `purpose: "canvas"`;
  - `guest_sessions_canvas_member`.
- A client link is still a credential for whoever holds it. That is the point of a client
  link, and it is now only handed to people who may comment anyway.
