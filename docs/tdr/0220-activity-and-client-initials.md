# TDR-0220: Activity repeats collapse for clients; project rows name the project

Date: 2026-10-27. Source: product walkthrough of Clients and Activity.

## Findings

- A client who opened the review link several times showed one "opened the review link"
  row per visit. The repeat-collapsing compared actor ids, and each visit is a new guest
  session with its own id.
- Project events without a stored name (attaching a project to a client logs
  `project.updated` with only `client_id`) read "updated the project" with no project.
- The Clients list showed the first two letters of the name ("NO" for Northwind Traders)
  where everywhere else shows word initials.

## Decisions

- Guests are grouped by the name they gave; members by user id. Back-to-back repeats on
  the same project collapse into one row with a count, as before.
- `project.*` rows without a name show the project's current name.
- A shared `lib/initials.ts` (`nameInitials`) serves the Clients list and file review.
