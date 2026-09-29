import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { LoadingScreen } from "../../components/LoadingScreen";
import { formatRelativeTime } from "../../lib/date-format";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import * as mcpApi from "../mcp/api";
import { MCP_CLIENTS, MCP_CLIENT_BY_ID, MCP_TOOLS, TOKEN_PLACEHOLDER } from "../mcp/clients";
import type { WorkspaceOut } from "./api";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
    } catch {
      setCopied(null);
    }
  }
  return { copied, copy };
}

// A real Backline-hosted MCP server (docs/implementation/slack-ai-mcp-architecture.md
// §2, TDR-0046) - no OAuth dance, since Backline has no app-review relationship with
// any of these tools. A member mints a personal access token here and pastes it into
// their own tool's MCP config; the agent then works on this workspace's tickets as
// that member, within the token's access and the member's role.
export function McpServerPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "MCP Server"]);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [label, setLabel] = useState("");
  const [access, setAccess] = useState<mcpApi.McpAccess>("read_write");
  const [revealed, setRevealed] = useState<mcpApi.McpTokenIssued | null>(null);
  const [revokeCandidate, setRevokeCandidate] = useState<mcpApi.McpTokenOut | null>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const { copied, copy } = useCopy();

  const clientId = searchParams.get("client");
  const client = MCP_CLIENT_BY_ID.get((clientId ?? "claude") as mcpApi.AgentHint) ?? MCP_CLIENTS[0];
  const chooseClient = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("client", id);
    setSearchParams(next, { replace: true });
  };

  const queryKey = qk.mcpTokens(workspace.id);
  const tokens = useQuery({ queryKey, queryFn: () => mcpApi.listMcpTokens(workspace.id) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: () =>
      mcpApi.createMcpToken(workspace.id, { label: label.trim(), agentHint: client.id, access }),
    onSuccess: (issued) => {
      setLabel("");
      setRevealed(issued);
      void invalidate();
      requestAnimationFrame(() => revealRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
  });
  const revoke = useMutation({
    mutationFn: (tokenId: string) => mcpApi.revokeMcpToken(tokenId),
    onSuccess: () => {
      setRevokeCandidate(null);
      void invalidate();
    },
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (label.trim()) create.mutate();
  }

  const token = revealed?.token ?? TOKEN_PLACEHOLDER;
  const snippets = client.snippets(mcpApi.MCP_SERVER_URL, token);
  const activeTokens = (tokens.data ?? []).filter((item) => !item.revoked_at);

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>MCP Server</h1>
          <p>
            Connect Claude Code, Cursor, Codex, Antigravity or any MCP client to Backline. Your agent can read open
            feedback, get a ready-to-work brief for any ticket, reply on the thread and move it to review when the fix
            is in.
          </p>
        </div>
      </header>

      <section className="bl-attention bl-int-section">
        <header>
          <h2>1. Create a token</h2>
          <span>Tokens act as you, in {workspace.name}. Revoke one any time.</span>
        </header>
        <div className="bl-mcp-body">
          <form className="bl-mcp-form" onSubmit={handleCreate}>
            <input
              required
              maxLength={200}
              placeholder={`My laptop - ${client.name}`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="bl-input"
              aria-label="Token name"
            />
            <div className="bl-segment" role="group" aria-label="Access">
              <button type="button" aria-pressed={access === "read_write"} onClick={() => setAccess("read_write")}>
                Read &amp; write
              </button>
              <button type="button" aria-pressed={access === "read"} onClick={() => setAccess("read")}>
                Read only
              </button>
            </div>
            <button type="submit" className="bl-button" disabled={create.isPending || !label.trim()}>
              {create.isPending ? "Creating…" : `Create token for ${client.name}`}
            </button>
          </form>
          <p className="bl-mono">
            {access === "read_write"
              ? "Read & write: the agent can also reply on tickets, change status/priority and file tickets in connected trackers."
              : "Read only: the agent can list and read tickets and build implementation prompts, nothing else."}
          </p>
          {create.isError && (
            <p role="alert" className="bl-error">
              {create.error instanceof Error ? create.error.message : "Could not create a token."}
            </p>
          )}
          {revealed && (
            <div ref={revealRef} className="bl-int-secret">
              <strong>Your new token - copy it now, it won't be shown again</strong>
              <div className="bl-mcp-url">
                <input
                  readOnly
                  className="bl-input bl-mono"
                  value={revealed.token}
                  onFocus={(event) => event.target.select()}
                  aria-label="New token"
                />
                <button type="button" className="bl-quiet" onClick={() => void copy("token", revealed.token)}>
                  {copied === "token" ? "Copied" : "Copy token"}
                </button>
              </div>
              <p className="bl-mono">The setup below already includes it. Leaving this page hides it for good.</p>
              <div>
                <button type="button" className="bl-quiet" onClick={() => setRevealed(null)}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="bl-attention bl-int-section">
        <header>
          <h2>2. Add Backline to your agent</h2>
          <span>Server: {mcpApi.MCP_SERVER_URL}</span>
        </header>
        <div className="bl-mcp-body">
          <div className="bl-mcp-clients">
            <nav className="bl-tabs" aria-label="MCP client">
              {MCP_CLIENTS.map((item) => (
                <button key={item.id} type="button" aria-pressed={item.id === client.id} onClick={() => chooseClient(item.id)}>
                  {item.name}
                </button>
              ))}
            </nav>
            <div className="bl-mcp-client">
              <p>{client.intro}</p>
              {!revealed && (
                <p className="bl-mono">
                  Showing {TOKEN_PLACEHOLDER} - create a token above and it's filled in here.
                </p>
              )}
              {snippets.map((snippet) => (
                <div key={snippet.label} className="bl-mcp-client">
                  <div className="bl-code-actions">
                    <span className="bl-mono">{snippet.label}</span>
                    <button
                      type="button"
                      className="bl-quiet"
                      onClick={() => void copy(snippet.label, snippet.code)}
                    >
                      {copied === snippet.label ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="bl-code">{snippet.code}</pre>
                </div>
              ))}
              {client.install && revealed && (
                <div className="bl-code-actions">
                  <a className="bl-button" href={client.install.href(mcpApi.MCP_SERVER_URL, revealed.token)}>
                    {client.install.label}
                  </a>
                  <span className="bl-mono">Opens {client.name} with Backline pre-filled.</span>
                </div>
              )}
              <p>{client.after}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bl-attention bl-int-section">
        <header>
          <h2>What your agent can do</h2>
          <span>Every call acts as you and follows your workspace role.</span>
        </header>
        <div className="bl-mcp-body">
          <div className="bl-mcp-tools">
            {MCP_TOOLS.map((tool) => (
              <div key={tool.name} className="bl-mcp-tool">
                <strong>
                  {tool.name}
                  {tool.write && <span className="bl-scope-badge">write</span>}
                </strong>
                {tool.description}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bl-attention bl-int-section">
        <header>
          <h2>
            Your tokens <span className="bl-count">{activeTokens.length}</span>
          </h2>
        </header>
        {tokens.isLoading && <LoadingScreen inline />}
        {tokens.isError && (
          <p role="alert" className="bl-error" style={{ margin: 16 }}>
            {tokens.error instanceof Error ? tokens.error.message : "Could not load MCP tokens."}
          </p>
        )}
        {tokens.isSuccess && activeTokens.length === 0 && (
          <p className="bl-mono" style={{ padding: 16 }}>
            No tokens yet.
          </p>
        )}
        <div className="bl-mcp-body" style={{ padding: 0, gap: 0 }}>
          {activeTokens.map((item) => {
            const writes = item.scopes?.includes(mcpApi.WRITE_SCOPE);
            return (
              <div key={item.id} className="bl-mcp-token-row">
                <div>
                  <strong>
                    {item.label}
                    <span className="bl-scope-badge">{writes ? "read & write" : "read only"}</span>
                    {item.agent_hint && (
                      <span className="bl-scope-badge">{MCP_CLIENT_BY_ID.get(item.agent_hint)?.name ?? item.agent_hint}</span>
                    )}
                  </strong>
                  <span className="bl-mono">
                    Created {formatRelativeTime(item.created_at)} ·{" "}
                    {item.last_used_at ? `last used ${formatRelativeTime(item.last_used_at)}` : "never used"}
                  </span>
                </div>
                <button
                  type="button"
                  className="bl-quiet bl-int-danger"
                  onClick={() => setRevokeCandidate(item)}
                  disabled={revoke.isPending}
                >
                  Revoke
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {revokeCandidate && (
        <ConfirmDialog
          title="Revoke token?"
          message={
            <>
              Any agent using <strong>{revokeCandidate.label}</strong> loses access to Backline immediately.
            </>
          }
          confirmLabel={revoke.isPending ? "Revoking…" : "Revoke token"}
          destructive
          pending={revoke.isPending}
          onCancel={() => setRevokeCandidate(null)}
          onConfirm={() => revoke.mutate(revokeCandidate.id)}
        />
      )}
    </main>
  );
}
