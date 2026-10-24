# TDR-0155: Attach projects to clients, open-ticket links, extension setup actions

Date: 2026-10-24. Source: product walk-through.

## Decisions

- **Clients → Add existing projects.** A client's options (and "+ Add projects" when it
  has none) open a checklist of active projects; chosen ones move under the client via
  the existing versioned `PATCH /projects/{id}` (`client_id`), one request per project
  with per-project errors. Previously a client could only get new projects.
- **"N open" links filter to open tickets.** Project cards/table link to
  `tickets?project_id=…&open=1`; the Tickets page maps `open=1` to the API's existing
  `open_only` and shows a clearable "Open only" chip. The count and the list now agree.
- **Extension setup dialogs lead with the download.** When the extension isn't
  installed (or is outdated) the primary action is "Download extension/update"; reloading
  is the secondary "Installed? Reload Backline". "Reload Backline" stays primary only
  when an installed extension needs the tab reconnected.
- Toasts sit below the top bar, so they no longer cover New project or the account menu.

## Verification

Workspace lint/typecheck/build. Chromium: added two projects to a new client; card
"open" link opened the Tickets page with project + "Open only" filters.
