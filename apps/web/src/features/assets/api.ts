import type { Schemas } from "@backline/types";
import { API_BASE_URL, ApiError, apiFetch, apiFetchBlob } from "../../lib/api-client";

export type Asset = Schemas["AssetOut"];
export type Region = Schemas["Region"];
// File objects are immutable. Keep one request per file/project while a form retries;
// selecting a new File starts a new upload intent without storing business data locally.
const uploadRequests = new WeakMap<File, Map<string, string>>();
export async function assetRequest<T>(path: string, guest?: string, init?: RequestInit): Promise<T> {
  if (!guest) return apiFetch<T>(path, init);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Guest-Session': guest, ...init?.headers } });
  if (!response.ok) { const data = await response.json().catch(() => null); throw new ApiError(response.status, data?.error?.code ?? "REVIEW_ERROR", data?.error?.message ?? "The review could not be loaded."); }
  return response.json() as Promise<T>;
}
export function listAssets(projectId: string, guest?: string, includeArchived = false) { return assetRequest<Asset[]>(`/api/v1/projects/${projectId}/assets${includeArchived ? '?include_archived=true' : ''}`, guest); }
export function updateAsset(projectId: string, assetId: string, body: Schemas['AssetUpdate']) {
  return apiFetch<Asset>(`/api/v1/projects/${projectId}/assets/${assetId}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export function uploadAsset(projectId: string, file: File) {
  let projectRequests = uploadRequests.get(file);
  if (!projectRequests) { projectRequests = new Map(); uploadRequests.set(file, projectRequests); }
  let requestId = projectRequests.get(projectId);
  if (!requestId) { requestId = crypto.randomUUID(); projectRequests.set(projectId, requestId); }
  const form = new FormData(); form.append('file', file);
  form.append('client_request_id', requestId);
  return apiFetch<Asset>(`/api/v1/projects/${projectId}/assets`, { method: 'POST', body: form });
}
export function listAssetComments(pageId: string, guest?: string) { return assetRequest<Schemas['CommentOut'][]>(`/api/v1/pages/${pageId}/comments`, guest); }
export function createAssetComment(projectId: string, assetId: string, body: Schemas['AssetCommentCreate'], guest?: string) { return assetRequest<Schemas['CommentOut']>(`/api/v1/projects/${projectId}/assets/${assetId}/comments`, guest, { method: 'POST', body: JSON.stringify(body) }); }
export function replyToComment(commentId: string, body: string, layer: 'client' | 'team', guest?: string, clientRequestId?: string) { return assetRequest<Schemas['CommentOut']>(`/api/v1/comments/${commentId}/replies`, guest, { method: 'POST', body: JSON.stringify({ body, layer, client_request_id: clientRequestId }) }); }
export function reanchorComment(projectId: string, assetId: string, commentId: string, region: Region) {
  return apiFetch<Schemas['CommentOut']>(`/api/v1/projects/${projectId}/assets/${assetId}/comments/${commentId}/region`, { method: 'PATCH', body: JSON.stringify(region) });
}
export async function getAssetContent(projectId: string, assetId: string, guest?: string, signal?: AbortSignal): Promise<Blob> {
  const path = `/api/v1/projects/${projectId}/assets/${assetId}/content`;
  if (!guest) return apiFetchBlob(path, { signal });
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: { 'X-Guest-Session': guest }, signal });
  if (!response.ok) { const data = await response.json().catch(() => null); throw new ApiError(response.status, data?.error?.code ?? "FILE_ERROR", data?.error?.message ?? "The file could not be loaded. Try again."); }
  return response.blob();
}
