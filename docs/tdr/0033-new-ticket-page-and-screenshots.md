# TDR-0033: New tickets can name a page and carry screenshots

Date: 2026-09-26
Status: Accepted

## Context

The design's New ticket dialog (`design/index.html`, `openNewTicket()`) asks for a
"Page or file" and lets the author attach screenshots. `TicketCreate` had neither: every
team ticket was filed under the project's hidden `backline://projects/<id>/tickets`
page, and the dialog showed a "coming soon" note in place of screenshots.

## Decision

`TicketCreate` gains two optional, additive fields:

- **`page_id`**: the page or file the ticket is about. It must belong to the same
  workspace and project, otherwise the request fails validation. The ticket is still
  `is_standalone` (no anchor, not on the canvas). It is only *filed* under that page, as
  in the design's "pin it on a page later". Omitted, the ticket uses the hidden project
  page as before.
- **`attachments`**: up to 10 `AttachmentIn` records uploaded beforehand through
  `POST /uploads`. Each key must start with `uploads/<workspace_id>/<project_id>/`, so a
  ticket cannot reference another project's objects.

`TicketOut.page_path` is `None` for the hidden standalone page, so it no longer leaks the
synthetic `backline://` path into the list's subtitle.

The dialog follows the design's one-assignee/one-tag form. It sends `assignee_ids: [id]`
and `tags: [tag]`, and more can still be added from the ticket detail.

## Consequences

Legacy tickets and clients that omit the new fields behave exactly as before. No
migration is needed.
