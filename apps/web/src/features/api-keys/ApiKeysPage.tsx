import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { LoadingScreen } from "../../components/LoadingScreen";
import { formatRelativeTime } from "../../lib/date-format";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import type { WorkspaceOut } from "../workspaces/api";
import * as extensionTokensApi from "../extension-tokens/api";

// The API Keys page unifies the workspace's extension tokens and MCP tokens into a
// single view. Extension tokens are the production credentials: they authenticate the
// browser extension and any programmatic access. This page intentionally mirrors the
// ExtensionSettingsPage patterns (reveal-once, copy, revoke) because both pages
// manage the same underlying resource; the difference is the label/context.

export function ApiKeysPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "API Keys"]);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [revokeCandidate, setRevokeCandidate] = useState<extensionTokensApi.ExtensionTokenOut | null>(null);

  const queryKey = qk.extensionTokens(workspace.id);
  const { data: tokens, isLoading, error: listError } = useQuery({
    queryKey,
    queryFn: () => extensionTokensApi.listExtensionTokens(workspace.id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const [revealedToken, setRevealedToken] = useState<extensionTokensApi.ExtensionTokenIssued | null>(null);
  const revealRef = useRef<HTMLDivElement>(null);

  const createMutation = useMutation({
    mutationFn: () => extensionTokensApi.createExtensionToken(workspace.id, name.trim()),
    onSuccess: (issued) => {
      setName("");
      setError(null);
      setRevealedToken(issued);
      setCopied(false);
      invalidate();
      requestAnimationFrame(() => revealRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not create a key."),
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => extensionTokensApi.revokeExtensionToken(tokenId),
    onSuccess: () => {
      setRevokeCandidate(null);
      void invalidate();
    },
  });

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate();
  }

  async function copyToken() {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(revealedToken.token);
      setCopied(true);
    } catch {
      setError("Select the key and copy it manually.");
    }
  }

  const activeTokens = (tokens ?? []).filter((t) => !t.revoked_at);

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>API Keys</h1>
          <p>
            Generate and manage API keys for your workspace. Keys authenticate the browser extension, MCP agents, and
            any custom integration that calls the Backline API.
          </p>
        </div>
      </header>

      {error && <div className="bl-error">{error}</div>}
      {listError && (
        <p role="alert" className="bl-error">
          {listError instanceof Error ? listError.message : "Could not load API keys."}
        </p>
      )}
      {isLoading && <LoadingScreen inline />}

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Generate Key</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <p className="bl-mono">
            Give each key a descriptive name so you can identify it later.
          </p>
          <form onSubmit={handleCreate} style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
            <input
              required
              maxLength={200}
              aria-label="Key name"
              placeholder="E.g., CI pipeline, staging server"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="bl-input"
              style={{ flex: 1, minWidth: "180px" }}
            />
            <button type="submit" className="bl-button" disabled={createMutation.isPending}>
              Generate key
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
                Copy this now — for your security, it won't be shown again after you leave this page.
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input
                  readOnly
                  value={revealedToken.token}
                  onFocus={(event) => event.target.select()}
                  className="bl-input"
                  style={{ flex: 1, minWidth: "180px", fontFamily: "monospace" }}
                />
                <button type="button" className="bl-button" onClick={copyToken}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button
                type="button"
                className="bl-quiet"
                style={{ alignSelf: "flex-start" }}
                onClick={() => setRevealedToken(null)}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </section>

      {activeTokens.length > 0 && (
        <section className="bl-attention bl-settings-section">
          <header>
            <h2>Active Keys <span className="bl-count">{activeTokens.length}</span></h2>
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
                    <div style={{ fontSize: "13px", fontWeight: 500 }}>{token.name}</div>
                    <div className="bl-mono" style={{ fontSize: "11px" }}>
                      {token.last_used_at
                        ? `Last used ${formatRelativeTime(token.last_used_at)}`
                        : "Never used"}
                    </div>
                  </div>
                  <button
                    className="bl-quiet"
                    style={{ color: "var(--bl-error)", borderColor: "transparent", padding: "4px 8px" }}
                    onClick={() => setRevokeCandidate(token)}
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {revokeCandidate && (
        <ConfirmDialog
          title="Revoke this key?"
          message={<>
            <p>Anything authenticated with <strong>{revokeCandidate.name}</strong> will stop working immediately. You can generate a new key any time.</p>
            {revokeMutation.error && <p role="alert" className="bl-error">{revokeMutation.error.message}</p>}
          </>}
          confirmLabel={revokeMutation.isPending ? "Revoking…" : "Revoke key"}
          destructive
          pending={revokeMutation.isPending}
          onCancel={() => { revokeMutation.reset(); setRevokeCandidate(null); }}
          onConfirm={() => revokeMutation.mutate(revokeCandidate.id)}
        />
      )}
    </main>
  );
}
