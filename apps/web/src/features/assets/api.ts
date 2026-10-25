import type { Schemas } from "@backline/types";
import { API_BASE_URL, ApiError, apiFetch, apiFetchBlob, toApiError } from "../../lib/api-client";

export type Asset = Schemas["AssetOut"];
export type Region = Schemas["Region"];
// File objects are immutable. Keep one request per file/project while a form retries;
// selecting a new File starts a new upload intent without storing business data locally.
const uploadRequests = new WeakMap<File, Map<string, string>>();
async function boundedRequest<T>(milliseconds: number, message: string, run: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal | null): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parent?.reason);
  parent?.addEventListener('abort', cancel, { once: true });
  if (parent?.aborted) cancel();
  const timeout = window.setTimeout(() => controller.abort(), milliseconds);
  try { return await run(controller.signal); }
  catch (error) {
    if (parent?.aborted) throw parent.reason ?? error;
    if (controller.signal.aborted) throw new ApiError(0, 'REQUEST_TIMEOUT', message);
    throw error;
  } finally { window.clearTimeout(timeout); parent?.removeEventListener('abort', cancel); }
}
export async function assetRequest<T>(path: string, guest?: string, init?: RequestInit): Promise<T> {
  const writing = init?.method && init.method !== 'GET';
  return boundedRequest(30_000, writing ? 'Saving timed out and may already have completed. Retry the original request or check the file before saving again.' : 'Loading this review timed out. Try again.', async signal => {
    if (!guest) return apiFetch<T>(path, { ...init, signal });
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, signal, credentials: 'omit', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Guest-Session': guest, ...init?.headers } });
    if (!response.ok) throw await toApiError(response, "REVIEW_ERROR", "The review could not be loaded.");
    return response.json() as Promise<T>;
  }, init?.signal);
}
export function listAssets(projectId: string, guest?: string, includeArchived = false) { return assetRequest<Asset[]>(`/api/v1/projects/${projectId}/assets${includeArchived ? '?include_archived=true' : ''}`, guest); }
export function updateAsset(projectId: string, assetId: string, body: Schemas['AssetUpdate']) {
  return assetRequest<Asset>(`/api/v1/projects/${projectId}/assets/${assetId}`, undefined, { method: 'PATCH', body: JSON.stringify(body) });
}
export interface BuildInfo { build_label?: string; device?: string; platform?: string }
export function uploadAsset(projectId: string, file: File, build?: BuildInfo, replacesAssetId?: string, carryOpenComments = false) {
  let projectRequests = uploadRequests.get(file);
  if (!projectRequests) { projectRequests = new Map(); uploadRequests.set(file, projectRequests); }
  const requestKey = replacesAssetId ? `${projectId}:${replacesAssetId}` : projectId;
  let requestId = projectRequests.get(requestKey);
  if (!requestId) { requestId = crypto.randomUUID(); projectRequests.set(requestKey, requestId); }
  const form = new FormData(); form.append('file', file);
  form.append('client_request_id', requestId);
  if (replacesAssetId) form.append('replaces_asset_id', replacesAssetId);
  if (replacesAssetId && carryOpenComments) form.append('carry_open_comments', 'true');
  for (const [field, value] of Object.entries(build ?? {})) if (value?.trim()) form.append(field, value.trim());
  return boundedRequest(120_000, 'Upload confirmation timed out. Retry this batch with the same selected files to recover an upload that may already be saved.', signal => apiFetch<Asset>(`/api/v1/projects/${projectId}/assets`, { method: 'POST', body: form, signal }));
}
/** A fingerprint of the page's comment list; it changes whenever the list would. */
export function assetCommentsVersion(pageId: string, guest?: string) { return assetRequest<Schemas['CommentsVersionOut']>(`/api/v1/pages/${pageId}/comments/version`, guest); }
export function listAssetComments(pageId: string, guest?: string) { return assetRequest<Schemas['CommentOut'][]>(`/api/v1/pages/${pageId}/comments`, guest); }
export function createAssetComment(projectId: string, assetId: string, body: Schemas['AssetCommentCreate'], guest?: string) { return assetRequest<Schemas['CommentOut']>(`/api/v1/projects/${projectId}/assets/${assetId}/comments`, guest, { method: 'POST', body: JSON.stringify(body) }); }
export function replyToComment(commentId: string, body: string, layer: 'client' | 'team', guest?: string, clientRequestId?: string) { return assetRequest<Schemas['CommentOut']>(`/api/v1/comments/${commentId}/replies`, guest, { method: 'POST', body: JSON.stringify({ body, layer, client_request_id: clientRequestId }) }); }
export function reanchorComment(projectId: string, assetId: string, commentId: string, region: Region) {
  return assetRequest<Schemas['CommentOut']>(`/api/v1/projects/${projectId}/assets/${assetId}/comments/${commentId}/region`, undefined, { method: 'PATCH', body: JSON.stringify(region) });
}
export async function getAssetContent(projectId: string, assetId: string, guest?: string, signal?: AbortSignal): Promise<Blob> {
  const path = `/api/v1/projects/${projectId}/assets/${assetId}/content`;
  return boundedRequest(60_000, 'Loading this file timed out. Try Retry file to load it again.', async requestSignal => {
    if (!guest) return apiFetchBlob(path, { signal: requestSignal });
    const response = await fetch(`${API_BASE_URL}${path}`, { headers: { 'X-Guest-Session': guest }, credentials: 'omit', cache: 'no-store', signal: requestSignal });
    if (!response.ok) throw await toApiError(response, "FILE_ERROR", "The file could not be loaded. Try again.");
    return response.blob();
  }, signal);
}

/** Comment attachment (file or screen/voice recording) for the file review composer,
 * through the same-origin relay. Guests authenticate with their review session. */
export async function uploadReviewAttachment(projectId: string, file: File, guest?: string): Promise<Schemas['AttachmentIn']> {
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error(`${file.name} must contain data and be at most 20 MB.`);
  const form = new FormData();
  form.append('project_id', projectId);
  form.append('file', file, file.name);
  const stored = await boundedRequest(150_000, 'Upload confirmation timed out. Check the attachment before adding it again.', async signal => {
    if (!guest) return apiFetch<Schemas['StoredUploadOut']>('/api/v1/uploads/direct', { method: 'POST', body: form, signal });
    const response = await fetch(`${API_BASE_URL}/api/v1/uploads/direct`, { method: 'POST', body: form, signal, credentials: 'omit', headers: { 'X-Guest-Session': guest } });
    if (!response.ok) throw await toApiError(response, 'UPLOAD_ERROR', 'The attachment could not be uploaded.');
    return response.json() as Promise<Schemas['StoredUploadOut']>;
  });
  return { key: stored.key, filename: file.name, content_type: file.type || 'application/octet-stream' };
}
