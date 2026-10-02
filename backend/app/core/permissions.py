from collections.abc import Callable, Coroutine
from enum import StrEnum
from typing import Any

from fastapi import Depends, Request

from app.core.errors import PermissionDeniedError
from app.core.session import Session, get_current_session


class Role(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    GUEST = "guest"


# Single source of truth for the permission matrix (13-Authentication.md §13.5).
# Every endpoint checks against this dict via require_permission() - never a
# hand-duplicated if-role-in(...) check in a router (Rule 3).
PERMISSIONS: dict[str, frozenset[Role]] = {
    "workspace:view_settings": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "workspace:manage_billing": frozenset({Role.OWNER}),
    "workspace:update_settings": frozenset({Role.OWNER, Role.ADMIN}),
    "member:invite": frozenset({Role.OWNER, Role.ADMIN}),
    "member:remove": frozenset({Role.OWNER, Role.ADMIN}),
    "member:role_change": frozenset({Role.OWNER, Role.ADMIN}),
    "project:manage": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "project:hard_delete": frozenset({Role.OWNER, Role.ADMIN}),
    "share_link:manage": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "integration:manage": frozenset({Role.OWNER, Role.ADMIN}),
    "comment:view_client": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER, Role.GUEST}),
    "comment:view_team": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "comment:toggle_layer": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "comment:update_status": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    # Dashboard moderation - any comment in the caller's own workspace, regardless of
    # authorship (same "member can moderate any comment" trust level update_status
    # already grants). Distinct from the widget's own-author-only guest self-service
    # delete (comments/service.py's _require_own_comment), which isn't gated by role.
    "comment:delete": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "comment:create": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER, Role.GUEST}),
    "comment:reply": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER, Role.GUEST}),
    "comment:reanchor": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    # 17.3/17.4: "Create task from comment" / "create card from comment" - member
    # (owner/admin/member), not guest - matches every other comment-mutating action.
    "comment:create_integration_task": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "notification:manage": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    # TDR-0056 project-level actions. Every workspace role may attempt them; whether a
    # member actually may is decided per project by PROJECT_PERMISSIONS below.
    "project:view": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "project:update": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "project:manage_access": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "project:export": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "project:duplicate": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "project:review_tools": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "project:render": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "page:manage": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "asset:upload": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "ai:assist": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    # A member's profile (title, team) is theirs to edit; reporting lines are not.
    "member:edit_profile": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    # The owner can ask too; the service tells them to hand ownership over first.
    "workspace:leave": frozenset({Role.OWNER, Role.ADMIN, Role.MEMBER}),
    "workspace:transfer_ownership": frozenset({Role.OWNER}),
}


def role_allows(action: str, role: Role) -> bool:
    return role in PERMISSIONS[action]


class ProjectRole(StrEnum):
    """A person's role on one project (TDR-0056). Ordered: each role can do everything
    the roles before it can."""

    VIEWER = "viewer"
    COMMENTER = "commenter"
    EDITOR = "editor"
    MANAGER = "manager"


PROJECT_ROLE_RANK: dict[ProjectRole, int] = {
    ProjectRole.VIEWER: 1,
    ProjectRole.COMMENTER: 2,
    ProjectRole.EDITOR: 3,
    ProjectRole.MANAGER: 4,
}

# The project-level half of the matrix (13-Authentication.md §13.5a): the lowest project
# role that may perform each action on a project. Workspace owners and admins are
# managers of every project, so this only ever narrows what a workspace *member* can do.
# An action missing from this dict is workspace-level only and never project-checked.
PROJECT_PERMISSIONS: dict[str, ProjectRole] = {
    "project:view": ProjectRole.VIEWER,
    "comment:view_team": ProjectRole.VIEWER,
    "comment:create": ProjectRole.COMMENTER,
    "comment:reply": ProjectRole.COMMENTER,
    "ai:assist": ProjectRole.COMMENTER,
    "project:render": ProjectRole.COMMENTER,
    "comment:update_status": ProjectRole.EDITOR,
    "comment:toggle_layer": ProjectRole.EDITOR,
    "comment:reanchor": ProjectRole.EDITOR,
    "comment:delete": ProjectRole.EDITOR,
    "comment:create_integration_task": ProjectRole.EDITOR,
    "page:manage": ProjectRole.EDITOR,
    "asset:upload": ProjectRole.EDITOR,
    "share_link:manage": ProjectRole.EDITOR,
    "project:export": ProjectRole.EDITOR,
    "project:duplicate": ProjectRole.EDITOR,
    "project:review_tools": ProjectRole.EDITOR,
    "project:update": ProjectRole.MANAGER,
    "project:manage_access": ProjectRole.MANAGER,
    "project:manage": ProjectRole.MANAGER,
}


def project_role_allows(action: str, role: ProjectRole | None) -> bool:
    """False for no role at all. True for actions that aren't project-scoped."""
    if role is None:
        return False
    required = PROJECT_PERMISSIONS.get(action)
    return required is None or PROJECT_ROLE_RANK[role] >= PROJECT_ROLE_RANK[required]


def require_permission(action: str) -> Callable[..., Coroutine[Any, Any, Session]]:
    """FastAPI dependency factory. Requires a workspace-scoped session (role set via
    POST /auth/switch-workspace, 13-Authentication.md §13.3) whose role is permitted
    for `action` per the PERMISSIONS matrix above."""

    async def dependency(session: Session = Depends(get_current_session)) -> Session:
        if session.role is None:
            raise PermissionDeniedError("No active workspace context.")
        if not role_allows(action, Role(session.role)):
            raise PermissionDeniedError(f"Role '{session.role}' cannot perform '{action}'.")
        return session

    return dependency


def require_project_permission(action: str) -> Callable[..., Coroutine[Any, Any, Session]]:
    """require_permission(action) plus the project half of the matrix: every project,
    page, comment or share link named in the route's path must be one the caller's
    project role allows `action` on (core/project_access.py). Use it on every route
    whose path names a project-scoped resource."""
    workspace_check = require_permission(action)

    async def dependency(request: Request, session: Session = Depends(workspace_check)) -> Session:
        from app.core.db import get_db
        from app.core.project_access import enforce_path_project_access

        await enforce_path_project_access(get_db(), session, request.path_params, action)
        return session

    return dependency
