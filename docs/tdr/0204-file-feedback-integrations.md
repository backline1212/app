# TDR-0204: File comments and standalone tickets reach integrations

Date: 2026-10-27. Source: backend audit (finding 10).

## Findings

Comments on images/PDFs/mobile screens and tickets created from the board were written
directly to the comments collection, skipping the transactional path page comments use.
Slack, Teams, Discord and webhook connections never heard about them, and the file's
page wasn't marked referenced, so it could be deleted while a comment was being made.

## Decisions

- Both now use `_create_with_integration_intent`: the comment, its `comment.created`
  event and the pending integration deliveries are written in one transaction; the
  minute sweep delivers them. Project scope and the project's notification switch apply
  as for page comments. A retried create (same `client_request_id`) returns the stored
  comment without new deliveries.
- `.env.example` lists the public URL, CORS, email, quota and preview-domain variables;
  the unused `VITE_WS_BASE_URL` and `VITE_GOOGLE_OAUTH_CLIENT_ID` are removed from it and
  from DEPLOYMENT.md.
