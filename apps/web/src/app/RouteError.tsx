import { useEffect } from "react";
import { useRouteError } from "react-router-dom";

import { isStaleBuildError, reloadForNewBuild } from "../lib/stale-build";

/** Shown instead of React Router's raw "Unexpected Application Error!" page. */
export function RouteError() {
  const error = useRouteError();
  const stale = isStaleBuildError(error);
  // Rendered at the page being opened, so the reload lands there on the new build. The
  // guard in reloadForNewBuild leaves this screen up if the reload didn't help.
  useEffect(() => { if (stale) reloadForNewBuild(); }, [stale]);
  return (
    <main className="bl-review-gate">
      <span className="bl-loading-mark" aria-hidden="true">B</span>
      <div className="bl-review-gate-copy">
        <h1>{stale ? "Backline was updated" : "Something went wrong"}</h1>
        <p>{stale ? "A newer version is available. Reload to continue - nothing you saved is lost." : "This page couldn't be shown. Reload to try again, or go back to your projects."}</p>
        {!stale && error instanceof Error && <div className="bl-error" role="alert">{error.message}</div>}
        <div className="bl-review-gate-actions">
          <button type="button" className="bl-quiet" onClick={() => window.location.assign("/")}>Go to projects</button>
          <button type="button" className="bl-button mint" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    </main>
  );
}
