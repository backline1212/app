import { useState } from "react";

import { Dialog } from "../../components/Dialog";
import { API_BASE_URL } from "../../lib/api-client";
import type { ShareLinkOut } from "./api";

/** The one-tag install for a "Website tools" link. The SDK reads the share token from
 * its own tag and talks to the API that served it, so there is no inline script for a
 * site's Content-Security-Policy to block. */
export function installSnippet(token: string): string {
  const api = API_BASE_URL.replace(/\/+$/, "");
  return `<script src="${api}/widget/sdk.js" data-share-token="${token}" async></script>`;
}

export function InstallCodeDialog({ link, reviewUrl, onClose }: { link: ShareLinkOut; reviewUrl: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const code = installSnippet(link.token);
  let apiOrigin = API_BASE_URL;
  try { apiOrigin = new URL(API_BASE_URL).origin; } catch { /* keep the configured value */ }

  async function copy() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Select the code and copy it manually.");
    }
  }

  return (
    <Dialog title="Install the website tools" onClose={onClose}>
      <div className="bl-dialog-intro">
        <p>Add this tag to every page of the site you want reviewed, just before <code>&lt;/body&gt;</code>. It loads in the background; the review tools appear on the site itself.</p>
      </div>
      <div className="bl-install-code">
        <div className="bl-code-actions">
          <span className="bl-mono">HTML</span>
          <button type="button" className="bl-quiet" onClick={() => void copy()}>{copied ? "Copied" : "Copy code"}</button>
        </div>
        <pre className="bl-code">{code}</pre>
        {copyError && <p role="alert" className="bl-error">{copyError}</p>}
        <ul className="bl-install-notes">
          <li>Send reviewers the review link, <span className="bl-mono">{reviewUrl}</span>. It opens the site signed in to this review. People who visit the site directly are asked for their name first.</li>
          <li>Anyone who can open a page with this tag can leave feedback, so install it on a staging site or give the link a passcode.</li>
          <li>To keep something out of screenshots and page snapshots, add <code>data-backline-private</code> to its element.</li>
          <li>If the site sends a Content-Security-Policy, allow <span className="bl-mono">{apiOrigin}</span> in <code>script-src</code> and <code>connect-src</code>.</li>
          <li>Revoking this link switches the tools off; remove the tag afterwards.</li>
        </ul>
      </div>
      <footer className="bl-dialog-actions bl-dialog-actions-bordered">
        <button type="button" className="bl-button" onClick={onClose}>Done</button>
      </footer>
    </Dialog>
  );
}
