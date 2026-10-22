import type { ApiClient } from "./api-client";

interface StoredUploadResponse {
  key: string;
}

async function uploadThroughApi(
  api: ApiClient,
  projectId: string,
  body: Blob,
  filename: string,
): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("project_id", projectId);
    form.append("file", body, filename);
    const stored = await api.upload<StoredUploadResponse>("/api/v1/uploads/direct", form);
    return stored.key;
  } catch {
    return null;
  }
}

export async function uploadScreenshot(
  api: ApiClient,
  projectId: string,
  blob: Blob,
): Promise<string | null> {
  return uploadThroughApi(api, projectId, blob, "screenshot.jpg");
}

// The relay accepts the same attachment allowlist as screenshots and gives one
// confirmation. A retry with identical content can reuse its object and quota hold.
export async function uploadAttachment(
  api: ApiClient,
  projectId: string,
  file: File,
): Promise<{ key: string; filename: string; content_type: string } | null> {
  const contentType = file.type || "application/octet-stream";
  const key = await uploadThroughApi(api, projectId, file, file.name);
  return key ? { key, filename: file.name, content_type: contentType } : null;
}
