# TDR-0235: Integrations, AI and deploy-sync audit fixes

Date: 2026-11-07. Source: audit of integrations, MCP, AI and deploy sync (12 findings,
each checked in code).

## Security
- **Trello credentials in error messages.** Trello's key and token were query
  parameters, and error text included `str(HTTPStatusError)`, which quotes the full URL.
  A failed "Send to Trello" showed them to members and to MCP agents. Trello now gets an
  `Authorization: OAuth oauth_consumer_key=…, oauth_token=…` header, and
  `http_error_detail` reports status, reason and a scrubbed body only - never a URL;
  connection errors say only whether the service couldn't be reached or timed out.

## Trackers
- **No duplicates after reconnecting.** A ticket already filed through any connection
  of the same tracker type is returned as filed instead of filing again. Filed issues
  show in the ticket dialog and drawer whatever is connected now.
- **Destination pickers read every page** (Jira `startAt`, GitHub/GitLab `page`, Asana
  `offset`; capped at ~1,000), so projects past the first 100 can be chosen and saved.
- **Rejected screenshot uploads** (403/413) now fail the send (and remove the half-made
  issue) instead of filing it without the screenshot.

## AI
- One key serves up to 4 requests at once (`REQUESTS_PER_KEY`), so a single-key
  deployment isn't limited to one AI request across all workspaces; Groq 429s still
  cool the pool, and a 401/403 cools that key. A Groq 5xx is retried once even with one
  key and is then reported as an AI error, not "busy".
- BugHunt is shown as unavailable to viewers/commenters (it sets priorities); permission
  messages from AI calls are passed through.

## Smaller
- Deploy history says "Version delivery failed…" for failed deliveries (was "pending").
- The project's notification switch is for managers and shows errors; a provider with
  several connections shows the count and opens Integrations to manage them.
- Integrations copy: failed posts are retried for about an hour (it said 5 minutes).
- The MCP page lists `list_project_deployments`.

Not changed: Jira OAuth uses the first accessible site; credentials are updated by
reconnecting (duplicates and lost links, the harmful part, are fixed above).
