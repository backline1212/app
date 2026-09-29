import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { formatRelativeTime } from "../../../lib/date-format";
import { qk } from "../../../lib/query-keys";
import * as integrationsApi from "../api";
import type { IntegrationOut } from "../api";
import { DEFAULT_TOGGLES, type NotifyToggles, PROVIDER_BY_TYPE } from "../providers";
import { DestinationPicker } from "./DestinationPicker";
import { NotifySwitches } from "./NotifySwitches";
import { ProviderMark } from "./ProviderMark";

const AUTH_LABEL: Record<IntegrationOut["auth_mode"], string> = {
  webhook: "Webhook",
  api_token: "Token",
  oauth: "OAuth",
};

function togglesOf(integration: IntegrationOut): NotifyToggles {
  const summary = integration.config_summary as Partial<NotifyToggles>;
  return {
    notify_status_changes: summary.notify_status_changes ?? DEFAULT_TOGGLES.notify_status_changes,
    notify_team_layer: summary.notify_team_layer ?? DEFAULT_TOGGLES.notify_team_layer,
    notify_project_updates: summary.notify_project_updates ?? DEFAULT_TOGGLES.notify_project_updates,
  };
}

/** One live connection: where it sends things, and the admin's controls for it. */
export function ConnectionRow({
  integration,
  workspaceId,
  canManage,
  open,
  onToggle,
}: {
  integration: IntegrationOut;
  workspaceId: string;
  canManage: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const provider = PROVIDER_BY_TYPE.get(integration.type);
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.integrations(workspaceId) });

  const test = useMutation({ mutationFn: () => integrationsApi.testIntegration(integration.id) });
  const disconnect = useMutation({
    mutationFn: () => integrationsApi.disconnectIntegration(integration.id),
    onSuccess: () => {
      setConfirming(false);
      void invalidate();
    },
  });
  const settings = useMutation({
    mutationFn: (next: NotifyToggles) => integrationsApi.updateIntegration(integration.id, next),
    onSuccess: () => void invalidate(),
  });

  if (!provider) return null;
  const noun = provider.destinationNoun ?? "destination";
  const isTracker = integration.kind === "tracker";

  return (
    <div className="bl-int-row">
      <div className="bl-int-row-main">
        <ProviderMark provider={provider} />
        <div className="bl-int-row-copy">
          <strong>
            {provider.name}
            <span className="bl-scope-badge">{AUTH_LABEL[integration.auth_mode]}</span>
          </strong>
          {isTracker ? (
            integration.needs_destination ? (
              <span className="bl-int-warn">Choose a {noun} before tickets can be sent here.</span>
            ) : (
              <span>
                Tickets go to <b>{integration.destination_label}</b>
              </span>
            )
          ) : (
            <span>
              {integration.type === "webhook" && typeof integration.config_summary.url_host === "string"
                ? `Posts to ${integration.config_summary.url_host} · `
                : ""}
              Connected {formatRelativeTime(integration.created_at)}
            </span>
          )}
        </div>
        {canManage && (
          <div className="bl-int-row-actions">
            <button
              type="button"
              className={isTracker && integration.needs_destination ? "bl-button" : "bl-quiet"}
              aria-expanded={open}
              onClick={() => onToggle(!open)}
            >
              {isTracker ? (integration.needs_destination ? `Choose ${noun}` : `Change ${noun}`) : "Settings"}
            </button>
            <button type="button" className="bl-quiet" disabled={test.isPending} onClick={() => test.mutate()}>
              {test.isPending ? "Testing…" : isTracker ? "Check" : "Send test"}
            </button>
            <button type="button" className="bl-quiet bl-int-danger" onClick={() => setConfirming(true)}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      {test.data && (
        <p role="status" className={test.data.ok ? "bl-int-ok" : "bl-error"}>
          {test.data.message}
        </p>
      )}
      {test.isError && (
        <p role="alert" className="bl-error">
          {test.error instanceof Error ? test.error.message : "The check failed."}
        </p>
      )}

      {open && canManage && (
        <div className="bl-int-row-panel">
          {isTracker ? (
            <DestinationPicker
              integration={integration}
              provider={provider}
              workspaceId={workspaceId}
              onSaved={() => onToggle(false)}
            />
          ) : (
            <>
              <NotifySwitches
                value={togglesOf(integration)}
                disabled={settings.isPending}
                onChange={(next) => settings.mutate(next)}
              />
              {settings.isError && (
                <p role="alert" className="bl-error">
                  Could not save that setting.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Disconnect ${provider.name}?`}
          message={
            isTracker
              ? `Members won't be able to send tickets to ${provider.name} any more. Tickets already filed stay where they are.`
              : `${provider.name} will stop receiving Backline notifications.`
          }
          confirmLabel={disconnect.isPending ? "Disconnecting…" : "Disconnect"}
          destructive
          pending={disconnect.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => disconnect.mutate()}
        />
      )}
    </div>
  );
}
