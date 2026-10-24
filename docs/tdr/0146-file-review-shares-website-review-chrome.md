# TDR-0146: Image and PDF review shares the website review workspace

Date: 2026-10-24. Scope: web app file review (`features/assets/AssetReview.tsx`).

## Decision

Image and PDF projects used a separate, plainer screen: a select for files, unicode
zoom buttons, a fixed comments column with a status label only, and no way for the
team to triage (status, assignee, priority, due date) without leaving for Tickets.
Website projects already had a richer workspace. File review now reuses that
workspace instead of keeping a second design:

- Same header (back, title + type pill, View/Comment switch, download, Share, theme,
  project menu), page bar (one tab per file + Manage files), dotted canvas stage and
  footer status bar (zoom, rotate, PDF pager, status text, comment counts).
- Team members get the website's `ProjectSidePanel` (Details, Comments, MCP,
  Integrations). The AI tab is website-only and is hidden for file projects. Guests
  get a built-in comments drawer using the same drawer/rail styling.
- New comments open a floating composer next to the pin, like the website widget's
  card, with tags, visibility, Ctrl/⌘+Enter and Esc.
- Pins are numbered with the ticket number (`ticketRef`) so canvas, panel and board
  agree, and styled like the widget's pins.
- The selected thread uses the `thread` URL parameter (the panel's), still accepting
  the legacy `comment` parameter on entry.
- Zoom/rotation keep CSS transforms but the sheet sits in a frame sized to the
  transformed footprint so a zoomed or turned file scrolls to every edge.

No API, schema or stored data changes.

## Acceptance and verification

Typecheck, lint and production build for `@backline/web`. Exercised in Chromium
against a local Mongo/Redis/S3 stack: member image and PDF review (pin, area, post,
panel detail, zoom, rotate, page change, dark mode), guest review via a share link
(comment list, thread, reply, phone width), website project page unchanged. No test
suite is added under AGENTS.md.
