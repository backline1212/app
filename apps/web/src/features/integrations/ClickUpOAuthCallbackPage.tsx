import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import * as integrationsApi from "./api";
import { CLICKUP_PENDING_KEY } from "./IntegrationsPage";

// Outside the dashboard shell entirely (same shape as features/auth/AuthCallbackPage) -
// ClickUp's OAuth redirect lands here with just a `code`, so the workspace + list id
// chosen before the redirect (IntegrationsPage) has to survive out-of-band, in
// sessionStorage, the same way there's no other way to carry application state through
// a third party's OAuth round trip.
export function ClickUpOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = searchParams.get("code");
    const pendingRaw = sessionStorage.getItem(CLICKUP_PENDING_KEY);
    if (!code || !pendingRaw) {
      setError("Missing authorization code or pending connection details.");
      return;
    }
    sessionStorage.removeItem(CLICKUP_PENDING_KEY);
    const pending = JSON.parse(pendingRaw) as {
      workspaceId: string;
      workspaceSlug: string;
      listId: string;
      state: string;
    };
    // CSRF guard: the state this browser generated before redirecting must match what
    // ClickUp echoes back - otherwise this could be a code an attacker obtained for
    // their own account, not the one this session actually started the flow for.
    if (searchParams.get("state") !== pending.state) {
      setError("This connection request could not be verified. Please try connecting again.");
      return;
    }

    integrationsApi
      .connectClickUp(pending.workspaceId, { oauthCode: code, listId: pending.listId })
      .then(() => navigate(`/w/${pending.workspaceSlug}/integrations`, { replace: true }))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "ClickUp connection failed.");
      });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <main className="bl-review-gate">
        <span className="bl-loading-mark" aria-hidden="true">B</span>
        <div className="bl-review-gate-copy">
          <span className="bl-review-eyebrow">Integrations</span>
          <h1>Couldn't connect ClickUp</h1>
          <p>{error}</p>
          <div className="bl-review-gate-actions">
            <Link className="bl-quiet" to="/">Back to dashboard</Link>
          </div>
        </div>
      </main>
    );
  }
  return <LoadingScreen label="Connecting ClickUp" />;
}
