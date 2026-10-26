import type { Schemas } from "@backline/types";

import { apiFetch, apiFetchBlob } from "../../lib/api-client";

export type ProjectOut = Schemas["ProjectOut"];
export type PageOut = Schemas["PageOut"];
export type RevisionHistoryOut = Schemas["RevisionHistoryOut"];

export function getDeploySync(projectId: string): Promise<Schemas["DeploySyncOut"]> {
  return apiFetch<Schemas["DeploySyncOut"]>(`/api/v1/projects/${projectId}/deploy-sync`);
}

export function createDeployCredential(projectId: string, request: Schemas["DeployCredentialRequest"]): Promise<Schemas["DeployCredentialOut"]> {
  return apiFetch<Schemas["DeployCredentialOut"]>(`/api/v1/projects/${projectId}/deploy-sync/credential`, { method: "POST", body: JSON.stringify(request) });
}

export function revokeDeployCredential(projectId: string, expectedVersion: number): Promise<void> {
  return apiFetch<void>(`/api/v1/projects/${projectId}/deploy-sync/credential`, { method: "DELETE", body: JSON.stringify({ expected_version: expectedVersion }) });
}

export function listDeployments(projectId: string, cursor: string | null = null): Promise<Schemas["DeploymentListOut"]> {
  const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch<Schemas["DeploymentListOut"]>(`/api/v1/projects/${projectId}/deploy-sync/deployments${params}`);
}

export function listProjects(workspaceId: string, includeArchived = false): Promise<ProjectOut[]> {
  return apiFetch<ProjectOut[]>(`/api/v1/workspaces/${workspaceId}/projects?include_archived=${includeArchived}`);
}

export type UrlCheckOut = Schemas["UrlCheckOut"];

/** Whether a review URL loads, before the project is saved (TDR-0206). */
export function checkProjectUrl(workspaceId: string, url: string, signal?: AbortSignal): Promise<UrlCheckOut> {
  return apiFetch<UrlCheckOut>(`/api/v1/workspaces/${workspaceId}/projects/check-url`, {
    method: "POST",
    body: JSON.stringify({ url }),
    signal,
  });
}

export function createProject(
  workspaceId: string,
  name: string,
  targetOrigin: string,
  options: Partial<Schemas["ProjectCreate"]> = {},
): Promise<ProjectOut> {
  return apiFetch<ProjectOut>(`/api/v1/workspaces/${workspaceId}/projects`, {
    method: "POST",
    body: JSON.stringify({ ...options, name, target_origin: targetOrigin }),
  });
}

export function getProject(projectId: string): Promise<ProjectOut> {
  return apiFetch<ProjectOut>(`/api/v1/projects/${projectId}`);
}

export function archiveProject(projectId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/projects/${projectId}`, { method: "DELETE" });
}

export function updateProject(projectId: string, patch: Schemas["ProjectUpdate"]) {
  return apiFetch<ProjectOut>(`/api/v1/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(patch) });
}
export function restoreProject(projectId: string) {
  return apiFetch<ProjectOut>(`/api/v1/projects/${projectId}/restore`, { method: "POST" });
}

export function duplicateProject(projectId: string) {
  return apiFetch<ProjectOut>(`/api/v1/projects/${projectId}/duplicate`, { method: "POST" });
}

/** Offer a picture for the project's card from this browser: a website's start page
 * (the extension) or a file project's file (TDR-0197/0198). The API decides if it's kept. */
export function offerProjectPicture(projectId: string, dataUrl: string, assetId?: string) {
  return apiFetch<Schemas["PreviewImageOut"]>(`/api/v1/projects/${projectId}/preview/image`, {
    method: "PUT",
    body: JSON.stringify({ data_url: dataUrl, asset_id: assetId ?? null } satisfies Schemas["PreviewImageIn"]),
  });
}

/** Retake the card's screenshot of the site (TDR-0058); the worker captures it. */
export function refreshProjectPreview(projectId: string) {
  return apiFetch<ProjectOut>(`/api/v1/projects/${projectId}/preview`, { method: "POST" });
}

