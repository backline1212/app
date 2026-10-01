import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyArt } from "../../components/illustrations";
import { LoadingScreen } from "../../components/LoadingScreen";
import { API_BASE_URL } from "../../lib/api-client";
import { formatRelativeTime } from "../../lib/date-format";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import * as extensionTokensApi from "../extension-tokens/api";
import * as mcpApi from "../mcp/api";
import { MCP_CLIENT_BY_ID } from "../mcp/clients";
import type { WorkspaceOut } from "../workspaces/api";

// One place to see and revoke every credential you hold in this workspace. There are
// two kinds, issued by different backends:
// - API keys are extension tokens (modules/extension_tokens). get_current_session
//   accepts one as `Authorization: Bearer` on any member endpoint, so the same key
//   powers the browser extension and scripts calling the REST API.
// - MCP tokens (modules/mcp) only authenticate the /mcp server. They are created on the
//   MCP Server page, which also writes the per-client setup, so this page lists and
//   revokes them but links there to create one.
// Both kinds act as the member who created them, with that member's role.

type KeyRow =
  | { kind: "api"; id: string; name: string; createdAt: string; lastUsedAt: string | null }
  | { kind: "mcp"; id: string; name: string; createdAt: string; lastUsedAt: string | null; detail: string };

const API_ROOT = `${API_BASE_URL.replace(/\/+$/, "")}/api/v1`;
const KEY_PLACEHOLDER = "<your-api-key>";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy(key: string, text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(null), 1600);
      return true;
    } catch {
      return false;
    }
  }
  return { copied, copy };
}

