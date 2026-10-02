import type { Schemas } from "@backline/types";

import { apiFetch } from "../../lib/api-client";

export type ShareLinkOut = Schemas["ShareLinkOut"];
export type CanvasSessionOut = Schemas["CanvasSessionOut"];

/** The project's client review links. Commenters and up only (TDR-0057): a link lets
 * whoever holds it comment as a guest, so a viewer is never handed one. */
export function listShareLinks(projectId: string): Promise<ShareLinkOut[]> {
  return apiFetch<ShareLinkOut[]>(`/api/v1/projects/${projectId}/share-links`);
}

/** What the review canvas loads with: the project's own canvas link and the widget's
 * session on it, bound to the signed-in member (TDR-0057). Safe to repeat - the
 * server reuses the member's session. */
export function createCanvasSession(projectId: string): Promise<CanvasSessionOut> {
  return apiFetch<CanvasSessionOut>(`/api/v1/projects/${projectId}/canvas-session`, { method: "POST" });
}

export function createShareLink(
  projectId: string,
  options: { mode: "snippet" | "proxy"; passcode?: string; expiresAt?: string; askReviewerName?: boolean; domainRestrictions?: string[]; commentExportPermission?: boolean },
): Promise<ShareLinkOut> {
  return apiFetch<ShareLinkOut>(`/api/v1/projects/${projectId}/share-links`, {
    method: "POST",
    body: JSON.stringify({
      mode: options.mode,
      passcode: options.passcode || null,
      expires_at: options.expiresAt || null,
      ask_reviewer_name: options.askReviewerName ?? true,
      domain_restrictions: options.domainRestrictions ?? [],
      comment_export_permission: options.commentExportPermission ?? false,
    }),
  });
}

export function revokeShareLink(shareLinkId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/share-links/${shareLinkId}/revoke`, { method: "PATCH" });
}
