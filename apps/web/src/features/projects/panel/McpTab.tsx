import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { qk } from "../../../lib/query-keys";
import * as mcpApi from "../../mcp/api";
import { MCP_CLIENTS } from "../../mcp/clients";

// The four the design lists up front; every other client is one click further, on
// the full MCP Server page ("+ Add other MCP").
const FEATURED = new Set<mcpApi.AgentHint>(["claude", "cursor", "codex", "antigravity"]);

interface McpTabProps {
  workspaceId: string;
  workspaceSlug: string;
}

// Real MCP server behind this panel (docs/implementation/slack-ai-mcp-architecture.md
// §2, TDR-0046) - token creation needs room for a copy-once secret and a config
// snippet this compact panel doesn't have, so each "Connect" opens the full MCP Server
// page on that client's setup, the same "quick-access panel, connect on the full page"
// pattern IntegrationsTab.tsx uses.
export function McpTab({ workspaceId, workspaceSlug }: McpTabProps) {
  const navigate = useNavigate();
  const { data: tokens } = useQuery({
    queryKey: qk.mcpTokens(workspaceId),
    queryFn: () => mcpApi.listMcpTokens(workspaceId),
  });
  const active = (tokens ?? []).filter((t) => !t.revoked_at);
  const connectedHints = new Set(active.map((t) => t.agent_hint));

  const open = (client?: string) => navigate(`/w/${workspaceSlug}/mcp${client ? `?client=${client}` : ""}`);

  return (
    <div className="flex flex-col gap-5 p-4">
      <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
        Let your AI agent read comments, push fixes, and close threads - without switching tabs.
      </p>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Connect</h3>
        <div className="flex flex-col gap-2">
          {MCP_CLIENTS.filter((client) => FEATURED.has(client.id)).map((client) => (
            <div key={client.id} className="bl-connector-row">
              <span className="bl-connector-name">
                <span className="bl-connector-id" style={{ background: client.color }}>
                  {client.name[0]}
                </span>
                {client.name}
              </span>
              <button type="button" onClick={() => open(client.id)} className="bl-quiet">
                {connectedHints.has(client.id) ? "Set up again" : "Connect"}
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => open("other")} className="bl-quiet" style={{ marginTop: 8, width: "100%" }}>
          + Add other MCP
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 14 }}>
        <h3 className="text-sm font-semibold">Personal access token</h3>
        <p className="bl-inline-note" style={{ marginTop: 6 }}>
          {active.length > 0 ? `${active.length} active token${active.length === 1 ? "" : "s"}.` : "No tokens yet."}{" "}
          <button type="button" onClick={() => open()} className="bl-text-link" style={{ padding: 0 }}>
            Manage tokens
          </button>
        </p>
      </div>
    </div>
  );
}
