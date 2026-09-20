import type { createApiClient } from "./api-client";

interface UploadResponse {
  upload_url: string;
  key: string;
}

export async function uploadScreenshot(
  api: ReturnType<typeof createApiClient>,
  projectId: string,
  blob: Blob,
): Promise<string | null> {
  try {
    const { upload_url: uploadUrl, key } = await api.request<UploadResponse>("/api/v1/uploads", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        content_type: blob.type || "image/jpeg",
        content_length: blob.size,
      }),
    });
    const putResponse = await fetch(uploadUrl, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": blob.type || "image/jpeg" },
    });
    if (!putResponse.ok) return null;
    return key;
  } catch {
    return null;
  }
}

// Generic version of uploadScreenshot above, for comment attachments - any content
// type in the backend's allowlist (images, PDF, Word/Excel docs, Markdown), not just
// the fixed image/jpeg a captured screenshot always is. Returns the shape openComposer's
// uploadFile callback expects, or null on failure (the
// caller removes the attachment's chip when this happens).
export async function uploadAttachment(
  api: ReturnType<typeof createApiClient>,
  projectId: string,
  file: File,
): Promise<{ key: string; filename: string; content_type: string } | null> {
  try {
    const contentType = file.type || "application/octet-stream";
    const { upload_url: uploadUrl, key } = await api.request<UploadResponse>("/api/v1/uploads", {
      method: "POST",
      body: JSON.stringify({
        project_id: projectId,
        content_type: contentType,
        content_length: file.size,
      }),
    });
    const putResponse = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": contentType },
    });
    if (!putResponse.ok) return null;
    return { key, filename: file.name, content_type: contentType };
  } catch {
    return null;
  }
}
