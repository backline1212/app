import type { Schemas } from "@backline/types";
import { useState } from "react";

import { apiFetch } from "../../lib/api-client";
import { useAuth } from "./AuthContext";

type Preview = Schemas["AccountDeletionPreviewOut"];

/**
 * Delete my account (TDR-0214): shows what happens to each workspace, then confirms with
 * a code sent to the account's email. Owning a workspace other people use blocks it
 * until ownership is transferred.
 */
export function DeleteAccountSection() {
  const { logout } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [stage, setStage] = useState<"idle" | "review" | "code">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const start = () => run(async () => {
    setPreview(await apiFetch<Preview>("/api/v1/auth/me/delete"));
    setStage("review");
  });
  const sendCode = () => run(async () => {
    await apiFetch<void>("/api/v1/auth/me/delete/code", { method: "POST" });
    setStage("code");
  });
  const confirm = () => run(async () => {
    await apiFetch<void>("/api/v1/auth/me/delete", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
    await logout();
    window.location.assign("/login?deleted=1");
  });

  return (
    <div className="bl-acct-danger">
      <p className="bl-acct-lbl">Delete account</p>
      {stage === "idle" && (
        <>
          <p className="bl-acct-hint">Removes your name, email and sign-in from Backline. Your comments stay in their threads as "Deleted user".</p>
          <div className="bl-acct-inline"><button type="button" className="bl-quiet bl-danger-text" disabled={busy} onClick={() => void start()}>{busy ? "Checking…" : "Delete my account…"}</button></div>
        </>
      )}
      {stage !== "idle" && preview && (
        <div className="bl-acct-delete-plan">
          {preview.blocking.length > 0 ? (
            <p role="alert" className="bl-acct-err">
              You own {preview.blocking.map((w) => w.name).join(", ")}, which other people use. Make someone else the owner first (Team → their name → Make owner).
            </p>
          ) : (
            <ul>
              {preview.closing.map((w) => <li key={w.workspace_id}><b>{w.name}</b> closes: you're its only member. Its {w.projects} project{w.projects === 1 ? "" : "s"}, files and comments are deleted after {preview.purge_after_days} days; review links stop working now.</li>)}
              {preview.leaving.map((w) => <li key={w.workspace_id}>You leave <b>{w.name}</b>; its team keeps everything.</li>)}
              {preview.closing.length + preview.leaving.length === 0 && <li>You aren't in any workspace.</li>}
            </ul>
          )}
          {preview.blocking.length === 0 && stage === "review" && (
            <div className="bl-acct-inline">
              <button type="button" className="bl-quiet" disabled={busy} onClick={() => setStage("idle")}>Cancel</button>
              <button type="button" className="bl-button bl-danger" disabled={busy} onClick={() => void sendCode()}>{busy ? "Sending…" : "Email me a confirmation code"}</button>
            </div>
          )}
          {stage === "code" && (
            <>
              <label className="bl-nt-field">
                <span>Code from the email</span>
                <input className="bl-acct-in" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              </label>
              <div className="bl-acct-inline">
                <button type="button" className="bl-quiet" disabled={busy} onClick={() => { setStage("idle"); setCode(""); }}>Cancel</button>
                <button type="button" className="bl-button bl-danger" disabled={busy || code.length !== 6} onClick={() => void confirm()}>{busy ? "Deleting…" : "Delete my account"}</button>
              </div>
            </>
          )}
          {stage === "review" && preview.blocking.length > 0 && <div className="bl-acct-inline"><button type="button" className="bl-quiet" onClick={() => setStage("idle")}>Close</button></div>}
        </div>
      )}
      {error && <p role="alert" className="bl-acct-err">{error}</p>}
    </div>
  );
}
