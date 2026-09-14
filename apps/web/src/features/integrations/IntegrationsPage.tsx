import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { useDocumentTitle } from "../../lib/use-document-title";
import { qk } from "../../lib/query-keys";
import { LoadingScreen } from "../../components/LoadingScreen";
import type { WorkspaceOut } from "../workspaces/api";
import * as integrationsApi from "./api";
import { buildAsanaAuthUrl } from "./asana-oauth-url";
import { buildClickUpAuthUrl } from "./clickup-oauth-url";
import { buildJiraAuthUrl } from "./jira-oauth-url";
import { generateOAuthState } from "./oauth-state";

import clickupLogo from "../../assets/icons/clickup-svgrepo-com.svg";
import slackLogo from "../../assets/icons/slack-svgrepo-com.svg";
import trelloLogo from "../../assets/icons/trello-color-svgrepo-com.svg";

const CLICKUP_PENDING_KEY = "backline:clickup-oauth-pending";
const JIRA_PENDING_KEY = "backline:jira-oauth-pending";
const ASANA_PENDING_KEY = "backline:asana-oauth-pending";

const TYPE_LABELS: Record<string, string> = {
  slack: "Slack",
  clickup: "ClickUp",
  trello: "Trello",
  jira: "Jira",
  asana: "Asana",
};

