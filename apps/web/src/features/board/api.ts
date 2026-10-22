import type { Schemas } from "@backline/types";

import { ApiError, apiFetch } from "../../lib/api-client";

export type CommentOut = Schemas["CommentOut"];
export type CommentStatus = CommentOut["status"];
export type CommentLayer = CommentOut["layer"];

export function listProjectComments(projectId: string): Promise<CommentOut[]> {
  return apiFetch<CommentOut[]>(`/api/v1/projects/${projectId}/comments`);
}

export function updateComment(
  commentId: string,
  patch: Schemas["CommentUpdate"],
  expectedRevision: number,
): Promise<CommentOut> {
  return apiFetch<CommentOut>(`/api/v1/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ ...patch, expected_revision: expectedRevision }),
  });
}

// Who can see a comment - the client too, or the team only. The API insists on an
// explicit confirm (comments/service.py's toggle_layer); the caller asks the member first.
export function setCommentLayer(commentId: string, layer: CommentLayer): Promise<CommentOut> {
  const body: Schemas["LayerToggleRequest"] = { layer, confirm: true };
  return apiFetch<CommentOut>(`/api/v1/comments/${commentId}/layer`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function createReply(
  commentId: string,
  request: Schemas["ReplyCreate"] & { client_request_id: string },
  signal?: AbortSignal,
): Promise<CommentOut> {
  return apiFetch<CommentOut>(`/api/v1/comments/${commentId}/replies`, {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
}

// The same-origin relay confirms the object in one request and supports repeat
// upload of the same bytes after a lost response on a matching backend.
export async function uploadAttachment(projectId: string, file: File, parent?: AbortSignal): Promise<Schemas["AttachmentIn"]> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Attachments must contain data and be at most 20 MiB.");
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", cancel, { once: true });
  if (parent?.aborted) cancel();
  // Allow the relay's 120-second object-write deadline plus request/response time.
  const timeout = window.setTimeout(() => controller.abort(), 150_000);
  try {
    const form = new FormData();
    form.append("project_id", projectId);
    form.append("file", file, file.name);
    const stored = await apiFetch<Schemas["StoredUploadOut"]>("/api/v1/uploads/direct", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    return { key: stored.key, filename: file.name, content_type: file.type };
  } catch (error) {
    if (parent?.aborted) throw parent.reason ?? error;
    if (controller.signal.aborted) throw new ApiError(0, "UPLOAD_TIMEOUT", "Upload confirmation timed out. The file may already be stored; check your attachments before selecting it again.");
    throw error;
  } finally { window.clearTimeout(timeout); parent?.removeEventListener("abort", cancel); }
}

// Moderation delete (any comment in the caller's workspace, regardless of authorship) -
// distinct from the widget's own-author-only guest self-service delete, which this
// dashboard never calls.
export function deleteComment(commentId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/comments/${commentId}/moderate`, { method: "DELETE" });
}

export function deleteThread(commentId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/comments/${commentId}/thread/moderate`, { method: "DELETE" });
}
