# TDR-0226: Boards show when columns are off-screen

Date: 2026-11-01. Source: screen review at 1366px.

On a laptop the six-column ticket board and project board scroll sideways, and the last
column ("Won't fix", sometimes "Resolved") sat past the edge with nothing showing it was
there. A shared `HScroll` wrapper fades the edge that has more columns and shows a round
chevron button that scrolls most of a screen over (smooth unless reduced motion is set).
Buttons are hidden on touch screens, where swiping is natural; the scroller is a labelled,
focusable region for keyboard users.
