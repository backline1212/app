// Project-level roles (TDR-0056). The backend's PROJECT_PERMISSIONS matrix
// (backend/app/core/permissions.py) decides every action; this file only mirrors its
// four tiers so the UI can hide controls a person can't use. Hiding is a courtesy -
// the API refuses anything a role doesn't allow either way.

export type ProjectRole = "viewer" | "commenter" | "editor" | "manager";
export type ProjectVisibility = "workspace" | "private";

export const PROJECT_ROLES: ProjectRole[] = ["viewer", "commenter", "editor", "manager"];

const RANK: Record<ProjectRole, number> = { viewer: 1, commenter: 2, editor: 3, manager: 4 };

export const PROJECT_ROLE_META: Record<ProjectRole, { label: string; summary: string }> = {
  viewer: { label: "Viewer", summary: "Sees the project, its pages and every comment." },
  commenter: { label: "Commenter", summary: "Viewer, plus posts comments and replies." },
  editor: {
    label: "Editor",
    summary: "Commenter, plus triages tickets, manages pages and sends review links.",
  },
  manager: {
    label: "Manager",
    summary: "Editor, plus project settings, archiving and who has access.",
  },
};

/** What a capability needs, matching the backend matrix's tiers. */
export type ProjectCapability = "view" | "comment" | "edit" | "manage";
const CAPABILITY_ROLE: Record<ProjectCapability, ProjectRole> = {
  view: "viewer",
  comment: "commenter",
  edit: "editor",
  manage: "manager",
};

export function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === "string" && value in RANK;
}

export function roleAtLeast(role: string | null | undefined, minimum: ProjectRole): boolean {
  return isProjectRole(role) && RANK[role] >= RANK[minimum];
}

/** Whether the signed-in person's role on `project` covers `capability`. A project
 * without `my_role` (never the case for API responses) is treated as view-only. */
export function projectCan(
  project: { my_role?: string | null } | null | undefined,
  capability: ProjectCapability,
): boolean {
  return roleAtLeast(project?.my_role ?? "viewer", CAPABILITY_ROLE[capability]);
}

export function roleLabel(role: string | null | undefined): string {
  return isProjectRole(role) ? PROJECT_ROLE_META[role].label : "No access";
}

export const ROLE_SOURCE_LABEL: Record<string, string> = {
  workspace_admin: "Workspace admin",
  explicit: "Added to project",
  creator: "Created the project",
  default: "Everyone in the workspace",
  none: "No access",
};

/** Plain-language reason an action is unavailable, for disabled controls' titles. */
export function needsRoleHint(capability: ProjectCapability): string {
  return `Needs ${PROJECT_ROLE_META[CAPABILITY_ROLE[capability]].label.toLowerCase()} access on this project`;
}
