import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import * as integrationsApi from "./api";
import { JIRA_PENDING_KEY } from "./IntegrationsPage";

// Mirrors ClickUpOAuthCallbackPage.tsx exactly - Jira's 3LO redirect lands here with
// just a `code`, so the workspace + project key chosen before the redirect
// (IntegrationsPage) has to survive out-of-band, in sessionStorage.
export function JiraOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = searchParams.get("code");
    const pendingRaw = sessionStorage.getItem(JIRA_PENDING_KEY);
    if (!code || !pendingRaw) {
      setError("Missing authorization code or pending connection details.");
      return;
    }
    sessionStorage.removeItem(JIRA_PENDING_KEY);
    const pending = JSON.parse(pendingRaw) as {
      workspaceId: string;
      workspaceSlug: string;
      projectKey: string;
    };

    integrationsApi
      .connectJira(pending.workspaceId, { oauthCode: code, projectKey: pending.projectKey })
      .then(() => navigate(`/w/${pending.workspaceSlug}/integrations`, { replace: true }))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Jira connection failed.");
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <main className="bl-review-gate">
        <span className="bl-loading-mark" aria-hidden="true">B</span>
        <div className="bl-review-gate-copy">
          <span className="bl-review-eyebrow">Integrations</span>
          <h1>Couldn't connect Jira</h1>
          <p>{error}</p>
          <div className="bl-review-gate-actions">
            <Link className="bl-quiet" to="/">Back to dashboard</Link>
          </div>
        </div>
      </main>
    );
  }
  return <LoadingScreen label="Connecting Jira" />;
}
