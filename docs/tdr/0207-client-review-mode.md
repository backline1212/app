# TDR-0207: The team decides how clients open a website review

Date: 2026-10-27. Source: client walkthrough of a review link.

## Finding

After joining, every client was asked "Does this website ask you to sign in?" before
seeing the site, with "Leave review" as the only button until they answered. The team
knows whether its staging site needs a sign-in or blocks previews; the client usually
doesn't, and a wrong answer sent them to install an extension they didn't need.

## Decisions

- New project setting `client_review_mode`: `preview` (open in Backline's preview),
  `extension` (review the real site with the extension) or `ask` (the old question).
  Additive: missing means `ask`, so existing projects behave as before.
- The new-project form shows "How clients open it" under the review URL and prefills it
  from the URL check (TDR-0206): loads → preview; sign-in or bot protection → extension;
  otherwise ask. The edit form keeps the saved choice. Duplicated projects copy it.
- The review entry page skips the question unless the mode is `ask`: preview shows one
  "Open website review" button (with the extension as a fallback under "Page doesn't load
  or asks for sign-in?"); extension shows the extension button plus "Can't install
  extensions? Open the preview instead".
- The website comment composer no longer preselects "Bug": copy and design notes were
  filed as bugs. Tags are optional; clicking the selected tag clears it. The post button
  no longer wraps.
- The canvas page tabs refresh when the preview registers a page they don't know yet
  (it used to say "No saved pages yet" next to the page being reviewed).
