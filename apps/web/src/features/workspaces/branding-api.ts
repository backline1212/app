import type { Schemas } from "@backline/types";
import { apiFetch } from "../../lib/api-client";

export type Branding = Schemas["BrandingOut"];
export type PublicBranding = Schemas["PublicBrandingOut"];
export type CustomDomain = Schemas["CustomDomainOut"];

export const getBranding = (workspaceId: string) => apiFetch<Branding>(`/api/v1/workspaces/${workspaceId}/branding`);
export const updateBranding = (workspaceId: string, body: Schemas["BrandingUpdate"]) =>
  apiFetch<Branding>(`/api/v1/workspaces/${workspaceId}/branding`, { method: "PUT", body: JSON.stringify(body) });
export function uploadLogo(workspaceId: string, file: File) {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiFetch<Branding>(`/api/v1/workspaces/${workspaceId}/branding/logo`, { method: "POST", body: form });
}
export const listDomains = (workspaceId: string) => apiFetch<CustomDomain[]>(`/api/v1/workspaces/${workspaceId}/domains`);
export const addDomain = (workspaceId: string, host: string) =>
  apiFetch<CustomDomain>(`/api/v1/workspaces/${workspaceId}/domains`, { method: "POST", body: JSON.stringify({ host }) });
export const verifyDomain = (workspaceId: string, domainId: string) =>
  apiFetch<CustomDomain>(`/api/v1/workspaces/${workspaceId}/domains/${domainId}/verify`, { method: "POST" });
export const removeDomain = (workspaceId: string, domainId: string) =>
  apiFetch<void>(`/api/v1/workspaces/${workspaceId}/domains/${domainId}`, { method: "DELETE" });