export function ApiKeysPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "API Keys"]);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [revealed, setRevealed] = useState<extensionTokensApi.ExtensionTokenIssued | null>(null);
  const [revokeCandidate, setRevokeCandidate] = useState<KeyRow | null>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const { copied, copy } = useCopy();

  const apiKeysQuery = qk.extensionTokens(workspace.id);
  const mcpKeysQuery = qk.mcpTokens(workspace.id);
  const apiKeys = useQuery({ queryKey: apiKeysQuery, queryFn: () => extensionTokensApi.listExtensionTokens(workspace.id) });
  const mcpKeys = useQuery({ queryKey: mcpKeysQuery, queryFn: () => mcpApi.listMcpTokens(workspace.id) });

  const create = useMutation({
    mutationFn: () => extensionTokensApi.createExtensionToken(workspace.id, name.trim()),
    onSuccess: (issued) => {
      setName("");
      setCopyError(false);
      setRevealed(issued);
      void queryClient.invalidateQueries({ queryKey: apiKeysQuery });
      requestAnimationFrame(() => revealRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    },
  });

  const revoke = useMutation({
    mutationFn: (row: KeyRow) =>
      row.kind === "api" ? extensionTokensApi.revokeExtensionToken(row.id) : mcpApi.revokeMcpToken(row.id),
    onSuccess: (_, row) => {
      setRevokeCandidate(null);
      if (revealed?.id === row.id) setRevealed(null);
      void queryClient.invalidateQueries({ queryKey: row.kind === "api" ? apiKeysQuery : mcpKeysQuery });
    },
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (name.trim() && !create.isPending) create.mutate();
  }

  async function copyKey() {
    if (!revealed) return;
    setCopyError(!(await copy("key", revealed.token)));
  }

  const rows: KeyRow[] = [
    ...(apiKeys.data ?? [])
      .filter((token) => !token.revoked_at)
      .map((token): KeyRow => ({
        kind: "api",
        id: token.id,
        name: token.name,
        createdAt: token.created_at,
        lastUsedAt: token.last_used_at ?? null,
      })),
    ...(mcpKeys.data ?? [])
      .filter((token) => !token.revoked_at)
      .map((token): KeyRow => ({
        kind: "mcp",
        id: token.id,
        name: token.label,
        createdAt: token.created_at,
        lastUsedAt: token.last_used_at ?? null,
        detail: [
          token.scopes?.includes(mcpApi.WRITE_SCOPE) ? "read & write" : "read only",
          token.agent_hint ? MCP_CLIENT_BY_ID.get(token.agent_hint)?.name ?? token.agent_hint : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const loading = apiKeys.isLoading || mcpKeys.isLoading;
  const loadError = apiKeys.error ?? mcpKeys.error;
  const example = `curl -H "Authorization: Bearer ${revealed?.token ?? KEY_PLACEHOLDER}" \\\n  ${API_ROOT}/extension-tokens/whoami`;

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>API keys</h1>
          <p>
            Personal credentials for {workspace.name}. Every key acts as you, with your role, and stops working the
            moment you revoke it or your role changes.
          </p>
        </div>
      </header>

      <section className="bl-attention bl-int-section">
        <header>
          <h2>Create an API key</h2>
          <span>For scripts, CI and the browser extension.</span>
        </header>
        <div className="bl-mcp-body">
          <form className="bl-mcp-form" onSubmit={handleCreate}>
            <input
              required
              maxLength={200}
              aria-label="Key name"
              placeholder="CI pipeline, staging server…"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="bl-input"
            />
            <button type="submit" className="bl-button" disabled={create.isPending || !name.trim()}>
              {create.isPending ? "Creating…" : "Create key"}
            </button>
          </form>
          {create.isError && (
            <p role="alert" className="bl-error">
              {create.error instanceof Error ? create.error.message : "Could not create a key."}
            </p>
          )}

          {revealed && (
            <div ref={revealRef} className="bl-int-secret">
              <strong>{revealed.name}: copy this key now, it won&apos;t be shown again</strong>
              <div className="bl-mcp-url">
                <input
                  readOnly
                  className="bl-input bl-mono"
                  value={revealed.token}
                  onFocus={(event) => event.target.select()}
                  aria-label="New API key"
                />
                <button type="button" className="bl-quiet" onClick={() => void copyKey()}>
                  {copied === "key" ? "Copied" : "Copy key"}
                </button>
              </div>
              {copyError && (
                <p role="alert" className="bl-error">Copying was blocked. Select the key and copy it manually.</p>
              )}
              <div>
                <button type="button" className="bl-quiet" onClick={() => setRevealed(null)}>
                  Done
                </button>
              </div>
            </div>
          )}

          <div className="bl-code-actions">
            <span className="bl-mono">Send it as a Bearer token. This request returns the key&apos;s workspace and user:</span>
            <button type="button" className="bl-quiet" onClick={() => void copy("example", example)}>
              {copied === "example" ? "Copied" : "Copy"}
            </button>
          </div>
          <pre className="bl-code">{example}</pre>
        </div>
      </section>

      <section className="bl-attention bl-int-section">
        <header>
          <h2>
            Your keys <span className="bl-count">{rows.length}</span>
          </h2>
          <span>
            API keys and <Link to={`/w/${workspace.slug}/mcp`}>MCP tokens</Link> you&apos;ve created in this workspace.
          </span>
        </header>
        {loading && <LoadingScreen inline />}
        {loadError && (
          <p role="alert" className="bl-error bl-keys-alert">
            {loadError.message}{" "}
            <button type="button" className="bl-quiet" onClick={() => { void apiKeys.refetch(); void mcpKeys.refetch(); }}>
              Try again
            </button>
          </p>
        )}
        {!loading && !loadError && rows.length === 0 && (
          <div className="bl-keys-empty">
            <EmptyArt kind="keys" />
            <p>No keys yet. Create an API key above, or an MCP token for your coding agent on the{" "}
              <Link to={`/w/${workspace.slug}/mcp`}>MCP server</Link> page.</p>
          </div>
        )}
        {rows.length > 0 && (
          <div className="bl-mcp-body bl-keys-list">
            {rows.map((row) => (
              <div key={`${row.kind}-${row.id}`} className="bl-mcp-token-row">
                <div>
                  <strong>
                    {row.name}
                    <span className={`bl-scope-badge${row.kind === "api" ? " is-api" : ""}`}>
                      {row.kind === "api" ? "API key" : "MCP"}
                    </span>
                    {row.kind === "mcp" && row.detail && <span className="bl-scope-badge">{row.detail}</span>}
                  </strong>
                  <span className="bl-mono">
                    Created {formatRelativeTime(row.createdAt)} ·{" "}
                    {row.lastUsedAt ? `last used ${formatRelativeTime(row.lastUsedAt)}` : "never used"}
                  </span>
                </div>
                <button type="button" className="bl-quiet bl-int-danger" onClick={() => setRevokeCandidate(row)}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {revokeCandidate && (
        <ConfirmDialog
          title={revokeCandidate.kind === "api" ? "Revoke this API key?" : "Revoke this MCP token?"}
          message={<>
            <p>
              {revokeCandidate.kind === "api"
                ? <>Scripts and browser extensions using <strong>{revokeCandidate.name}</strong> stop working immediately.</>
                : <>Any agent using <strong>{revokeCandidate.name}</strong> loses access to Backline immediately.</>}
            </p>
            {revoke.error && <p role="alert" className="bl-error">{revoke.error.message}</p>}
          </>}
          confirmLabel={revoke.isPending ? "Revoking…" : "Revoke"}
          destructive
          pending={revoke.isPending}
          onCancel={() => { revoke.reset(); setRevokeCandidate(null); }}
          onConfirm={() => revoke.mutate(revokeCandidate)}
        />
      )}
    </main>
  );
}
