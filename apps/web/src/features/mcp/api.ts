import type { Schemas } from "@backline/types";

import { API_BASE_URL, apiFetch } from "../../lib/api-client";

export type McpTokenOut = Schemas["McpTokenOut"];
export type McpTokenIssued = Schemas["McpTokenIssued"];
export type AgentHint = NonNullable<McpTokenOut["agent_hint"]>;

export const MCP_SERVER_URL = `${API_BASE_URL}/mcp`;

export function listMcpTokens(workspaceId: string): Promise<McpTokenOut[]> {
  return apiFetch<McpTokenOut[]>(`/api/v1/workspaces/${workspaceId}/mcp/tokens`);
}

export function createMcpToken(
  workspaceId: string,
  options: { label: string; agentHint: AgentHint | null },
): Promise<McpTokenIssued> {
  return apiFetch<McpTokenIssued>(`/api/v1/workspaces/${workspaceId}/mcp/tokens`, {
    method: "POST",
    body: JSON.stringify({ label: options.label, agent_hint: options.agentHint }),
  });
}

export function revokeMcpToken(tokenId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/mcp/tokens/${tokenId}`, { method: "DELETE" });
}

/** The JSON a user pastes into their agent tool's own MCP client config - the same
 * shape Claude Code/Cursor's remote-MCP-with-headers config already expects. */
export function mcpClientConfigSnippet(token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        backline: {
          url: MCP_SERVER_URL,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}
