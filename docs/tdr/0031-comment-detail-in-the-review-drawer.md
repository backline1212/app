# TDR-0031: A comment's detail opens in the review drawer, not a modal

Date: 2026-09-22
Status: Accepted

## Context

The project review drawer's Comments tab listed comment rows, and the only way into a
thread was the row's reply count, which opened `CommentThreadPanel` in a `<Dialog>` -
a modal over the whole page, covering the canvas the comment is about. Clicking the row
itself only scrolled the canvas to the pin. The design (`design/index.html`'s
`detailFor()`) has no modal: the drawer swaps its list for the comment's own detail,
with an "All comments" back link, the workflow fields, the thread and a reply box.

## Decision

Clicking a comment row opens that comment's detail *in the drawer* and takes the canvas
to its pin - the two halves of "show me this comment". The detail is
`CommentDetail.tsx`, rendered in place of the list, and the modal thread panel is no
longer used from the drawer (the ticket board still uses it).

It keeps the URL-owned `?thread=<id>` the modal already used, so a link to a comment
still opens it, and it follows a pin clicked in the canvas: with a detail open, that
selection swaps the detail rather than leaving another comment's on screen.

Layout: head, fields and the reply box are fixed, and only the thread scrolls - the
design's own arrangement. Below 760px the drawer is a short bottom sheet, where
splitting a small height between two scrollers reads worse than one, so the whole
detail scrolls as one there instead.

Every field (status, waiting on, tags, assignees, due date, priority) goes through the
same `PATCH /comments/{id}` and cache merge the list rows and the board already use, so
no surface can drift from another. The pickers are the existing portaled popover
(`bl-comment-popover`) and `DatePicker`, which gained a `triggerClassName`/`children`
hook so its trigger can be the design's compact date chip. Escape inside a picker is
captured and stopped there, so it closes the picker and not the whole drawer.

Two design affordances sit above the reply box:

- **"Write a reply for me"** calls the existing `ai/suggest-reply` endpoint and puts
  the suggestion in the box.
- **"Turn into a dev task"** is *not* an AI call. It formats what the comment already
  recorded - page, element selector, browser/OS/viewport, tags, priority, reporter, the
  text and the replies - into a card the member can copy. There is no dev-task endpoint,
  and inventing one that pretends to be generated would be the fake-AI path
  02-Engineering-Principles.md rules out.

## Consequences

- Triage happens next to the canvas instead of on top of it: the pin, the page and the
  comment's fields are all visible at once.
- The drawer's reply box is image-only ("Attach a screenshot", per the design); the
  board's thread panel remains the place for other file types.
- `CommentThreadPanel` keeps its one remaining caller (BoardPage). Its "Summarize" and
  multi-suggestion controls are not in the design's drawer detail and are not
  duplicated here.
- A comment opened from a URL that names a *reply* id still renders that reply as the
  thread's head, exactly as the modal did.
