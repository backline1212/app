import type { NativeReviewAuth, NativeReviewLaunch, NativeReviewStatus } from "@backline/types";
import { useState } from "react";
import { API_BASE_URL } from "../../lib/api-client";
import { createExtensionToken, revokeExtensionToken } from "../extension-tokens/api";

function extensionRequest<T>(action: "status" | "launch", input?: NativeReviewLaunch): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = window.setTimeout(() => finish(new Error(action === "status"
      ? "Install or update the Backline extension, then reload this page."
      : "The extension did not confirm that review opened. Try again.")), action === "status" ? 2000 : 30000);
    function finish(error?: Error, data?: T) {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      if (error) reject(error); else resolve(data as T);
    }
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin
        || event.data?.source !== "backline-extension" || event.data.id !== id) return;
      finish(event.data.ok ? undefined : new Error(event.data.error), event.data.data);
    }
    window.addEventListener("message", receive);
    window.postMessage({ source: "backline-dashboard", id, action, input }, window.location.origin);
  });
}

interface Props {
  projectId: string;
  url: string;
  member?: { workspaceId: string; userId: string };
  guest?: Extract<NativeReviewAuth, { kind: "guest" }>;
}

export function NativeReviewButton({ projectId, url, member, guest }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  async function start(forceConnect = false) {
    setBusy(true);
    setError(null);
    let issuedId: string | null = null;
    try {
      const status = await extensionRequest<NativeReviewStatus>("status");
      let auth: NativeReviewAuth | undefined = guest;
      if (!guest && member && (forceConnect || status.workspaceId !== member.workspaceId || status.userId !== member.userId)) {
        const issued = await createExtensionToken(member.workspaceId, "Browser review");
        issuedId = issued.id;
        auth = { kind: "member", token: issued.token };
      }
      await extensionRequest("launch", { projectId, url, returnUrl: window.location.href, auth });
      issuedId = null;
      setOpened(true);
    } catch (err) {
      // A token that never reached a functioning extension should not linger.
      if (issuedId) await revokeExtensionToken(issuedId).catch(() => undefined);
      setError(err instanceof Error ? err.message : "Could not open browser review.");
    } finally { setBusy(false); }
  }
  return <>
    <button type="button" className="bl-review-control bl-button" disabled={busy} onClick={() => void start()} title="Review the real website with your existing browser login">
      {busy ? "Opening…" : opened ? "Return to browser review" : "Browser review"}
    </button>
    {error && <div className="bl-gate-scrim" role="presentation" onClick={() => setError(null)}>
      <div className="bl-gate-modal" role="dialog" aria-modal="true" aria-labelledby="nativeReviewTitle" onClick={event => event.stopPropagation()}>
        <div className="bl-gate-head"><h3 id="nativeReviewTitle">Review a signed-in website</h3>
          <p>Sign in on the real site, then use Backline&apos;s Comment or Draw controls in that tab. Google, SSO and password screens use your normal browser.</p></div>
        <div className="bl-gate-body">
          <p className="bl-error" role="alert">{error}</p>
          <p>One-time setup in desktop Chrome or Edge:</p>
          <ol><li>Download and unzip the extension.</li><li>Open chrome://extensions (or edge://extensions), enable Developer mode, and choose Load unpacked.</li><li>Select the unzipped folder, then reload this Backline page.</li></ol>
          <p>If already installed, replace its files with this download and click Reload on its extension card.</p>
          <a className="bl-quiet" href={`${API_BASE_URL}/extension/backline-extension.zip`}>Download Backline extension</a>
        </div>
        <div className="bl-gate-foot">
          <button className="bl-quiet" onClick={() => setError(null)}>Close</button>
          <button className="bl-button" disabled={busy} onClick={() => void start(true)}>Try again</button>
        </div>
      </div>
    </div>}
  </>;
}
