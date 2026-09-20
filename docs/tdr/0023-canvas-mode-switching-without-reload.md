# TDR-0023: Canvas mode switches over postMessage, not a reload

Date: 2026-09-20
Status: Accepted

## Context

The review canvas passes its mode to the widget as a `blMode` query parameter on the
proxy URL. Because that parameter was part of the iframe's `src`, every
Comment/Browse/Draw switch changed the URL and reloaded the proxied site: the page
re-fetched through the proxy, and the widget was torn down and rebuilt. Everything the
reviewer had in the frame went with it - rendered pins, an open thread, an unsent
composer, and the scroll position - and the site visibly flashed on each toggle.

The widget's own comment said there was "no other channel to reach into an
already-loaded proxied page's widget instance". That is no longer true: the widget
already talks to the dashboard both ways (`backline:page-registered`,
`backline:comment-opened`, `backline:scroll-to-comment`, the display-name request).

## Decision

`blMode` now means "the mode this page was loaded with", nothing more. The dashboard
pins it to the canvas URL it last built and rebuilds that URL only when the target
itself changes - a different page, a different `blBrowser`, or an explicit reload. A
mode switch is sent into the running widget as `{ type: "backline:set-mode", mode }`,
addressed to the API origin the canvas is served from.

The widget registers that listener synchronously at the top of `init()`, before any
await, and records the mode until its own wiring exists. `init()` is asynchronous, so a
mode can legitimately arrive mid-init; the wiring then applies whichever mode turned
out to be the latest. The mode is (re)sent by the dashboard whenever the canvas reports
`page-registered` - which covers a link the reviewer followed *inside* the canvas, a
navigation that carries no `blMode` of its own and previously dropped Browse mode back
to Comment - and whenever the mode changes while the frame is loaded.

Inside the widget, only what *accepts* a new comment is mode-dependent: the tooltip,
the region drawer (set up and torn down in place through the teardown
`setupRegionDrawer` already returned) and an early return in the document click
handler, which is now attached once regardless of mode. Existing pins, realtime
updates and scroll-to-comment stay wired in every mode, as before.

## Consequences

- Toggling modes keeps the page, its pins and an open composer exactly as they were.
  Reviewers can switch to Browse, interact with the site, and switch back to Comment
  without losing position or state.
- Guest reviewers are unaffected: their URLs never carried `blMode`, no dashboard
  parent ever posts to them, and the absent-parameter default is still Comment.
- The canvas URL can now show a `blMode` that is one or more switches behind what the
  widget is actually doing. The widget's live mode, not the URL, is authoritative.
- The dashboard's "loading" state is no longer keyed on the mode; with no reload to
  wait for, entering it on a switch would have left a spinner with no load event to
  clear it.
