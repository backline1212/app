# TDR-0163: Notification context; tracker filing in the ticket view

Date: 2026-10-25. Source: production-readiness UI sweep.

## Decisions

- **Notifications say what they're about.** `NotificationOut` gains `ticket_number`,
  `ticket_excerpt` and `project_name` (additive), resolved when the list is read so
  existing notifications get them too; a mention on a reply is labelled with its
  thread. The bell shows "#12 “Upgrade button does nothing” · Acme dashboard" under
  "Sam replied to a ticket". Wording says "ticket" and uses status labels.
- **Send to tracker in the shared ticket view.** The board/Tickets dialog lists
  connected trackers: "Send to Jira" for editors, or the filed issue ("Jira ABC-12 ↗")
  once sent - the same API and permission as the review side panel.
- Broken logo previews in branding settings are hidden.

The project Board page keeps its standalone layout (ProjectLayout, by design).

## Verification

Workspace lint/typecheck/build; backend ruff/format/mypy/scoping. Chromium: the bell
shows ticket number, text and project for reply notifications; dark mode checked across
dashboard, tickets, review, PDF, settings, team, board and the ticket dialog.
