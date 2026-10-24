import type { FallbackRender } from "@sentry/react";
import { useEffect } from "react";

import { isStaleBuildError, reloadForNewBuild } from "../lib/stale-build";

function StaleBuildReload() {
  useEffect(() => { reloadForNewBuild(); }, []);
  return null;
}

export const GlobalErrorFallback: FallbackRender = ({ error, eventId, resetError }) => {
  if (isStaleBuildError(error)) {
    // A lazily loaded part of a page (e.g. the PDF viewer) from the previous build.
    return (
      <main className="bl-review-gate">
        <StaleBuildReload />
        <span className="bl-loading-mark" aria-hidden="true">B</span>
        <div className="bl-review-gate-copy">
          <h1>Backline was updated</h1>
          <p>A newer version is available. Reload to continue - nothing you saved is lost.</p>
          <div className="bl-review-gate-actions">
            <button type="button" className="bl-button mint" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main className="bl-review-gate">
      <span className="bl-loading-mark" aria-hidden="true">B</span>
      <div className="bl-review-gate-copy">
        <h1>Something went wrong</h1>
        <p>An unexpected error occurred. Our team has been notified.</p>
        <div className="bl-error" role="alert">Error ID: {eventId ?? "unknown"}</div>
        <div className="bl-review-gate-actions">
          <button type="button" className="bl-quiet" onClick={() => window.location.assign("/")}>Go to Home</button>
          <button type="button" className="bl-button mint" onClick={resetError}>Try Again</button>
        </div>
      </div>
    </main>
  );
};
