# TDR-0154: Activity context and navigation names

Date: 2026-10-24. Source: product walk-through of Activity and the sidebar.

## Decisions

- **Activity says who, what and where.** `ActivityOut` gains `actor_name` (the name a
  client gave on the review link) and `is_reply`; reply events are labelled with their
  thread's ticket number and text. Every event resolves its project, including older
  review-link opens that stored only a share link (new ones also store `project_id`),
  so the row reads "Sam (Client) opened the review link in Acme dashboard". The project
  resolution is also what hides events from projects the reader can't open.
- **"Clients" filter** now shows what clients did on review links as well as client
  record changes (previously only the latter, so it was usually empty).
- Back-to-back identical events (same person, type and project, no ticket) collapse
  into one row with a count.
- **Names match their pages.** Sidebar "Members" → "Team" (the page's title),
  "Extensions" → "Browser extension"; page titles use sentence case ("MCP server",
  "AI usage"). AI usage is reached from the AI page (sidebar keeps "AI" highlighted)
  instead of being a second sidebar entry. AI help text points at the shared ticket view.

## Verification

Workspace lint/typecheck/build, backend ruff/mypy/scoping. Chromium: Activity shows
client names, "replied on", project names; Clients tab lists client actions.
