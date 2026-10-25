import { useState } from "react";

import { Dialog } from "../../components/Dialog";
import { API_BASE_URL } from "../../lib/api-client";
import type { ShareLinkOut } from "./api";

/** The one-tag install for a "Website tools" link. The SDK reads the share token from
 * its own tag and talks to the API that served it, so there is no inline script for a
 * site's Content-Security-Policy to block. */
function installSnippet(token: string): string {
  const api = API_BASE_URL.replace(/\/+$/, "");
  return `<script src="${api}/widget/sdk.js" data-share-token="${token}" async></script>`;
}

/** Where the tag goes on common platforms. Kept short: each is the menu path a site
 * owner follows, ending at "paste the tag". */
function platformGuides(code: string, token: string, api: string): Array<{ name: string; steps: string[]; code?: string }> {
  return [
    { name: "WordPress", steps: ["Install a header-and-footer code plugin (for example WPCode), or edit your child theme's footer.php.", "Paste the tag into the site-wide footer (before </body>) and save."] },
    { name: "Webflow", steps: ["Site settings → Custom code → Footer code.", "Paste the tag, save, then publish the site. Custom code needs a paid site plan."] },
    { name: "Shopify", steps: ["Online Store → Themes → … → Edit code → layout/theme.liquid.", "Paste the tag just before </body> and save."] },
    { name: "Squarespace", steps: ["Settings → Advanced → Code Injection → Footer.", "Paste the tag and save."] },
    { name: "Wix", steps: ["Settings → Custom code → Add custom code.", "Paste the tag, choose All pages and Body - end, then apply."] },
    { name: "Google Tag Manager", steps: ["New tag → Custom HTML, paste the tag.", "Trigger: All Pages (or only your staging hostname). Submit and publish the container."] },
    {
      name: "Next.js",
      steps: ["In app/layout.tsx (or pages/_document.tsx), add the script with next/script:"],
      code: `import Script from "next/script";

<Script src="${api}/widget/sdk.js" data-share-token="${token}" strategy="afterInteractive" />`,
    },
    { name: "Plain HTML, React, Vue", steps: ["Add the tag to the shared page template (index.html or your layout), just before </body>."], code },
  ];
}

export function InstallCodeDialog({ link, reviewUrl, onClose }: { link: ShareLinkOut; reviewUrl: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const code = installSnippet(link.token);
  const guides = platformGuides(code, link.token, API_BASE_URL.replace(/\/+$/, ""));
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
        <div className="bl-install-guides" aria-label="Where to add it">
          <span className="bl-mono">Where to add it</span>
          {guides.map((guide) => (
            <details key={guide.name}>
              <summary>{guide.name}</summary>
              <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              {guide.code && <pre className="bl-code">{guide.code}</pre>}
            </details>
          ))}
        </div>
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
