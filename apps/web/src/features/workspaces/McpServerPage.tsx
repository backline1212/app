import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import * as mcpApi from "../mcp/api";
import { useDocumentTitle } from "../../lib/use-document-title";
import { formatRelativeTime } from "../../lib/date-format";
import { qk } from "../../lib/query-keys";
import type { WorkspaceOut } from "./api";

const AGENTS: { name: string; hint: mcpApi.AgentHint }[] = [
  { name: "Claude", hint: "claude" },
  { name: "Cursor", hint: "cursor" },
  { name: "Codex", hint: "codex" },
  { name: "Antigravity", hint: "antigravity" },
];

// A real Backline-hosted MCP server (docs/implementation/slack-ai-mcp-architecture.md
// §2) - no OAuth dance, since Backline has no app-review relationship with any of
// these tools. A member mints a personal access token here and pastes it into their
// own tool's MCP client config; the tool then calls generate_implementation_prompt
// directly against Backline's data, scoped to this workspace and this member only.
export function McpServerPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle("MCP Server");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [agentHint, setAgentHint] = useState<mcpApi.AgentHint | "">("");
  const [copiedConfig, setCopiedConfig] = useState(false);

  const queryKey = qk.mcpTokens(workspace.id);
  const { data: tokens, isLoading, error: listError } = useQuery({
    queryKey,
    queryFn: () => mcpApi.listMcpTokens(workspace.id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const [revealedToken, setRevealedToken] = useState<mcpApi.McpTokenIssued | null>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      mcpApi.createMcpToken(workspace.id, { label: label.trim(), agentHint: agentHint || null }),
    onSuccess: (issued) => {
      setLabel("");
      setAgentHint("");
      setError(null);
      setRevealedToken(issued);
      setCopiedConfig(false);
      invalidate();
      requestAnimationFrame(() =>
        revealRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not create a token."),
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => mcpApi.revokeMcpToken(tokenId),
    onSuccess: invalidate,
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!label.trim()) return;
    createMutation.mutate();
  }

  async function copyConfig() {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(mcpApi.mcpClientConfigSnippet(revealedToken.token));
      setCopiedConfig(true);
    } catch {
      setError("Select the config below and copy it manually.");
    }
  }

  const activeTokens = (tokens ?? []).filter((t) => !t.revoked_at);

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>MCP Server</h1>
          <p>
            Give your AI agent direct access to Backline feedback. Generate a personal access
            token, point your tool's MCP config at the server below, and it can pull a
            structured implementation prompt for any comment or ticket.
          </p>
        </div>
      </header>

      {error && <div className="bl-error">{error}</div>}
      {listError && (
        <p role="alert" className="bl-error">
          {listError instanceof Error ? listError.message : "Could not load MCP tokens."}
        </p>
      )}
      {isLoading && <LoadingScreen />}

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Connect</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <p className="bl-mono">
            Generate a token below, then add Backline as a remote MCP server in {AGENTS.map((a) => a.name).join("/")} (or any MCP-compatible tool) using this URL and your token
            as a bearer-token header:
          </p>
          <input readOnly value={mcpApi.MCP_SERVER_URL} className="bl-input bl-mono" onFocus={(e) => e.target.select()} />

          <form onSubmit={handleCreate} style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
            <input
              required
              placeholder="My laptop - Claude Code"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="bl-input"
              style={{ flex: 1, minWidth: "180px" }}
            />
            <select
              value={agentHint}
              onChange={(event) => setAgentHint(event.target.value as mcpApi.AgentHint | "")}
              className="bl-input"
              aria-label="Agent (optional)"
              style={{ minWidth: "140px" }}
            >
              <option value="">Agent (optional)</option>
              {AGENTS.map((agent) => (
                <option key={agent.hint} value={agent.hint}>
                  {agent.name}
                </option>
              ))}
            </select>
            <button type="submit" className="bl-button" disabled={createMutation.isPending}>
              Generate token
            </button>
          </form>

          {revealedToken && (
            <div
              ref={revealRef}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                padding: "16px",
                border: "1px solid var(--bl-line)",
                borderRadius: "3px",
                background: "var(--bl-surface)",
              }}
            >
              <p className="bl-mono">
                Copy this config now - for your security, the token won't be shown again after
                you leave this page.
              </p>
              <textarea
                readOnly
                value={mcpApi.mcpClientConfigSnippet(revealedToken.token)}
                onFocus={(e) => e.target.select()}
                className="bl-input bl-mono"
                rows={7}
                style={{ resize: "vertical" }}
              />
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" className="bl-button" onClick={copyConfig}>
                  {copiedConfig ? "Copied" : "Copy config"}
                </button>
                <button
                  type="button"
                  className="bl-quiet"
                  onClick={() => setRevealedToken(null)}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {activeTokens.length > 0 && (
        <section className="bl-attention bl-settings-section">
          <header>
            <h2>Connected</h2>
          </header>
          <div style={{ flex: 1, padding: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {activeTokens.map((token) => (
                <div
                  key={token.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px",
                    border: "1px solid var(--bl-line)",
                    borderRadius: "3px",
                    background: "var(--bl-surface)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 500 }}>
                      {token.label}
                      {token.agent_hint && (
                        <span className="bl-scope-badge" style={{ marginLeft: 8 }}>
                          {token.agent_hint}
                        </span>
                      )}
                    </div>
                    <div className="bl-mono" style={{ fontSize: "11px" }}>
                      {token.last_used_at
                        ? `Last used ${formatRelativeTime(token.last_used_at)}`
                        : "Never used"}
                    </div>
                  </div>
                  <button
                    className="bl-quiet"
                    style={{ color: "var(--bl-error)", borderColor: "transparent", padding: "4px 8px" }}
                    onClick={() => revokeMutation.mutate(token.id)}
                    disabled={revokeMutation.isPending}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
