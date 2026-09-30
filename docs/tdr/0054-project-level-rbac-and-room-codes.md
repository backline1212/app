# TDR 0054: Project-Level RBAC and Room Code Invitations

## Context
The user requested an organizational management feature that includes a visual "Org Chart", Role-Based Access Controls (RBAC) at the project level, and a "room code" invite system (similar to a game lobby) to easily onboard users. 

Historically, Backline was designed with Workspace-wide access (all members of a Workspace could see and access all projects within that Workspace, as defined in `05-Frontend-Architecture.md` and `13-Authentication.md`). 

To support the requested "game-like" room code invite system and per-project access, we are introducing an architectural shift to support Project-Level Role-Based Access Control (RBAC).

## Decisions

### 1. Room Code Invitations
Instead of relying solely on email invitations (`/api/v1/workspaces/{id}/members/invite`), we will introduce a **Room Code** system. 
- A Workspace Admin can generate a unique `room_code` for the workspace.
- Users can visit a join page (e.g. `/join`) and enter the room code or request access by username.
- If the room code is configured for "Instant Join", the user is instantly added to the workspace.
- If configured for "Approval Required", the user is placed in a `pending_members` list, and an Admin must approve the request from the Members page.

### 2. Project-Level RBAC
We are shifting from Workspace-wide visibility to a hybrid model:
- **Workspace Roles**: `owner`, `admin`, `member` (remains unchanged). Owners and Admins retain visibility over all projects in the workspace.
- **Project Memberships**: We introduce a `project_members` collection (or an array of `member_ids` on the `projects` document).
- Standard Workspace `member`s will **only** see projects they are explicitly added to.
- The `GET /workspaces/{id}/projects` endpoint will be filtered for `member` roles to only return assigned projects.

### 3. Org Chart View
The `MembersPage.tsx` will be enhanced to include an "Org Chart" visual layout in addition to the standard list/table view. The Org Chart will display the hierarchy (Owners at the top, Admins, and Members assigned to various projects) using existing components or a lightweight visualization library (like React Flow or a custom SVG/CSS tree).

## Consequences
- **Backend Changes**: 
  - Update `projects` schema to include `assigned_member_ids`.
  - Update the projects repository to filter by `member_id` when the caller's role is `member`.
  - Add routes for generating/managing Room Codes (`/api/v1/workspaces/{id}/room-code`).
  - Add routes for joining via Room Code and approving requests.
- **Frontend Changes**:
  - Add a `/join` route.
  - Update `MembersPage.tsx` with a new "Org Chart" tab.
  - Update `MembersPage.tsx` to include an "Inbox" or "Pending Requests" tab for room code approvals.
  - Update project creation/settings UI to allow Admins to select which members have access to the project.
- **Migration**: Existing workspaces will have all their existing members added to all existing projects to maintain backward compatibility (dry-run first migration script required).

## Next Steps
1. Create the backend MongoDB migration script and Pydantic models for `Project` assignments and `JoinRequests`.
2. Implement the backend API endpoints in `modules/workspaces` and `modules/projects`.
3. Implement the frontend `Org Chart` and `Join` UI.
