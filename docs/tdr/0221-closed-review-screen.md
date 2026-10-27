# TDR-0221: Links to archived projects say the review is closed

Date: 2026-10-27. Source: product walkthrough of a client opening a link after the team
archived the project.

## Finding

A client opening a still-valid review link for an archived project saw "Could not join -
Project not found." with "Try again" and the advice to ask for a new link. It read as a
broken link, and neither retrying nor a new link helps while the project is archived.

## Decision

- Resolving the link, joining it, and guest requests in an open session now answer
  "This review is closed - the team archived the project. Ask them if you still need to
  leave feedback." with `details.reason = "project_archived"` (same status codes as
  before, so nothing else about the guest contract changes).
- The review page shows "This review is closed" with that explanation and no retry
  button or new-link hint. Restoring the project reopens the same link.
- A missing project still answers "Project not found."
