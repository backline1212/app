import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { qk } from "../../../lib/query-keys";
import * as integrationsApi from "../api";
import type { DestinationOut, IntegrationOut } from "../api";
import type { Provider } from "../providers";

/** Lists what this connection can reach (boards, projects, repositories, teams) and
 * saves the one tickets should go to. */
export function DestinationPicker({
  integration,
  provider,
  workspaceId,
  onSaved,
}: {
  integration: IntegrationOut;
  provider: Provider;
  workspaceId: string;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [choice, setChoice] = useState(integration.destination_id ?? "");
  const noun = provider.destinationNoun ?? "destination";

  const destinations = useQuery({
    queryKey: qk.integrationDestinations(workspaceId, integration.id),
    queryFn: () => integrationsApi.listDestinations(integration.id),
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: () => integrationsApi.updateIntegration(integration.id, { destination_id: choice }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.integrations(workspaceId) });
      onSaved();
    },
  });

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const byGroup = new Map<string, DestinationOut[]>();
    for (const destination of destinations.data ?? []) {
      const label = `${destination.group ?? ""} ${destination.name}`.toLowerCase();
      if (needle && !label.includes(needle) && destination.id !== choice) continue;
      const key = destination.group ?? "";
      byGroup.set(key, [...(byGroup.get(key) ?? []), destination]);
    }
    return [...byGroup.entries()];
  }, [destinations.data, filter, choice]);

  if (destinations.isLoading) return <p className="bl-mono">Loading your {provider.name} {noun}s…</p>;
  if (destinations.isError) {
    return (
      <p role="alert" className="bl-error">
        {destinations.error instanceof Error ? destinations.error.message : `Could not load ${noun}s.`}
      </p>
    );
  }
  if ((destinations.data ?? []).length === 0) {
    return (
      <p className="bl-inline-note">
        This {provider.name} account can't reach any {noun}s yet. Create one in {provider.name}, or reconnect with an
        account that has access, then reopen this.
      </p>
    );
  }

  const total = destinations.data?.length ?? 0;
  return (
    <form
      className="bl-int-picker"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice) save.mutate();
      }}
    >
      <label className="bl-int-picker-label" htmlFor={`bl-dest-${integration.id}`}>
        Send tickets to this {noun}
      </label>
      {total > 12 && (
        <input
          className="bl-input"
          type="search"
          placeholder={`Filter ${total} ${noun}s`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label={`Filter ${noun}s`}
        />
      )}
      <div className="bl-int-picker-row">
        <select
          id={`bl-dest-${integration.id}`}
          className="bl-select bl-int-select"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          required
        >
          <option value="" disabled>
            Choose a {noun}…
          </option>
          {groups.map(([group, items]) =>
            group ? (
              <optgroup key={group} label={group}>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ) : (
              items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))
            ),
          )}
        </select>
        <button
          type="submit"
          className="bl-button"
          disabled={!choice || save.isPending || choice === integration.destination_id}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {save.isError && (
        <p role="alert" className="bl-error">
          {save.error instanceof Error ? save.error.message : "Could not save that choice."}
        </p>
      )}
    </form>
  );
}
