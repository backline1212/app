import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";

import { LoadingScreen } from "../../components/LoadingScreen";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import type { WorkspaceOut } from "../workspaces/api";
import * as integrationsApi from "./api";
import type { IntegrationOut } from "./api";
import { ConnectForm } from "./components/ConnectForm";
import { ConnectionRow } from "./components/ConnectionRow";
import { ProviderMark } from "./components/ProviderMark";
import { PROVIDERS, type Provider, type ProviderKind } from "./providers";

const SECTIONS: { kind: ProviderKind; title: string; blurb: string }[] = [
  {
    kind: "tracker",
    title: "Issue trackers",
    blurb: "Send any comment to a tracker as an issue or task, from the comment's drawer or from your AI agent.",
  },
  {
    kind: "notifier",
    title: "Notifications",
    blurb: "Post new comments, replies and status changes as they happen. Failed posts are retried for about 5 minutes.",
  },
];

export function IntegrationsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle("Integrations");
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = workspace.role === "owner" || workspace.role === "admin";

  // Which connection's settings are open (?setup=<id>) - set on arrival from an OAuth
  // callback or right after connecting a tracker, so choosing its destination is the
  // obvious next step.
  const openId = searchParams.get("setup");
  const setOpenId = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("setup", id);
    else next.delete("setup");
    setSearchParams(next, { replace: true });
  };

  const [connecting, setConnecting] = useState<Provider["type"] | null>(null);
  const [signingSecret, setSigningSecret] = useState<string | null>(null);

  const integrations = useQuery({
    queryKey: qk.integrations(workspace.id),
    queryFn: () => integrationsApi.listIntegrations(workspace.id),
  });
  const oauthApps = useQuery({
    queryKey: qk.oauthApps(workspace.id),
    queryFn: integrationsApi.listOAuthApps,
    enabled: canManage,
    staleTime: 5 * 60_000,
  });

  function onConnected(integration: IntegrationOut) {
    setConnecting(null);
    setSigningSecret(integration.signing_secret ?? null);
    void queryClient.invalidateQueries({ queryKey: qk.integrations(workspace.id) });
    if (integration.needs_destination) setOpenId(integration.id);
  }

  const connected = integrations.data ?? [];
  const countByType = new Map<string, number>();
  for (const item of connected) countByType.set(item.type, (countByType.get(item.type) ?? 0) + 1);

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>Integrations</h1>
          <p>
            File feedback in your team's tracker and post it where your team talks. Every integration connects with
            a token or webhook URL - no app review needed.
          </p>
        </div>
      </header>

      {integrations.isError && (
        <p role="alert" className="bl-error">
          {integrations.error instanceof Error ? integrations.error.message : "Could not load integrations."}
        </p>
      )}
      {integrations.isLoading && <LoadingScreen inline />}
      {!canManage && (
        <p className="bl-inline-note bl-int-note">
          Only workspace owners and admins can connect or change integrations. You can send comments to any connected
          tracker from a comment's drawer.
        </p>
      )}

      {signingSecret && (
        <section className="bl-int-secret" aria-label="Webhook signing secret">
          <strong>Webhook signing secret - copy it now, it won't be shown again</strong>
          <input
            readOnly
            className="bl-input bl-mono"
            value={signingSecret}
            onFocus={(event) => event.target.select()}
            aria-label="Signing secret"
          />
          <p className="bl-mono">
            Verify each delivery: HMAC-SHA256 of “&lt;X-Backline-Timestamp&gt;.&lt;raw body&gt;” with this secret must equal
            X-Backline-Signature.
          </p>
          <div>
            <button type="button" className="bl-quiet" onClick={() => setSigningSecret(null)}>
              Done
            </button>
          </div>
        </section>
      )}

      {connected.length > 0 && (
        <section className="bl-attention bl-int-section">
          <header>
            <h2>
              Connected <span className="bl-count">{connected.length}</span>
            </h2>
          </header>
          <div className="bl-int-list">
            {connected.map((integration) => (
              <ConnectionRow
                key={integration.id}
                integration={integration}
                workspaceId={workspace.id}
                canManage={canManage}
                open={openId === integration.id}
                onToggle={(open) => setOpenId(open ? integration.id : null)}
              />
            ))}
          </div>
        </section>
      )}

      {canManage &&
        SECTIONS.map((section) => (
          <section key={section.kind} className="bl-attention bl-int-section">
            <header>
              <h2>{section.title}</h2>
              <span>{section.blurb}</span>
            </header>
            <div className="bl-int-catalog">
              {PROVIDERS.filter((provider) => provider.kind === section.kind).map((provider) => {
                const count = countByType.get(provider.type) ?? 0;
                const isOpen = connecting === provider.type;
                return (
                  <article key={provider.type} className={`bl-int-card${isOpen ? " is-open" : ""}`}>
                    <div className="bl-int-card-head">
                      <ProviderMark provider={provider} size={32} />
                      <div>
                        <strong>{provider.name}</strong>
                        <p>{provider.blurb}</p>
                      </div>
                      {!isOpen && (
                        <button type="button" className="bl-quiet" onClick={() => setConnecting(provider.type)}>
                          {count > 0 ? "Add another" : "Connect"}
                        </button>
                      )}
                    </div>
                    {count > 0 && !isOpen && <span className="bl-int-connected">✓ Connected</span>}
                    {isOpen && (
                      <ConnectForm
                        provider={provider}
                        workspace={workspace}
                        oauthApp={
                          provider.oauth ? oauthApps.data?.find((app) => app.type === provider.type) : undefined
                        }
                        onConnected={onConnected}
                        onCancel={() => setConnecting(null)}
                      />
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
    </main>
  );
}