export type ProjectHardDeletePreviewOut = Schemas["ProjectHardDeletePreviewOut"];
export type ProjectHardDeleteResult = Schemas["ProjectHardDeleteResult"];

export function previewHardDeleteProject(projectId: string): Promise<ProjectHardDeletePreviewOut> {
  return apiFetch<ProjectHardDeletePreviewOut>(`/api/v1/projects/${projectId}/hard-delete/preview`, {
    method: "POST",
  });
}

export function confirmHardDeleteProject(
  projectId: string,
  body: { correlation_id: string; project_name: string },
): Promise<ProjectHardDeleteResult> {
  return apiFetch<ProjectHardDeleteResult>(`/api/v1/projects/${projectId}/hard-delete/confirm`, {
    method: "POST",
    body: JSON.stringify({ ...body, acknowledge_permanent_deletion: true }),
  });
}

export function listPages(projectId: string, signal?: AbortSignal) {
  return apiFetch<PageOut[]>(`/api/v1/projects/${projectId}/pages`, { signal });
}

export function createPage(projectId: string, body: Schemas["PageCreate"]) {
  return apiFetch<PageOut>(`/api/v1/projects/${projectId}/pages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updatePage(pageId: string, body: Schemas["PageUpdate"]) {
  return apiFetch<PageOut>(`/api/v1/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function reorderPages(projectId: string, pageIds: string[]) {
  return apiFetch<PageOut[]>(`/api/v1/projects/${projectId}/pages/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ page_ids: pageIds }),
  });
}

export function removePage(pageId: string) {
  return apiFetch<void>(`/api/v1/pages/${pageId}`, { method: "DELETE" });
}

export function getPageApproval(pageId: string) {
  return apiFetch<Schemas["PageApprovalOut"]>(`/api/v1/pages/${pageId}/approval`);
}

export function updatePageApproval(pageId: string, body: Schemas["PageApprovalUpdate"]) {
  return apiFetch<Schemas["PageApprovalOut"]>(`/api/v1/pages/${pageId}/approval`, {
    method: "PATCH", body: JSON.stringify(body),
  });
}

export function listRevisions(projectId: string, signal?: AbortSignal) {
  return apiFetch<RevisionHistoryOut[]>(`/api/v1/projects/${projectId}/revisions`, { signal });
}

export function exportProject(projectId: string) {
  return apiFetchBlob(`/api/v1/projects/${projectId}/export`);
}

export interface ProjectSettingsUpdate {
  capture_device_details?: boolean;
  reanchor_on_deploy?: boolean;
  reviewer_can_resolve?: boolean;
  show_board_to_client?: boolean;
  client_digest_enabled?: boolean;
  enable_cross_browser_render?: boolean;
  slack_notifications_enabled?: boolean;
}

export function updateProjectSettings(projectId: string, settings: ProjectSettingsUpdate) {
  return apiFetch<Schemas["ProjectSettingsOut"]>(`/api/v1/projects/${projectId}/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

// ── Project access (TDR-0056) ──────────────────────────────────────────────────
export type ProjectAccessDetailOut = Schemas["ProjectAccessDetailOut"];
export type ProjectPersonOut = Schemas["ProjectPersonOut"];
export type ProjectAccessUpdate = Schemas["ProjectAccessUpdate"];

export function getProjectAccess(projectId: string): Promise<ProjectAccessDetailOut> {
  return apiFetch<ProjectAccessDetailOut>(`/api/v1/projects/${projectId}/access`);
}

export function updateProjectAccess(projectId: string, changes: ProjectAccessUpdate) {
  return apiFetch<ProjectAccessDetailOut>(`/api/v1/projects/${projectId}/access`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export function setProjectMemberRole(projectId: string, userId: string, role: Schemas["ProjectMemberRoleUpdate"]["role"]) {
  return apiFetch<ProjectAccessDetailOut>(`/api/v1/projects/${projectId}/access/members/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export function removeProjectMember(projectId: string, userId: string) {
  return apiFetch<void>(`/api/v1/projects/${projectId}/access/members/${userId}`, { method: "DELETE" });
}
