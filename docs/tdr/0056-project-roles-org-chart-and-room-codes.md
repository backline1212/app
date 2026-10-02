# TDR-0056: Project roles, org chart and room codes

Date: 2026-10-02
Status: Implemented; verified by backend suite, scratch RBAC checks, lint/typecheck/build and a browser pass.
Supersedes the project-access part of TDR-0054 (`assigned_member_ids`).

## Context

`feature/room-code-org-chart` (TDR-0054) added room codes, a basic org chart and an
`assigned_member_ids` list on projects. A review found:

- **Enforcement gaps.** Only the project endpoints filtered by `assigned_member_ids`;
  comments, tickets, search, activity, dashboard counts, MCP, the email digest and
  realtime events still exposed every project to every member.
- **ID mismatch.** The project form stored membership ids, but the backend compared
  user ids, so assigned members never saw their projects.
- **Lock-out of legacy data.** Projects without the field became invisible to members.
- **Joining.** Instant join skipped the plan's seat limit. Codes were free text,
  case-sensitive, not unique at the database level and not rate-limited.
- **Org chart.** Three static rows of cards (owner, admins, members), with no
  reporting lines. Inline styles throughout.

## Decisions

**Project roles.** Four roles, each including the ones before it: viewer, commenter,
editor and manager. `PROJECT_PERMISSIONS` in `core/permissions.py` gives the minimum role
for each action.
- Viewers read everything, including team comments.
- Commenters also comment, reply and use AI assist.
- Editors also triage tickets, manage pages, share links and integrations, and export.
- Managers also edit settings, archive, and manage access.

Workspace owners and admins manage every project.

**Project access.** Each project has an `access` block: `visibility` (`workspace` or
`private`), `default_role`, and `members[{user_id, role}]`.
- An explicit member entry wins.
- A workspace project gives every other member its `default_role`.
- A private project gives everyone else no access, and reads as 404.

**Legacy projects.** A project with no `access` block reads as open to the workspace:
its creator is a manager and everyone else an editor. No migration is needed. The first
access change writes that implied block down, so the creator keeps manager.

**One chokepoint.**
- `require_project_permission(action)` checks every project, page, comment and share-link
  id in a route's path.
- Member-or-guest paths go through `resolve_actor_project_access(..., action)`.
- Workspace-wide reads (tickets, summary, search, activity, clients, MCP, digest)
  exclude `hidden_project_ids`.
- Realtime events are filtered per member connection (`MemberEventFilter`).
- Notifications are never created for someone who can't open the project.

**Share links.** Viewers can list a project's links, because the review canvas loads the
site through the active proxy link. Creating and revoking links stays with editors.
*Superseded by TDR-0057:* the canvas now has its own link, and listing client links needs
commenter or above.

**Viewer canvas.** The canvas widget always runs as a guest of the review link, so the API
can't tell a viewer apart from a client there. Instead, the widget has a `view` mode: pins
and their cards work, but nothing opens a composer or the region drawer.
- For a viewer, the dashboard loads and keeps the canvas in that mode: "View comments"
  replaces Comment and Draw, and the dock tools, shortcuts and `?mode=draw` follow.
- Browser review is hidden, since its member session would be refused anyway.
- The canvas status menu goes through the dashboard with the member's own session, so it
  follows `comment:update_status` (editor).

**Org chart.**
- Memberships gain `title`, `team` and `manager_user_id`.
- Members edit their own title and team; owners and admins edit anyone's and set
  reporting lines. Loops are refused.
- When someone leaves, their reports move up to that person's own manager.
- Anyone without a line is drawn under the owner with a dashed connector.

**Joining.**
- Codes are generated (`XXXX-XXXX-XXXX`, no ambiguous characters) or custom
  (6–32 characters), matched case- and space-insensitively, and unique by index.
- Lookups and joins are rate-limited per user and per IP.
- A preview shows which workspace a code opens before anyone joins.
- Instant join respects the seat limit, and admins are notified.
- Requests can carry a note, can be withdrawn, and one is allowed per person at a time.
- After a decline there is a 24-hour cooldown.
- Approval picks a role and emails the person.
- Only owners and admins see the code.

**Also added.** Leave workspace, transfer ownership, "Members can create projects"
setting, and an access matrix endpoint.

## Consequences

- New indexes are in `ORG_ACCESS_INDEXES`. The two unique ones log, instead of failing
  startup, if existing rows collide.
- `scripts/migrate_org_access.py` runs as a dry run by default. It backfills
  `project_id` on old comment events, normalizes branch-era room codes and drops
  `assigned_member_ids`.
- Known limit, closed by TDR-0057: a viewer could copy the review link out of the canvas
  and comment as a guest. The canvas now loads through its own link, whose sessions are
  bound to the member and checked against their project role.
