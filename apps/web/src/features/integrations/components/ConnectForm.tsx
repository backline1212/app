import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import * as integrationsApi from "../api";
import type { IntegrationOut, OAuthAppOut } from "../api";
import { startOAuth } from "../oauth-state";
import { DEFAULT_TOGGLES, type NotifyToggles, type Provider } from "../providers";
import { NotifySwitches } from "./NotifySwitches";

interface ConnectFormProps {
  provider: Provider;
  workspace: { id: string; slug: string };
  oauthApp: OAuthAppOut | undefined;
  onConnected: (integration: IntegrationOut) => void;
  onCancel: () => void;
}

/**
 * Connects one provider. Every provider works with a token or webhook URL the admin
 * pastes here; ClickUp/Jira/Asana also offer "Continue with …" when the operator has
 * configured that provider's OAuth app (the API reports which ones are).
 */
export function ConnectForm({ provider, workspace, oauthApp, onConnected, onCancel }: ConnectFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(provider.fields.map((field) => [field.name, field.defaultValue ?? ""])),
  );
  const [toggles, setToggles] = useState<NotifyToggles>(DEFAULT_TOGGLES);

  const connect = useMutation({
    mutationFn: () => integrationsApi.connectIntegration(workspace.id, provider.toBody(values, toggles)),
    onSuccess: onConnected,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    connect.mutate();
  }

  const fieldId = (name: string) => `bl-int-${provider.type}-${name}`;

  return (
    <form className="bl-int-form" onSubmit={submit}>
      <ol className="bl-int-steps">
        {provider.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <a className="bl-text-link" href={provider.helpUrl} target="_blank" rel="noreferrer">
        {provider.helpLabel} ↗
      </a>

      {oauthApp && (
        <div className="bl-int-oauth">
          <button type="button" className="bl-button" onClick={() => startOAuth(oauthApp, workspace)}>
            Continue with {provider.name}
          </button>
          <span className="bl-mono">or paste a token below</span>
        </div>
      )}

      <div className="bl-int-fields">
        {provider.fields.map((field) => (
          <label key={field.name} htmlFor={fieldId(field.name)}>
            <span>
              {field.label}
              {field.optional && <small> (optional)</small>}
            </span>
            <input
              id={fieldId(field.name)}
              className="bl-input"
              type={field.type ?? "text"}
              required={!field.optional}
              autoComplete="off"
              spellCheck={false}
              placeholder={field.placeholder}
              value={values[field.name] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
            />
          </label>
        ))}
      </div>

      {provider.kind === "notifier" && <NotifySwitches value={toggles} onChange={setToggles} />}

      {connect.isError && (
        <p role="alert" className="bl-error">
          {connect.error instanceof Error ? connect.error.message : `Could not connect ${provider.name}.`}
        </p>
      )}

      <div className="bl-int-actions">
        <button type="submit" className="bl-button" disabled={connect.isPending}>
          {connect.isPending ? "Checking…" : `Connect ${provider.name}`}
        </button>
        <button type="button" className="bl-quiet" onClick={onCancel} disabled={connect.isPending}>
          Cancel
        </button>
        <span className="bl-mono">
          {provider.kind === "notifier"
            ? "Backline sends a test message to confirm it works."
            : "Backline checks the credentials before saving them, encrypted."}
        </span>
      </div>
    </form>
  );
}
