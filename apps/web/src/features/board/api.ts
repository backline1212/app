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
): Promise<CommentOut> {
  return apiFetch<CommentOut>(`/api/v1/comments/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
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

export function createUpload(
  projectId: string,
  contentType: string,
  contentLength: number,
  signal?: AbortSignal,
): Promise<Schemas["UploadOut"]> {
  return apiFetch<Schemas["UploadOut"]>("/api/v1/uploads", {
    method: "POST",
    signal,
    body: JSON.stringify({
      project_id: projectId,
      content_type: contentType,
      content_length: contentLength,
    }),
  });
}

// Presigned-PUT upload for a reply attachment, returning the AttachmentIn the reply
// carries - the same two-step flow a screenshot uses (POST /uploads, then PUT the bytes).
export async function uploadAttachment(projectId: string, file: File, parent?: AbortSignal): Promise<Schemas["AttachmentIn"]> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("Attachments must contain data and be at most 20 MiB.");
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", cancel, { once: true });
  if (parent?.aborted) cancel();
  const timeout = window.setTimeout(() => controller.abort(), 120_000);
  try {
    const upload = await createUpload(projectId, file.type, file.size, controller.signal);
    try {
      const response = await fetch(upload.upload_url, {
        method: "PUT",
        body: file,
        signal: controller.signal,
        headers: { "Content-Type": file.type },
      });
      if (response.ok) {
        return { key: upload.key, filename: file.name, content_type: file.type };
      }
    } catch (error) {
      if (controller.signal.aborted) throw error;
      // A bucket CORS/network failure falls through to the same-origin relay below.
    }
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
