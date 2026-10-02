"""Project-level access (TDR-0056, 13-Authentication.md §13.5a).

A workspace member's role on a project comes from the project's `access` block:

    access: {
        visibility: "workspace" | "private",
        default_role: "viewer" | "commenter" | "editor" | "manager",
        members: [{user_id, role, added_by, added_at}],
    }

- Workspace owners and admins are managers of every project.
- An explicit `members` entry wins over the default.
- A "workspace" project gives every other member `default_role`.
- A "private" project gives everyone else no access at all.

A project saved before TDR-0056 has no `access` block. It reads as a workspace project
where its creator is a manager and everyone else is an editor. That keeps every legacy
project as open as it was, without a migration.

Services and routers never compare roles themselves. They call the functions here, and
those read the PROJECT_PERMISSIONS matrix in core/permissions.py."""

from collections.abc import Mapping
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import NotFoundError, PermissionDeniedError
from app.core.permissions import (
    PROJECT_PERMISSIONS,
    ProjectRole,
    project_role_allows,
)
from app.core.session import Session

VISIBILITY_WORKSPACE = "workspace"
VISIBILITY_PRIVATE = "private"
LEGACY_DEFAULT_ROLE = ProjectRole.EDITOR
WORKSPACE_MANAGER_ROLES = frozenset({"owner", "admin"})


def _role(value: Any) -> ProjectRole | None:
    try:
        return ProjectRole(value)
    except ValueError:
        return None


def access_settings(project: Mapping[str, Any]) -> tuple[str, ProjectRole, list[dict[str, Any]]]:
    """(visibility, default_role, explicit members) with legacy defaults filled in.
    Unknown stored values fall back to the open defaults rather than raising, so one
    malformed row can't take a project list down."""
    access = project.get("access")
    if not isinstance(access, Mapping):
        return VISIBILITY_WORKSPACE, LEGACY_DEFAULT_ROLE, []
    visibility = access.get("visibility")
    if visibility not in (VISIBILITY_WORKSPACE, VISIBILITY_PRIVATE):
        visibility = VISIBILITY_WORKSPACE
    default_role = _role(access.get("default_role")) or LEGACY_DEFAULT_ROLE
    members = [
        member
        for member in access.get("members") or []
        if isinstance(member, Mapping) and member.get("user_id") and _role(member.get("role"))
    ]
    return visibility, default_role, [dict(member) for member in members]


def effective_project_role(
    project: Mapping[str, Any], *, user_id: str, workspace_role: str | None
) -> ProjectRole | None:
    if workspace_role in WORKSPACE_MANAGER_ROLES:
        return ProjectRole.MANAGER
    if workspace_role is None:
        return None
    if not isinstance(project.get("access"), Mapping):
        return ProjectRole.MANAGER if project.get("created_by") == user_id else LEGACY_DEFAULT_ROLE
    visibility, default_role, members = access_settings(project)
    for member in members:
        if member["user_id"] == user_id:
            return _role(member["role"])
    return default_role if visibility == VISIBILITY_WORKSPACE else None


def project_role_source(project: Mapping[str, Any], *, user_id: str, workspace_role: str) -> str:
    """Where someone's role on a project comes from, so the UI can explain it:
    "workspace_admin", "explicit", "creator" (legacy projects), "default" or "none"."""
    if workspace_role in WORKSPACE_MANAGER_ROLES:
        return "workspace_admin"
    if not isinstance(project.get("access"), Mapping):
        return "creator" if project.get("created_by") == user_id else "default"
    visibility, _, members = access_settings(project)
    if any(member["user_id"] == user_id for member in members):
        return "explicit"
    return "default" if visibility == VISIBILITY_WORKSPACE else "none"


def session_project_role(project: Mapping[str, Any], session: Session) -> ProjectRole | None:
    return effective_project_role(project, user_id=session.user_id, workspace_role=session.role)


def check_project_action(
    project: Mapping[str, Any],
    session: Session,
    action: str,
    *,
    not_found_message: str = "Project not found.",
) -> ProjectRole:
    """Raises NotFoundError when the caller has no access at all, so a private project
    is indistinguishable from a missing one. Raises PermissionDeniedError when they
    can see the project but their role is too low for `action`."""
    role = session_project_role(project, session)
    if role is None:
        raise NotFoundError(not_found_message)
    if not project_role_allows(action, role):
        required = PROJECT_PERMISSIONS[action]
        raise PermissionDeniedError(
            f"You're a {role.value} on this project. Ask a project manager for "
            f"{required.value} access to do this.",
            details={"project_role": role.value, "required_role": required.value},
        )
    return role


