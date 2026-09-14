import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { qk } from "../../../lib/query-keys";
import * as mcpApi from "../../mcp/api";

const CONNECTORS = [
  { name: "Claude", color: "#D97757" },
  { name: "Cursor", color: "var(--brand-cursor, #14141A)" },
  { name: "Codex", color: "#10A37F" },
  { name: "Antigravity", color: "#4F46E5" },
];

interface McpTabProps {
  workspaceId: string;
  workspaceSlug: string;
}

// Real MCP server behind this panel now (docs/implementation/slack-ai-mcp-
// architecture.md §2) - token generation needs room for a copy-once secret + config
// snippet this compact panel doesn't have, so every action here opens the full MCP
// Server settings page, same "quick-access panel, connect on the full page" pattern
// IntegrationsTab.tsx already uses for Slack/Trello/ClickUp/Jira/Asana.
export function McpTab({ workspaceId, workspaceSlug }: McpTabProps) {
  const navigate = useNavigate();
  const { data: tokens } = useQuery({
    queryKey: qk.mcpTokens(workspaceId),
    queryFn: () => mcpApi.listMcpTokens(workspaceId),
  });
  const activeCount = (tokens ?? []).filter((t) => !t.revoked_at).length;

  function goToSettings() {
    navigate(`/w/${workspaceSlug}/mcp`);
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <p style={{ color: "var(--ink-3)", fontSize: 13 }}>
        Let your AI agent read comments, push fixes, and close threads - without switching
        tabs.
      </p>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Connect</h3>
        <div className="flex flex-col gap-2">
          {CONNECTORS.map((connector) => (
            <div key={connector.name} className="bl-connector-row">
              <span className="bl-connector-name">
                <span className="bl-connector-id" style={{ background: connector.color }}>
                  {connector.name[0]}
                </span>
                {connector.name}
              </span>
              <button type="button" onClick={goToSettings} className="bl-quiet">
                Connect
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={goToSettings} className="bl-quiet" style={{ marginTop: 8, width: "100%" }}>
          + Add other MCP
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 14 }}>
        <h3 className="text-sm font-semibold">Personal access token</h3>
        <p className="bl-inline-note" style={{ marginTop: 6 }}>
          {activeCount > 0
            ? `${activeCount} active token${activeCount === 1 ? "" : "s"}.`
            : "No tokens yet."}{" "}
          <button type="button" onClick={goToSettings} className="bl-text-link" style={{ padding: 0 }}>
            Manage tokens
          </button>
        </p>
      </div>
    </div>
  );
}
