import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { LoadingScreen } from "../../components/LoadingScreen";
import { API_BASE_URL } from "../../lib/api-client";
import { formatRelativeTime } from "../../lib/date-format";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import type { WorkspaceOut } from "../workspaces/api";
import { ExtensionReadiness } from "../review/ExtensionReadiness";
import * as extensionTokensApi from "./api";

export function ExtensionSettingsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "Browser Extension"]);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [revokeCandidate, setRevokeCandidate] = useState<extensionTokensApi.ExtensionTokenOut | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 15_000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);

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
  // The reveal box renders right where the "Generate token" button is (below), but a
  // long "Connected" list can still push it out of view on a short window - scrolled
  // into view explicitly rather than relying on it simply being on-screen already.
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
      setError(err instanceof Error ? err.message : "Could not create a token."),
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
      setError("Select the token and copy it manually.");
    }
  }

  const unrevokedTokens = (tokens ?? []).filter((token) => !token.revoked_at);
  const activeTokens = unrevokedTokens.filter((token) => Date.parse(token.expires_at) > now);
  const expiredCount = unrevokedTokens.length - activeTokens.length;

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>Browser Extension</h1>
          <p>
            Review the real website with your normal login. Saved comments and screenshots stay in Backline.
          </p>
        </div>
      </header>

      {error && <div className="bl-error">{error}</div>}
      {listError && (
        <p role="alert" className="bl-error">
          {listError instanceof Error ? listError.message : "Could not load extension tokens."}
        </p>
      )}
      {isLoading && <LoadingScreen inline />}

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>1. Install or update the extension</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <p>Available for desktop Chrome and Edge. Installation is manual for now.</p>
          <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", lineHeight: 1.6 }}>
            <li>Download and unzip the file below.</li>
            <li>
              In Chrome, go to <code>chrome://extensions</code> and turn on Developer mode
              (top right).
            </li>
            <li>Click "Load unpacked" and select the unzipped folder.</li>
          </ol>
          <p>Already installed? Replace the files in the folder you loaded, click Reload on its extension card, then reload your Backline tabs. In Edge, use <code>edge://extensions</code>.</p>
          <a
            href={`${API_BASE_URL}/extension/backline-extension.zip`}
            className="bl-button"
            style={{ display: "inline-block", width: "fit-content", textDecoration: "none" }}
          >
            Download extension (.zip)
          </a>
          <ExtensionReadiness />
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header><h2>2. Open a project and start review</h2></header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "12px" }}>
          <p>Choose <strong>Open with extension</strong> in your project. Backline connects the review automatically; you don't need to generate or paste a token.</p>
          <p>Sign in to the website using your own account if needed. Leave feedback with the Backline toolbar, then choose <strong>Return to Backline</strong> to see the saved ticket.</p>
          <Link className="bl-button" to={`/w/${workspace.slug}`}>Choose a project</Link>
        </div>
      </section>

      <details className="bl-extension-advanced">
        <summary>Standalone connection (optional)</summary>
      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Review without opening a project first</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <p className="bl-mono">
            Only use this if you want to start directly from the extension popup.
            Generate a token and paste it into the popup. It expires after 30 days.
          </p>
          <form onSubmit={handleCreate} style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
            <input
              required
              maxLength={200}
              aria-label="Token name"
              placeholder="Work laptop - Chrome"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="bl-input"
              style={{ flex: 1, minWidth: "180px" }}
            />
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
                Copy this now - for your security, it won't be shown again after you leave
                this page.
              </p>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input
                  readOnly
                  aria-label="New standalone extension token"
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
      </details>

      {activeTokens.length > 0 && (
        <section className="bl-attention bl-settings-section">
          <header>
            <h2>Active review access</h2>
          </header>
          <div style={{ flex: 1, padding: "20px" }}>
            <p>These tokens authorize review access. This list does not indicate whether a website tab is connected. Revoking access keeps the saved feedback.</p>
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
                    <div className="bl-mono" style={{ fontSize: "11px" }}>
                      {token.project_id ? "Project review" : "Standalone extension"} · Expires {new Date(token.expires_at).toLocaleString()}
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
      {expiredCount > 0 && <p className="bl-mono">{expiredCount} expired {expiredCount === 1 ? "token no longer grants" : "tokens no longer grant"} access. Open a project to start a fresh review.</p>}

      {revokeCandidate && (
        <ConfirmDialog
          title="Revoke this token?"
          message={<>
            <p>The extension signed in with <strong>{revokeCandidate.name}</strong> stops working at once. You can generate a new token any time.</p>
            {revokeMutation.error && <p role="alert" className="bl-error">{revokeMutation.error.message}</p>}
          </>}
          confirmLabel={revokeMutation.isPending ? "Revoking…" : "Revoke token"}
          destructive
          pending={revokeMutation.isPending}
          onCancel={() => { revokeMutation.reset(); setRevokeCandidate(null); }}
          onConfirm={() => revokeMutation.mutate(revokeCandidate.id)}
        />
      )}
    </main>
  );
}
