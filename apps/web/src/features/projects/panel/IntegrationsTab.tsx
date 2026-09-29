import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { qk } from "../../../lib/query-keys";
import * as integrationsApi from "../../integrations/api";
import type { IntegrationOut } from "../../integrations/api";
import { ProviderMark } from "../../integrations/components/ProviderMark";
import { PROVIDERS } from "../../integrations/providers";
import type { WorkspaceOut } from "../../workspaces/api";
import * as projectsApi from "../api";
import type { ProjectOut } from "../api";
import { ChevronIcon } from "./icons";

interface IntegrationsTabProps {
  project: ProjectOut;
  workspaceId: string;
  workspaceSlug: string;
}

// Quick-access panel over the same real connections managed on the workspace
// Integrations page - reflects actual connection state and can disconnect in place
// (owners/admins, after a confirm), but connecting needs credentials this compact
// panel has no room to collect, so turning a provider "on" opens the full page.
export function IntegrationsTab({ project, workspaceId, workspaceSlug }: IntegrationsTabProps) {
  const [expanded, setExpanded] = useState(true);
  const [pendingDisconnect, setPendingDisconnect] = useState<IntegrationOut | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const outlet = useOutletContext<{ workspace?: WorkspaceOut } | undefined>();
  const canManage = outlet?.workspace?.role === "owner" || outlet?.workspace?.role === "admin";

  const queryKey = qk.integrations(workspaceId);
  const { data: integrations } = useQuery({
    queryKey,
    queryFn: () => integrationsApi.listIntegrations(workspaceId),
  });
  const disconnect = useMutation({
    mutationFn: (integrationId: string) => integrationsApi.disconnectIntegration(integrationId),
    onSuccess: () => {
      setPendingDisconnect(null);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const muteNotifications = useMutation({
    mutationFn: (enabled: boolean) =>
      projectsApi.updateProjectSettings(project.id, { slack_notifications_enabled: enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.project(project.id) }),
  });

  const connectedByType = new Map((integrations ?? []).map((integration) => [integration.type, integration]));
  const hasNotifier = (integrations ?? []).some((integration) => integration.kind === "notifier");
  const openSettings = () => navigate(`/w/${workspaceSlug}/integrations`);

  return (
    <div className="flex flex-col gap-3 p-4">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex items-center justify-between text-sm font-semibold"
        style={{ color: "var(--mint-deep)" }}
      >
        <span>Available integrations ({PROVIDERS.length})</span>
        <span style={{ display: "inline-flex", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .14s ease" }}>
          <ChevronIcon width={14} height={14} />
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2">
          {PROVIDERS.map((provider) => {
            const connected = connectedByType.get(provider.type);
            return (
              <div key={provider.type} className="bl-connector-row">
                <span className="bl-connector-name">
                  <ProviderMark provider={provider} />
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    {provider.name}
                    {connected?.kind === "tracker" && (
                      <small className="bl-mono" style={{ fontWeight: 400 }}>
                        {connected.needs_destination ? "Choose where tickets go" : connected.destination_label}
                      </small>
                    )}
                  </span>
                </span>
                <label style={{ display: "inline-flex", alignItems: "center", cursor: canManage ? "pointer" : "default" }}>
                  <input
                    type="checkbox"
                    className="bl-switch-input"
                    checked={!!connected}
                    disabled={disconnect.isPending || (!canManage && !connected)}
                    onChange={() => {
                      if (connected && canManage) setPendingDisconnect(connected);
                      else if (!connected) openSettings();
                    }}
                    aria-label={connected ? `Disconnect ${provider.name}` : `Connect ${provider.name}`}
                  />
                  <span className="bl-switch" aria-hidden="true">
                    <i />
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      )}
      {hasNotifier && (
        <div className="bl-connector-row">
          <span className="bl-connector-name">Notifications for this project</span>
          <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
            <input
              type="checkbox"
              className="bl-switch-input"
              checked={project.settings.slack_notifications_enabled}
              disabled={muteNotifications.isPending}
              onChange={(event) => muteNotifications.mutate(event.target.checked)}
              aria-label="Slack, Discord, Teams and webhook notifications for this project"
            />
            <span className="bl-switch" aria-hidden="true">
              <i />
            </span>
          </label>
        </div>
      )}
      <p className="bl-inline-note">
        {canManage
          ? "Reflects your real workspace connections. Toggle off to disconnect, or on to connect from the Integrations page."
          : "Reflects your workspace's connections. Owners and admins connect them; you can send any comment to a connected tracker from its drawer."}{" "}
        <button type="button" onClick={openSettings} className="bl-text-link" style={{ padding: 0 }}>
          Open Integrations
        </button>
      </p>

      {pendingDisconnect && (
        <ConfirmDialog
          title="Disconnect this integration?"
          message="It's disconnected for the whole workspace, not just this project. Tickets already filed stay where they are."
          confirmLabel={disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          destructive
          pending={disconnect.isPending}
          onCancel={() => setPendingDisconnect(null)}
          onConfirm={() => disconnect.mutate(pendingDisconnect.id)}
        />
      )}
    </div>
  );
}