async def load_project_for(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    session: Session,
    project_id: str,
    action: str,
) -> dict[str, Any]:
    """The project doc, after checking it is in the session's workspace and the
    caller may perform `action` on it. For services reached outside the router
    dependency (MCP tools, the extension's resolve flow)."""
    from app.modules.projects.repository import ProjectRepository

    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != session.workspace_id:
        raise NotFoundError("Project not found.")
    check_project_action(project, session, action)
    return project


async def hidden_project_ids(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    user_id: str,
    workspace_role: str | None,
) -> list[str]:
    """Ids of the projects in this workspace the user cannot see. Empty for owners
    and admins. Workspace-wide listings (tickets, search, activity, digests) exclude
    these ids instead of re-deriving access per row."""
    if workspace_role in WORKSPACE_MANAGER_ROLES:
        return []
    from app.modules.projects.repository import ProjectRepository

    return await ProjectRepository(db).list_private_ids_hidden_from(workspace_id, user_id)


async def session_hidden_project_ids(
    db: AsyncIOMotorDatabase[dict[str, Any]], session: Session
) -> list[str]:
    if session.workspace_id is None:
        return []
    return await hidden_project_ids(
        db, workspace_id=session.workspace_id, user_id=session.user_id, workspace_role=session.role
    )


async def can_view_project(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    *,
    workspace_id: str,
    project_id: str,
    user_id: str,
    workspace_role: str | None = None,
) -> bool:
    """Whether a workspace member (looked up when `workspace_role` isn't given) can see
    a project. Used before handing someone a notification or an assignment that
    points into a project."""
    from app.modules.projects.repository import ProjectRepository
    from app.modules.workspaces.repository import MembershipRepository

    if workspace_role is None:
        membership = await MembershipRepository(db).find(workspace_id=workspace_id, user_id=user_id)
        if membership is None:
            return False
        workspace_role = membership["role"]
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        return False
    return (
        effective_project_role(project, user_id=user_id, workspace_role=workspace_role) is not None
    )


async def _project_for_path_param(
    db: AsyncIOMotorDatabase[dict[str, Any]], key: str, value: str, workspace_id: str
) -> dict[str, Any] | None:
    """The project a path parameter belongs to, or None when it can't be resolved in
    this workspace (the route's own service then answers with its usual 404)."""
    from app.modules.comments.repository import CommentRepository
    from app.modules.pages.repository import PageRepository
    from app.modules.projects.repository import ProjectRepository
    from app.modules.share_links.repository import ShareLinkRepository

    project_id: str | None = None
    if key == "project_id":
        project_id = value
    elif key == "page_id":
        page = await PageRepository(db).find_by_id(value)
        if page is not None and page["workspace_id"] == workspace_id:
            project_id = page["project_id"]
    elif key == "comment_id":
        comment = await CommentRepository(db).find_by_id(value)
        if comment is not None and comment["workspace_id"] == workspace_id:
            project_id = comment.get("project_id")
            if not project_id:
                page = await PageRepository(db).find_by_id(comment["page_id"])
                project_id = page["project_id"] if page is not None else None
    elif key == "share_link_id":
        link = await ShareLinkRepository(db).find_by_id(value)
        if link is not None and link["workspace_id"] == workspace_id:
            project_id = link["project_id"]
    if not project_id:
        return None
    project = await ProjectRepository(db).find_by_id(project_id)
    if project is None or project["workspace_id"] != workspace_id:
        return None
    return project


_PATH_RESOURCES: tuple[tuple[str, str], ...] = (
    ("project_id", "Project not found."),
    ("page_id", "Page not found."),
    ("comment_id", "Comment not found."),
    ("share_link_id", "Share link not found."),
)


async def enforce_path_project_access(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    session: Session,
    path_params: Mapping[str, Any],
    action: str,
) -> None:
    """Checks every project-scoped id in a route's path, not only the first one: the
    AI routes carry both a project_id and a comment_id, and only the comment_id is
    trusted by the service, so both have to pass."""
    workspace_id = session.workspace_id
    if workspace_id is None:
        raise PermissionDeniedError("No active workspace context.")
    checked: set[str] = set()
    for key, not_found_message in _PATH_RESOURCES:
        value = path_params.get(key)
        if not isinstance(value, str) or not value:
            continue
        project = await _project_for_path_param(db, key, value, workspace_id)
        if project is None:
            continue
        project_id = str(project["_id"])
        if project_id in checked:
            continue
        checked.add(project_id)
        check_project_action(project, session, action, not_found_message=not_found_message)