export function IntegrationsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle('Integrations');
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const queryKey = qk.integrations(workspace.id);
  const { data: integrations, isLoading, error: integrationsError } = useQuery({
    queryKey,
    queryFn: () => integrationsApi.listIntegrations(workspace.id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const connectSlackMutation = useMutation({
    mutationFn: () =>
      integrationsApi.connectSlack(workspace.id, {
        webhookUrl: slackWebhookUrl,
        notifyStatusChanges: true,
        notifyTeamLayer: false,
      }),
    onSuccess: () => {
      setSlackWebhookUrl("");
      setError(null);
      invalidate();
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not connect Slack."),
  });

  const [trelloApiKey, setTrelloApiKey] = useState("");
  const [trelloToken, setTrelloToken] = useState("");
  const [trelloListId, setTrelloListId] = useState("");
  const connectTrelloMutation = useMutation({
    mutationFn: () =>
      integrationsApi.connectTrello(workspace.id, {
        apiKey: trelloApiKey,
        token: trelloToken,
        listId: trelloListId,
      }),
    onSuccess: () => {
      setTrelloApiKey("");
      setTrelloToken("");
      setTrelloListId("");
      setError(null);
      invalidate();
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not connect Trello."),
  });

  const [clickupListId, setClickupListId] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [asanaProjectGid, setAsanaProjectGid] = useState("");
  const disconnectMutation = useMutation({
    mutationFn: (integrationId: string) => integrationsApi.disconnectIntegration(integrationId),
    onSuccess: invalidate,
  });

  function handleConnectSlack(event: FormEvent) {
    event.preventDefault();
    connectSlackMutation.mutate();
  }

  function handleConnectTrello(event: FormEvent) {
    event.preventDefault();
    connectTrelloMutation.mutate();
  }

  function handleConnectClickUp(event: FormEvent) {
    event.preventDefault();
    const state = generateOAuthState();
    sessionStorage.setItem(
      CLICKUP_PENDING_KEY,
      JSON.stringify({
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        listId: clickupListId,
        state,
      }),
    );
    window.location.href = buildClickUpAuthUrl(state);
  }

  function handleConnectJira(event: FormEvent) {
    event.preventDefault();
    const state = generateOAuthState();
    sessionStorage.setItem(
      JIRA_PENDING_KEY,
      JSON.stringify({
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        projectKey: jiraProjectKey,
        state,
      }),
    );
    window.location.href = buildJiraAuthUrl(state);
  }

  function handleConnectAsana(event: FormEvent) {
    event.preventDefault();
    const state = generateOAuthState();
    sessionStorage.setItem(
      ASANA_PENDING_KEY,
      JSON.stringify({
        workspaceId: workspace.id,
        workspaceSlug: workspace.slug,
        projectGid: asanaProjectGid,
        state,
      }),
    );
    window.location.href = buildAsanaAuthUrl(state);
  }

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>Integrations</h1>
          <p>Connect Slack, ClickUp, Trello, Jira, or Asana (17-Notifications-Integrations.md).</p>
        </div>
      </header>

      {error && <div className="bl-error">{error}</div>}
      {integrationsError && (
        <p role="alert" className="bl-error">
          {integrationsError instanceof Error ? integrationsError.message : "Could not load integrations."}
        </p>
      )}
      {isLoading && <LoadingScreen />}

      {integrations && integrations.length > 0 && (
        <section className="bl-attention bl-settings-section">
          <header>
            <h2>Connected</h2>
          </header>
          <div style={{ flex: 1, padding: "20px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {integrations.map((integration) => (
                <div
                  key={integration.id}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", border: "1px solid var(--bl-line)", borderRadius: "3px", background: "var(--bl-surface)" }}
                >
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>{TYPE_LABELS[integration.type]}</span>
                  <button
                    className="bl-quiet"
                    style={{ color: "var(--bl-error)", borderColor: "transparent", padding: "4px 8px" }}
                    onClick={() => disconnectMutation.mutate(integration.id)}
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Slack</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <img src={slackLogo} alt="" className="bl-icon" style={{ width: "24px", height: "24px" }} />
            <p style={{ fontSize: "12px", fontWeight: 500 }}>Connect Slack</p>
          </div>
          <p className="bl-mono">
            Paste an Incoming Webhook URL. Team-only comments never post here unless you've
            configured a private channel.
          </p>
          <form onSubmit={handleConnectSlack} style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <input
              required
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={slackWebhookUrl}
              onChange={(event) => setSlackWebhookUrl(event.target.value)}
              className="bl-input"
            />
            <button type="submit" className="bl-button" disabled={connectSlackMutation.isPending}>
              Connect
            </button>
          </form>
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Trello</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <img src={trelloLogo} alt="" className="bl-icon" style={{ width: "24px", height: "24px" }} />
            <p style={{ fontSize: "12px", fontWeight: 500 }}>Connect Trello</p>
          </div>
          <p className="bl-mono">
            Paste your personal API key + token from Trello's token generation page, and the
            list ID new cards should be created in.
          </p>
          <form onSubmit={handleConnectTrello} style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
            <input
              required
              placeholder="API key"
              value={trelloApiKey}
              onChange={(event) => setTrelloApiKey(event.target.value)}
              className="bl-input"
              style={{ flex: 1, minWidth: "150px" }}
            />
            <input
              required
              placeholder="Token"
              value={trelloToken}
              onChange={(event) => setTrelloToken(event.target.value)}
              className="bl-input"
              style={{ flex: 1, minWidth: "150px" }}
            />
            <input
              required
              placeholder="List ID"
              value={trelloListId}
              onChange={(event) => setTrelloListId(event.target.value)}
              className="bl-input"
              style={{ flex: 1, minWidth: "150px" }}
            />
            <button type="submit" className="bl-button" disabled={connectTrelloMutation.isPending}>
              Connect
            </button>
          </form>
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Jira</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="bl-connector-id" style={{ background: "#0052CC" }}>J</span>
            <p style={{ fontSize: "12px", fontWeight: 500 }}>Connect Jira</p>
          </div>
          <p className="bl-mono">
            Enter the project key issues should be created in (e.g. "BUG"), then authorize with
            Jira.
          </p>
          <form onSubmit={handleConnectJira} style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <input
              required
              placeholder="Project key"
              value={jiraProjectKey}
              onChange={(event) => setJiraProjectKey(event.target.value)}
              className="bl-input"
            />
            <button type="submit" className="bl-button">
              Continue
            </button>
          </form>
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Asana</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="bl-connector-id" style={{ background: "#F06A6A" }}>A</span>
            <p style={{ fontSize: "12px", fontWeight: 500 }}>Connect Asana</p>
          </div>
          <p className="bl-mono">
            Enter the project GID tasks should be created in, then authorize with Asana.
          </p>
          <form onSubmit={handleConnectAsana} style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <input
              required
              placeholder="Project GID"
              value={asanaProjectGid}
              onChange={(event) => setAsanaProjectGid(event.target.value)}
              className="bl-input"
            />
            <button type="submit" className="bl-button">
              Continue
            </button>
          </form>
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>ClickUp</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <img src={clickupLogo} alt="" className="bl-icon" style={{ width: "24px", height: "24px" }} />
            <p style={{ fontSize: "12px", fontWeight: 500 }}>Connect ClickUp</p>
          </div>
          <p className="bl-mono">
            Enter the List ID new tasks should be created in, then authorize with ClickUp.
          </p>
          <form onSubmit={handleConnectClickUp} style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <input
              required
              placeholder="List ID"
              value={clickupListId}
              onChange={(event) => setClickupListId(event.target.value)}
              className="bl-input"
            />
            <button type="submit" className="bl-button">
              Continue
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

export { CLICKUP_PENDING_KEY, JIRA_PENDING_KEY, ASANA_PENDING_KEY };
