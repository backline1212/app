# TDR-0186: Move a website comment's pin from the dashboard

Date: 2026-10-25. Source: FLOW-05 / BUG-10 (pending backlog 2026-10-24, "authorized
manual reanchor") - after a redesign a pin can lose its element (orphaned or low
confidence). `PATCH /comments/{id}/reanchor` existed, but nothing in the product
called it, so a team could only delete and recreate the comment.

## Decisions

- The comment detail on a website project shows **Move pin** (labelled **Re-pin** when
  the pin is orphaned or low-confidence) to editors and managers, for top-level point
  comments. Region and file comments keep their own controls; team-only comments are
  not drawn in the client-view canvas, so the action explains that instead.
- Choosing it takes the canvas to the comment's page if needed, then asks the canvas
  widget (`backline:pick-anchor`) for one click. A banner says what to do; Esc or Cancel
  stops. The widget listens in the window capture phase, so the pick never also starts
  a new comment, and it only answers its own parent frame.
- The widget computes the anchor exactly as for a new comment and posts it back
  (`backline:anchor-picked`); the dashboard saves it with the member's own session
  (`comment:reanchor` permission), which resets recovery to OK and records
  `anchor.manually_reassigned` activity, then tells the widget to redraw the pin.
- No new API. The extension is unaffected (it does not load the SDK entry point).

## Verification

Workspace lint/typecheck/build. Chromium: opened #17 in the dashboard, chose Move pin,
clicked the page heading in the canvas: "Pin for #17 moved", the pin redrew on the
heading, no composer opened, the stored anchor now targets `h1`, recovery status ok,
and the activity event was recorded.
