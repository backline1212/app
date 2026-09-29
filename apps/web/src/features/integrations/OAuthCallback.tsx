import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import { useDocumentTitle } from "../../lib/use-document-title";
import * as integrationsApi from "./api";
import { type OAuthProvider, takePendingOAuth } from "./oauth-state";

const NAMES: Record<OAuthProvider, string> = { clickup: "ClickUp", jira: "Jira", asana: "Asana" };

/**
 * Where ClickUp/Jira/Asana send the browser back after consent. Outside the dashboard
 * shell (same shape as features/auth/AuthCallbackPage): the provider returns only a
 * `code` and our `state`, so the workspace the flow started in comes back out of
 * sessionStorage. On success it opens the Integrations page on the new connection so
 * its destination can be chosen.
 */
export function OAuthCallback({ provider }: { provider: OAuthProvider }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);
  const name = NAMES[provider];
  useDocumentTitle(`Connecting ${name}`);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = searchParams.get("code");
    const pending = takePendingOAuth(provider);
    if (searchParams.get("error")) {
      setError(`${name} didn't grant access (${searchParams.get("error")}).`);
      return;
    }
    if (!code || !pending) {
      setError("Missing authorization code or pending connection details.");
      return;
    }
    // CSRF guard: the state this browser generated before redirecting must match what
    // the provider echoes back - otherwise this could be a code an attacker obtained
    // for their own account, not the one this session actually started the flow for.
    if (searchParams.get("state") !== pending.state) {
      setError("This connection request could not be verified. Please try connecting again.");
      return;
    }

    const connect =
      provider === "clickup"
        ? integrationsApi.connectClickUp(pending.workspaceId, { oauthCode: code, listId: pending.listId })
        : provider === "jira"
          ? integrationsApi.connectJira(pending.workspaceId, { oauthCode: code, projectKey: pending.projectKey })
          : integrationsApi.connectAsana(pending.workspaceId, { oauthCode: code, projectGid: pending.projectGid });

    connect
      .then((integration) =>
        navigate(`/w/${pending.workspaceSlug}/integrations?setup=${encodeURIComponent(integration.id)}`, {
          replace: true,
        }),
      )
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : `${name} connection failed.`);
      });
  }, [searchParams, navigate, provider, name]);

  if (error) {
    return (
      <main className="bl-review-gate">
        <span className="bl-loading-mark" aria-hidden="true">B</span>
        <div className="bl-review-gate-copy">
          <span className="bl-review-eyebrow">Integrations</span>
          <h1>Couldn't connect {name}</h1>
          <p>{error}</p>
          <div className="bl-review-gate-actions">
            <Link className="bl-quiet" to="/">Back to dashboard</Link>
          </div>
        </div>
      </main>
    );
  }
  return <LoadingScreen label={`Connecting ${name}`} />;
}
