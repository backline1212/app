import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import { formatRelativeTime } from "../../lib/date-format";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import type { WorkspaceOut } from "../workspaces/api";
import * as extensionTokensApi from "./api";

export function ExtensionSettingsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle("Browser Extension");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  const queryKey = qk.extensionTokens(workspace.id);
  const { data: tokens, isLoading, error: listError } = useQuery({
    queryKey,
    queryFn: () => extensionTokensApi.listExtensionTokens(workspace.id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  // Shown exactly once, right after creation - the backend never returns the raw
  // token again after this (ExtensionTokenOut omits it), matching how any other
  // API-key-style secret only ever surfaces at issue time.
  const [revealedToken, setRevealedToken] = useState<extensionTokensApi.ExtensionTokenIssued | null>(
    null,
  );

  const createMutation = useMutation({
    mutationFn: () => extensionTokensApi.createExtensionToken(workspace.id, name.trim()),
    onSuccess: (issued) => {
      setName("");
      setError(null);
      setRevealedToken(issued);
      setCopied(false);
      invalidate();
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not create a token."),
  });

  const revokeMutation = useMutation({
    mutationFn: (tokenId: string) => extensionTokensApi.revokeExtensionToken(tokenId),
    onSuccess: invalidate,
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
      setError("Select the token and copy it manually.");
    }
  }

  const activeTokens = (tokens ?? []).filter((t) => !t.revoked_at);

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>Browser Extension</h1>
          <p>
            Connect the Backline browser extension so you can leave comments on any site
            without opening the dashboard first.
          </p>
        </div>
      </header>

      {error && <div className="bl-error">{error}</div>}
      {listError && (
        <p role="alert" className="bl-error">
          {listError instanceof Error ? listError.message : "Could not load extension tokens."}
        </p>
      )}
      {isLoading && <LoadingScreen />}

      {revealedToken && (
        <section className="bl-attention bl-settings-section">
          <header>
            <h2>Copy your token</h2>
          </header>
          <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <p className="bl-mono">
              Paste this into the Backline extension's popup to connect it. For your security,
              it won't be shown again after you leave this page.
            </p>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                readOnly
                value={revealedToken.token}
                onFocus={(event) => event.target.select()}
                className="bl-input"
                style={{ flex: 1, fontFamily: "monospace" }}
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
        </section>
      )}

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Connect a new extension</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <p className="bl-mono">
            Give it a name you'll recognize later, like "Work laptop - Chrome".
          </p>
          <form onSubmit={handleCreate} style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <input
              required
              placeholder="Work laptop - Chrome"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="bl-input"
              style={{ flex: 1 }}
            />
            <button type="submit" className="bl-button" disabled={createMutation.isPending}>
              Generate token
            </button>
          </form>
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
