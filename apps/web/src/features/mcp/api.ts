import type { Schemas } from "@backline/types";

import { API_BASE_URL, apiFetch } from "../../lib/api-client";

export type McpTokenOut = Schemas["McpTokenOut"];
export type McpTokenIssued = Schemas["McpTokenIssued"];
export type AgentHint = NonNullable<McpTokenOut["agent_hint"]>;
export type McpAccess = NonNullable<Schemas["McpTokenCreate"]["access"]>;

export const MCP_SERVER_URL = `${API_BASE_URL.replace(/\/+$/, "")}/mcp`;
export const WRITE_SCOPE = "backline:write";

export function listMcpTokens(workspaceId: string): Promise<McpTokenOut[]> {
  return apiFetch<McpTokenOut[]>(`/api/v1/workspaces/${workspaceId}/mcp/tokens`);
}

export type McpExpiry = 30 | 90 | 365 | null;

/** "expires Jan 3, 2027" / "expired" / "never expires" for a token row. */
export function expiryLabel(expiresAt: string | null | undefined, format: (iso: string) => string): string {
  if (!expiresAt) return "never expires";
  return Date.parse(expiresAt) <= Date.now() ? "expired" : `expires ${format(expiresAt)}`;
}

export function createMcpToken(
  workspaceId: string,
  options: { label: string; agentHint: AgentHint | null; access: McpAccess; expiresInDays: McpExpiry },
): Promise<McpTokenIssued> {
  return apiFetch<McpTokenIssued>(`/api/v1/workspaces/${workspaceId}/mcp/tokens`, {
    method: "POST",
    body: JSON.stringify({ label: options.label, agent_hint: options.agentHint, access: options.access, expires_in_days: options.expiresInDays }),
  });
}

export function revokeMcpToken(tokenId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/mcp/tokens/${tokenId}`, { method: "DELETE" });
}
