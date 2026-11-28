import type { Schemas } from "@backline/types";
import { apiFetch, apiFetchBlob } from "../../lib/api-client";

export type Client = Schemas["ClientOut"];
export function listClients(workspaceId: string, includeArchived = false) {
  return apiFetch<Client[]>(`/api/v1/workspaces/${workspaceId}/clients?include_archived=${includeArchived}`);
}
export function createClient(workspaceId: string, body: Schemas["ClientCreate"]) {
  return apiFetch<Client>(`/api/v1/workspaces/${workspaceId}/clients`, { method: "POST", body: JSON.stringify(body) });
}
export function updateClient(workspaceId: string, id: string, body: Schemas["ClientUpdate"]) {
  return apiFetch<Client>(`/api/v1/workspaces/${workspaceId}/clients/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}
export function exportClients(workspaceId: string) {
  return apiFetchBlob(`/api/v1/workspaces/${workspaceId}/clients/export`);
}
