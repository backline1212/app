# TDR-0022: Full-width review preview and a draggable width handle

Date: 2026-09-20
Status: Accepted

## Context

The project review canvas capped its responsive preview at `min(1180px, 100%)` and
centred it inside a stage padded `20px` left and `76px` right. On a normal desktop
display the reviewed site therefore sat as a narrow column in the middle of the page
with large empty gutters, and the comments drawer - which floats over the canvas rather
than sitting beside it - covered part of that already-narrow frame.

Reviewers also had no way to check a site at an arbitrary width. `ViewportMenu` offers
device presets and a numeric custom size, but nothing equivalent to the drag handle
Chrome DevTools puts on the edge of its device viewport.

## Decision

**The stage is the preview container.** The responsive frame ("Fit canvas") is
`width:100%` of that container, and the container carries a single `40px` gutter on each
side. The right gutter additionally reserves the side-panel rail, and - via
`.bl-review-main:has(.bl-review-drawer)` - the open drawer, so a full-width preview and
the handle on its right edge always stop short of the panel instead of disappearing
underneath it. Opening or closing the drawer therefore reflows the previewed page;
widget pins are anchored by selector and tracked per frame, so they follow the reflow.

**Width is draggable, DevTools-style.** A handle on the right edge of the frame sets an
explicit width. The frame stays centred, so the pointer delta is doubled and the edge
the reviewer grabbed stays under the pointer. Releasing within 24px of the container
edge - or a double-click, or `Home` - drops the explicit width and returns the frame to
filling the container. The floor is 280px, matching the custom-size floor
`ViewportMenu` already enforces.

**The handle belongs to responsive mode only.** With a device preset selected the
viewport owns both of its dimensions (and `orientation` swaps them), exactly as in
DevTools device mode, so the handle is not rendered and the size continues to come from
`ViewportMenu`. Choosing any viewport, including "Fit canvas", clears a width left
behind by an earlier drag rather than silently restoring it.

**The width is URL-owned.** It persists as `?stageWidth=<px>` alongside the existing
`viewport`, `orientation` and `zoom` parameters, so a shared or reloaded review link
reopens at the same width. It is written once per drag, on release; the in-flight width
is component state. `stageWidth` is ignored whenever a `viewport` preset is present.

## Consequences

- The preview fills the available width by default, which is a visible change for every
  existing review URL. No stored record changes: `stageWidth` is a view parameter only.
- Below the 760px breakpoint the gutter drops to 12px, the rail becomes a bottom bar,
  and the handle is hidden - touch users size the frame from `ViewportMenu`.
- The render-snapshot (cross-browser) stage is unaffected: it is always a fixed-size
  screenshot and has no responsive frame to drag.
- Zoom is applied to the frame as CSS `zoom`, so pointer travel is divided by the zoom
  factor before it becomes a width, and the maximum width is the container's inner
  width divided by the same factor.
