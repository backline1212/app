import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { qk } from "../../../lib/query-keys";
import * as integrationsApi from "../../integrations/api";
import { ChevronIcon } from "./icons";

const REAL_INTEGRATIONS: {
  name: string;
  type: "slack" | "trello" | "clickup" | "jira" | "asana";
  color: string;
}[] = [
  { name: "Slack", type: "slack", color: "#4A154B" },
  { name: "Trello", type: "trello", color: "#0079BF" },
  { name: "ClickUp", type: "clickup", color: "#7B68EE" },
  { name: "Jira", type: "jira", color: "#0052CC" },
  { name: "Asana", type: "asana", color: "#F06A6A" },
];

interface IntegrationsTabProps {
  workspaceId: string;
  workspaceSlug: string;
}

// Quick-access panel over the same real connections managed on the workspace
// Integrations settings page - reflects actual connection state and can disconnect
// in place, but connecting requires credentials (a webhook URL, an API key/token, an
// OAuth code) this compact panel has no room to collect, so turning a not-yet-connected
// provider "on" opens the full settings page instead of faking a local toggle.
export function IntegrationsTab({ workspaceId, workspaceSlug }: IntegrationsTabProps) {
  const [expanded, setExpanded] = useState(true);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const queryKey = qk.integrations(workspaceId);
  const { data: integrations } = useQuery({
    queryKey,
    queryFn: () => integrationsApi.listIntegrations(workspaceId),
  });
  const disconnect = useMutation({
    mutationFn: (integrationId: string) => integrationsApi.disconnectIntegration(integrationId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const connectedByType = new Map((integrations ?? []).map((integration) => [integration.type, integration]));

  return (
    <div className="flex flex-col gap-3 p-4">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex items-center justify-between text-sm font-semibold"
        style={{ color: "var(--mint-deep)" }}
      >
        <span>Available integrations ({REAL_INTEGRATIONS.length})</span>
        <span style={{ display: "inline-flex", transform: expanded ? "rotate(180deg)" : "none", transition: "transform .14s ease" }}>
          <ChevronIcon width={14} height={14} />
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2">
          {REAL_INTEGRATIONS.map((integration) => {
            const connected = connectedByType.get(integration.type);
            return (
              <div key={integration.name} className="bl-connector-row">
                <span className="bl-connector-name">
                  <span className="bl-connector-id" style={{ background: integration.color }}>
                    {integration.name[0]}
                  </span>
                  {integration.name}
                </span>
                <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    className="bl-switch-input"
                    checked={!!connected}
                    disabled={disconnect.isPending}
                    onChange={() => {
                      if (connected) {
                        disconnect.mutate(connected.id);
                      } else {
                        navigate(`/w/${workspaceSlug}/integrations`);
                      }
                    }}
                    aria-label={connected ? `Disconnect ${integration.name}` : `Connect ${integration.name}`}
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
      <p className="bl-inline-note">
        Reflects your real workspace connection - toggle off to disconnect, or turn on to open
        full connect settings (Jira/Asana need a project key/GID this compact panel has no room
        to collect).
      </p>
    </div>
  );
}
