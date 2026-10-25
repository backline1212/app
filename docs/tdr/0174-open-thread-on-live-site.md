# TDR-0174: Open the selected thread on the live site

Date: 2026-10-25. Source: FLOW-05 (pending backlog 2026-10-24, "Open on site with
route/ticket/anchor continuity after login").

## Decisions

- When a thread is selected in a website project's review (from the Comments panel,
  a pin, or a `?thread=`/`?comment=` link such as the ticket's "Open in review"),
  "Open with extension" sends its id as `focusCommentId` with the launch, if the
  thread belongs to the page being opened.
- The extension keeps `{commentId, url}` with that tab's review. When the tab shows
  that page (same origin and path, plus a `#/` route), it switches the toolbar to
  Comment, scrolls to the comment's element and opens its card, then clears the
  request. A sign-in redirect first leaves it waiting for the right page.
- Clear outcomes instead of silence: comment not on this page (moved, resolved
  elsewhere or removed), element not shown right now (sign in or open the same
  state), or the account is read-only.
- Polish: resolving your own comment no longer shows "Your comment was updated:
  Resolved" to yourself.
- Extension 0.5.6 (supersedes 0.5.5).

## Verification

Workspace lint/typecheck/build. Chromium with the unpacked extension: a member opened
`/p/<project>?thread=<#17>` and chose Open with extension; the site tab showed the
toolbar in Comment mode with #17's card open; reloading did not reopen it.
