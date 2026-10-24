import type { NativeReviewAuth, NativeReviewLaunchResult, NativeReviewStatus } from "@backline/types";
import { type Ref, useEffect, useRef, useState } from "react";

import { Dialog } from "../../components/Dialog";
import { ApiError } from "../../lib/api-client";
import { EXTENSION_DOWNLOAD_URL } from "./extension-download";
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

type Phase = "checking" | "setup" | "update" | "reload" | "opening" | "waiting" | "connected" | "error";

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
    setHasConnected(false);
    let issuedId: string | null = null;
    let launchAttempted = false;
    let credentialRetained = false;
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
        setPhase("update");
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
      launchAttempted = true;
      const result = await extensionRequest<NativeReviewLaunchResult>("launch", { projectId, url, returnUrl: window.location.href, auth }, controller.signal);
      credentialRetained = true;
      if (!current()) return;
      setHasConnected(result.ready);
      setPhase(result.ready ? "connected" : "waiting");
    } catch (error) {
      credentialRetained = launchAttempted && (error instanceof ExtensionError && error.timedOut
        || error instanceof DOMException && error.name === "AbortError");
      if (!current()) return;
      if (credentialRetained) {
        setHasConnected(false);
        setPhase("waiting");
        return;
      }
      setPhase(isExtensionContextInvalidated(error) ? "reload" : "error");
      const status = error instanceof ApiError || error instanceof ExtensionError ? error.status : 0;
      setNeedsRejoin(Boolean(guest && [401, 403, 404].includes(status)));
      setMessage(error instanceof Error ? error.message : "Browser review couldn't connect. Try again.");
    } finally {
      if (active.current === controller) active.current = null;
      // Revoke only when launch definitively failed before the extension could
      // accept the credential; a timeout/closed dialog may still have opened it.
      if (issuedId && !credentialRetained) await revokeExtensionToken(issuedId).catch(() => undefined);
    }
  }

  async function copyBrowserAddress() {
    try { await navigator.clipboard.writeText(browserAddress); setCopied(true); }
    catch { setCopied(false); }
  }

  const busy = phase === "checking" || phase === "opening";
  return <>
    <button ref={triggerRef} type="button" className="bl-review-control bl-button" onClick={() => void start()} disabled={open && (busy || phase === "waiting")}>
      {hasConnected ? "Open website review again" : "Open with extension"}
    </button>
    {open && <Dialog title={phase === "reload" ? "Reconnect browser review" : phase === "update" ? "Update browser extension" : phase === "setup" ? "Set up browser review" : phase === "connected" ? "Website review connected" : phase === "waiting" ? "Finish website sign-in" : "Open website review"} onClose={close}>
      <div className="bl-dialog-intro"><p>Your website opens in a separate tab. Keep Backline open for saved feedback.</p></div>
      <div className="bl-browser-flow" aria-busy={busy}>
        <ol className="bl-review-steps" aria-label="Browser review steps">
          <li aria-current={phase === "setup" || phase === "update" || phase === "reload" || phase === "checking" ? "step" : undefined}>Connect extension</li>
          <li aria-current={phase === "opening" || phase === "waiting" ? "step" : undefined}>Open website</li>
          <li aria-current={phase === "connected" ? "step" : undefined}>Leave feedback</li>
        </ol>
        {busy && <p role="status">{phase === "checking" ? "Checking your browser extension…" : "Opening the website and waiting for its Backline toolbar…"}</p>}
        {phase === "setup" && <>
          <p>{message}</p><p>One-time setup in desktop Chrome or Edge:</p>
          <ol><li><a href={EXTENSION_DOWNLOAD_URL}>Download the extension</a> and unzip it.</li>
            <li>Open the extensions page below, turn on Developer mode and choose Load unpacked.</li>
            <li>Select the unzipped folder, then reload this Backline tab and open website review again.</li></ol>
          <label>Browser<select className="bl-input" value={browserAddress} onChange={event => { setBrowserAddress(event.target.value); setCopied(false); }}><option value="chrome://extensions">Chrome</option><option value="edge://extensions">Edge</option></select></label>
          <div className="bl-link-row"><input className="bl-input bl-mono" aria-label="Extensions page address" readOnly value={browserAddress} onFocus={event => event.target.select()} /><button type="button" className="bl-quiet" onClick={() => void copyBrowserAddress()}>{copied ? "Copied" : "Copy address"}</button></div>
          <small>Paste this address into your browser's address bar. Reloading Backline lets the newly installed extension connect to this tab.</small>
        </>}
        {phase === "update" && <>
          <p>{message}</p>
          <ol><li><a href={EXTENSION_DOWNLOAD_URL}>Download the current extension</a> and unzip it.</li>
            <li>Replace the files in your existing unpacked extension folder, then click Reload on its card in your browser's extensions page.</li>
            <li>Reload this Backline tab and open website review again.</li></ol>
          <label>Browser<select className="bl-input" value={browserAddress} onChange={event => { setBrowserAddress(event.target.value); setCopied(false); }}><option value="chrome://extensions">Chrome</option><option value="edge://extensions">Edge</option></select></label>
          <div className="bl-link-row"><input className="bl-input bl-mono" aria-label="Extensions page address" readOnly value={browserAddress} onFocus={event => event.target.select()} /><button type="button" className="bl-quiet" onClick={() => void copyBrowserAddress()}>{copied ? "Copied" : "Copy address"}</button></div>
        </>}
        {phase === "error" && <p role="alert" className="bl-error">{message}</p>}
        {phase === "reload" && <p role="status">Your extension was updated. Reload this Backline tab to reconnect, then open website review again. Your saved feedback stays in this project.</p>}
        {phase === "connected" && <p role="status">The Backline toolbar is connected in your website tab.</p>}
        {phase === "waiting" && <p role="status">Your website tab may still be opening. Sign in there as usual; the Backline toolbar should appear when you return to this project's website. If you see the toolbar, close this dialog and continue reviewing. If it does not appear, close this dialog and reopen website review from the project.</p>}
        {phase !== "setup" && phase !== "update" && phase !== "reload" && <ol><li>Sign in to the website using your own account if needed.</li><li>Choose Comment to see saved pins and add feedback, or Draw to select an area.</li><li>Write your feedback and save. Use Return to Backline to see the saved ticket.</li></ol>}
        <p className="bl-policy-note">A Backline review link doesn't sign you in to the website or give access to another person's website account.</p>
      </div>
      <footer className="bl-dialog-actions bl-dialog-actions-bordered">
        <button type="button" className="bl-quiet" onClick={close}>{phase === "connected" ? "Done" : "Close"}</button>
        {(phase === "setup" || phase === "update") && <>
          <button type="button" className="bl-quiet" onClick={() => window.location.reload()}>{phase === "setup" ? "Installed? Reload Backline" : "Updated? Reload Backline"}</button>
          <a className="bl-button" href={EXTENSION_DOWNLOAD_URL}>{phase === "setup" ? "Download extension" : "Download update"}</a>
        </>}
        {phase === "reload" && <button type="button" className="bl-button" onClick={() => window.location.reload()}>Reload Backline</button>}
        {!busy && phase !== "connected" && phase !== "waiting" && phase !== "reload" && phase !== "setup" && phase !== "update" && (needsRejoin && onGuestSessionExpired
          ? <button type="button" className="bl-button" onClick={() => { close(); onGuestSessionExpired(); }}>Rejoin review</button>
          : <button type="button" className="bl-button" disabled={!online} onClick={() => void start()}>Try again</button>)}
      </footer>
    </Dialog>}
  </>;
}
