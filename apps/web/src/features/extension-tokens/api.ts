import type { Schemas } from "@backline/types";

import { apiFetch } from "../../lib/api-client";

export type ExtensionTokenOut = Schemas["ExtensionTokenOut"];
export type ExtensionTokenIssued = Schemas["ExtensionTokenIssued"];

export function listExtensionTokens(workspaceId: string): Promise<ExtensionTokenOut[]> {
  return apiFetch<ExtensionTokenOut[]>(`/api/v1/workspaces/${workspaceId}/extension-tokens`);
}

export function createExtensionToken(
  workspaceId: string,
  name: string,
): Promise<ExtensionTokenIssued> {
  return apiFetch<ExtensionTokenIssued>(`/api/v1/workspaces/${workspaceId}/extension-tokens`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function revokeExtensionToken(tokenId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/extension-tokens/${tokenId}`, { method: "DELETE" });
}
