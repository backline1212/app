import type { NativeReviewAuth, NativeReviewStatus } from "@backline/types";
import { type Ref, useEffect, useRef, useState } from "react";

import { Dialog } from "../../components/Dialog";
import { API_BASE_URL, ApiError } from "../../lib/api-client";
import { useOnlineStatus } from "../../lib/use-online-status";
import { createExtensionToken, revokeExtensionToken } from "../extension-tokens/api";
import { ExtensionError, extensionRequest, isExtensionContextInvalidated, reviewExtensionProblem } from "./review-extension";

interface Props {
  projectId: string;
  url: string;
  member?: { workspaceId: string; userId: string };
  guest?: Extract<NativeReviewAuth, { kind: "guest" }>;
  onGuestSessionExpired?: () => void;
  triggerRef?: Ref<HTMLButtonElement>;
}

type Phase = "checking" | "setup" | "reload" | "opening" | "connected" | "error";

export function NativeReviewButton({ projectId, url, member, guest, onGuestSessionExpired, triggerRef }: Props) {
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState("");
  const [needsRejoin, setNeedsRejoin] = useState(false);
  const [browserAddress, setBrowserAddress] = useState("chrome://extensions");
  const [copied, setCopied] = useState(false);
  const [hasConnected, setHasConnected] = useState(false);
  const active = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const launchScope = `${projectId}|${url}|${member?.workspaceId ?? ""}|${member?.userId ?? ""}|${guest?.token ?? ""}`;

  useEffect(() => {
    setOpen(false);
    setHasConnected(false);
    return () => { requestGeneration.current += 1; active.current?.abort(); active.current = null; };
  }, [launchScope]);

  function close() {
    requestGeneration.current += 1;
    active.current?.abort();
    active.current = null;
    setOpen(false);
  }

  async function start() {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const generation = ++requestGeneration.current;
    const current = () => !controller.signal.aborted && requestGeneration.current === generation;
    setOpen(true);
    setPhase("checking");
    setMessage("");
    setNeedsRejoin(false);
    let issuedId: string | null = null;
    let connected = false;
    try {
      let status: NativeReviewStatus;
      try { status = await extensionRequest<NativeReviewStatus>("status", undefined, controller.signal); }
      catch (error) {
        if (!current()) return;
        setPhase(isExtensionContextInvalidated(error) ? "reload" : "setup");
        setMessage(error instanceof Error ? error.message : "Install the extension to continue.");
        return;
      }
      if (!current()) return;
      const problem = reviewExtensionProblem(status);
      if (problem) {
        setPhase("setup");
        setMessage(problem);
        return;
      }
      if (!online) throw new Error("You're offline. Reconnect, then choose Try again.");
      setPhase("opening");
      let auth: NativeReviewAuth | undefined = guest;
      if (!guest && member) {
        const issued = await createExtensionToken(member.workspaceId, "Browser review", projectId);
        issuedId = issued.id;
        auth = { kind: "member", token: issued.token };
      }
      if (!current()) return;
      await extensionRequest("launch", { projectId, url, returnUrl: window.location.href, auth }, controller.signal);
      if (!current()) return;
      connected = true;
      setHasConnected(true);
      setPhase("connected");
    } catch (error) {
      if (!current()) return;
      setPhase(isExtensionContextInvalidated(error) ? "reload" : "error");
      const status = error instanceof ApiError || error instanceof ExtensionError ? error.status : 0;
      setNeedsRejoin(Boolean(guest && [401, 403, 404].includes(status)));
      setMessage(error instanceof Error ? error.message : "Browser review couldn't connect. Try again.");
    } finally {
      if (active.current === controller) active.current = null;
      // Cancelled or late responses cannot retain an undisclosed launch credential.
      if (issuedId && !connected) await revokeExtensionToken(issuedId).catch(() => undefined);
    }
  }

  async function copyBrowserAddress() {
    try { await navigator.clipboard.writeText(browserAddress); setCopied(true); }
    catch { setCopied(false); }
  }

  const busy = phase === "checking" || phase === "opening";
  return <>
    <button ref={triggerRef} type="button" className="bl-review-control bl-button" onClick={() => void start()} disabled={open && busy}>
      {hasConnected ? "Open website review again" : "Open with extension"}
    </button>
    {open && <Dialog title={phase === "reload" ? "Reconnect browser review" : phase === "setup" ? "Set up browser review" : phase === "connected" ? "Website review connected" : "Open website review"} onClose={close}>
      <div className="bl-dialog-intro"><p>Your website opens in a separate tab. Keep Backline open for saved feedback.</p></div>
      <div className="bl-browser-flow" aria-busy={busy}>
        <ol className="bl-review-steps" aria-label="Browser review steps">
          <li aria-current={phase === "setup" || phase === "reload" || phase === "checking" ? "step" : undefined}>Connect extension</li>
          <li aria-current={phase === "opening" ? "step" : undefined}>Open website</li>
          <li aria-current={phase === "connected" ? "step" : undefined}>Leave feedback</li>
        </ol>
        {busy && <p role="status">{phase === "checking" ? "Checking your browser extension…" : "Opening the website and waiting for its Backline toolbar…"}</p>}
        {phase === "setup" && <>
          <p>{message}</p><p>One-time setup in desktop Chrome or Edge:</p>
          <ol><li><a href={`${API_BASE_URL}/extension/backline-extension.zip`}>Download the extension</a> and unzip it.</li>
            <li>Open the extensions page below, turn on Developer mode and choose Load unpacked.</li>
            <li>Select the unzipped folder, then return here and choose Check again.</li></ol>
          <label>Browser<select className="bl-input" value={browserAddress} onChange={event => { setBrowserAddress(event.target.value); setCopied(false); }}><option value="chrome://extensions">Chrome</option><option value="edge://extensions">Edge</option></select></label>
          <div className="bl-link-row"><input className="bl-input bl-mono" aria-label="Extensions page address" readOnly value={browserAddress} onFocus={event => event.target.select()} /><button type="button" className="bl-quiet" onClick={() => void copyBrowserAddress()}>{copied ? "Copied" : "Copy address"}</button></div>
          <small>Paste this address into your browser's address bar. For an existing installation, replace its files and click Reload on its extension card. Reload Backline if it still cannot connect.</small>
        </>}
        {phase === "error" && <p role="alert" className="bl-error">{message}</p>}
        {phase === "reload" && <p role="status">Your extension was updated. Reload this Backline tab to reconnect, then open website review again. Your saved feedback stays in this project.</p>}
        {phase === "connected" && <p role="status">The Backline toolbar is connected in your website tab.</p>}
        {phase !== "setup" && phase !== "reload" && <ol><li>Sign in to the website using your own account if needed.</li><li>Choose Comment to see saved pins and add feedback, or Draw to select an area.</li><li>Write your feedback and save. Use Return to Backline to see the saved ticket.</li></ol>}
        <p className="bl-policy-note">A Backline review link doesn't sign you in to the website or give access to another person's website account.</p>
      </div>
      <footer className="bl-dialog-actions bl-dialog-actions-bordered">
        <button type="button" className="bl-quiet" onClick={close}>{busy ? "Stop waiting" : phase === "connected" ? "Done" : "Close"}</button>
        {phase === "reload" && <button type="button" className="bl-button" onClick={() => window.location.reload()}>Reload Backline</button>}
        {!busy && phase !== "connected" && phase !== "reload" && (needsRejoin && onGuestSessionExpired
          ? <button type="button" className="bl-button" onClick={() => { close(); onGuestSessionExpired(); }}>Rejoin review</button>
          : <button type="button" className="bl-button" disabled={!online} onClick={() => void start()}>{phase === "setup" ? "Check again" : "Try again"}</button>)}
      </footer>
    </Dialog>}
  </>;
}
