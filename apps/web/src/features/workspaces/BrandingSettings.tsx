import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import * as brandingApi from "./branding-api";
import type { WorkspaceOut } from "./api";

/** Client-facing branding, white-label and custom review domains (Settings). Only what
 * clients see on review links changes; the team dashboard keeps Backline's look. */
export function BrandingSettings({ workspace, canEdit }: { workspace: WorkspaceOut; canEdit: boolean }) {
  const { toast } = useToast();
  const cache = useQueryClient();
  const branding = useQuery({ queryKey: qk.branding(workspace.id), queryFn: () => brandingApi.getBranding(workspace.id) });
  const domains = useQuery({ queryKey: qk.domains(workspace.id), queryFn: () => brandingApi.listDomains(workspace.id), enabled: Boolean(branding.data?.can_use_custom_domain) });
  const [displayName, setDisplayName] = useState("");
  const [accent, setAccent] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [host, setHost] = useState("");
  const logoInput = useRef<HTMLInputElement>(null);
  const data = branding.data;
  // Load the saved values once; later refetches (a logo upload, a save) must not
  // overwrite what's being typed.
  const loaded = useRef(false);
  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    setDisplayName(data.display_name ?? "");
    setAccent(data.accent_color ?? "");
    setSupportEmail(data.support_email ?? "");
  }, [data]);

  const onSaved = (next: brandingApi.Branding, message: string) => {
    cache.setQueryData(qk.branding(workspace.id), next);
    toast(message, "success");
  };
  const save = useMutation({
    mutationFn: (body: Parameters<typeof brandingApi.updateBranding>[1]) => brandingApi.updateBranding(workspace.id, body),
    onSuccess: (next) => onSaved(next, "Client branding saved."),
    onError: (error) => toast(error instanceof Error ? error.message : "Branding could not be saved.", "error"),
  });
  const logo = useMutation({
    mutationFn: (file: File) => brandingApi.uploadLogo(workspace.id, file),
    onSuccess: (next) => onSaved(next, "Logo updated."),
    onError: (error) => toast(error instanceof Error ? error.message : "The logo could not be uploaded.", "error"),
  });
  const refreshDomains = () => cache.invalidateQueries({ queryKey: qk.domains(workspace.id) });
  const add = useMutation({
    mutationFn: () => brandingApi.addDomain(workspace.id, host),
    onSuccess: () => { setHost(""); void refreshDomains(); },
    onError: (error) => toast(error instanceof Error ? error.message : "The domain could not be added.", "error"),
  });
  const verify = useMutation({
    mutationFn: (id: string) => brandingApi.verifyDomain(workspace.id, id),
    onSuccess: (domain) => {
      void refreshDomains();
      void cache.invalidateQueries({ queryKey: qk.branding(workspace.id) });
      toast(domain.status === "verified" ? (domain.connected ? `${domain.host} is live for review links.` : `${domain.host} is verified.`) : "The DNS record isn't visible yet.", domain.status === "verified" ? "success" : "error");
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Verification failed.", "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => brandingApi.removeDomain(workspace.id, id),
    onSuccess: () => { void refreshDomains(); void cache.invalidateQueries({ queryKey: qk.branding(workspace.id) }); },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || save.isPending) return;
    save.mutate({ display_name: displayName.trim(), accent_color: accent, support_email: supportEmail.trim() });
  }

  const locked = data && !data.can_customize;
  const billing = <Link to={`/w/${workspace.slug}/billing`}>See plans</Link>;
  return <>
    <section className="ws-card">
      <header>
        <h2>Client branding</h2>
        <p>Your name, colour and logo on review links and the client portal. The team dashboard is unchanged.</p>
      </header>
      <div className="ws-settings-body">
        {branding.isLoading ? <p role="status">Loading branding…</p>
          : branding.error ? <p role="alert" className="bl-error">{branding.error.message}</p>
          : locked ? <p className="ws-settings-note">Custom branding and review domains are part of the Team plan. {billing}</p>
          : data && <form className="bl-branding-form" onSubmit={submit}>
            <div className="bl-branding-preview" style={{ ["--bl-brand" as string]: accent || "#0A6B4B" }}>
              {data.logo_url ? <img src={data.logo_url} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : <span aria-hidden="true">{(displayName || workspace.name).slice(0, 1).toUpperCase()}</span>}
              <div><strong>{displayName || workspace.name}</strong><small>Review link preview</small></div>
              <i aria-hidden="true" />
            </div>
            <label className="ws-settings-field">Name clients see
              <input className="bl-input" maxLength={80} value={displayName} placeholder={workspace.name} disabled={!canEdit} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="ws-settings-field">Accent colour
              <span className="ws-settings-inline">
                <input type="color" aria-label="Pick accent colour" value={accent || "#0A6B4B"} disabled={!canEdit} onChange={(event) => setAccent(event.target.value.toUpperCase())} />
                <input className="bl-input bl-mono" maxLength={7} value={accent} placeholder="#0A6B4B" disabled={!canEdit} onChange={(event) => setAccent(event.target.value)} />
              </span>
            </label>
            <label className="ws-settings-field">Support email shown to clients
              <input className="bl-input" type="email" maxLength={254} value={supportEmail} placeholder="support@youragency.com" disabled={!canEdit} onChange={(event) => setSupportEmail(event.target.value)} />
            </label>
            <div className="ws-settings-field">Logo
              <span className="ws-settings-inline">
                <button type="button" className="bl-quiet" disabled={!canEdit || logo.isPending} onClick={() => logoInput.current?.click()}>{logo.isPending ? "Uploading…" : data.logo_url ? "Replace logo" : "Upload logo"}</button>
                {data.logo_url && <button type="button" className="bl-quiet" disabled={!canEdit || save.isPending} onClick={() => save.mutate({ remove_logo: true })}>Remove</button>}
                <small>PNG, JPG or WebP, up to 512 KB.</small>
              </span>
              <input ref={logoInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) logo.mutate(file); }} />
            </div>
            <label className={`bl-setting-row${canEdit && data.can_white_label ? "" : " bl-setting-row-static"}`}>
              <span className="bl-setting-copy">
                <strong>White-label client portal</strong>
                <span>{data.can_white_label ? "Hide Backline's name and logo from review links, so clients only see your brand." : <>Part of the Enterprise plan. {billing}</>}</span>
              </span>
              <input type="checkbox" className="bl-switch-input" checked={data.hide_backline_branding} disabled={!canEdit || !data.can_white_label || save.isPending} aria-label="White-label client portal" onChange={(event) => save.mutate({ hide_backline_branding: event.target.checked })} />
              <span className="bl-switch" aria-hidden="true"><i /></span>
            </label>
            {canEdit && <div><button className="bl-button" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save branding"}</button></div>}
          </form>}
      </div>
    </section>

    {data?.can_use_custom_domain && <section className="ws-card">
      <header>
        <h2>Review domain</h2>
        <p>Send review links on your own domain, like review.youragency.com.</p>
      </header>
      <div className="ws-settings-body">
        {canEdit && <form className="ws-settings-inline" onSubmit={(event) => { event.preventDefault(); if (host.trim() && !add.isPending) add.mutate(); }}>
          <input className="bl-input" aria-label="Domain" placeholder="review.youragency.com" value={host} onChange={(event) => setHost(event.target.value)} />
          <button className="bl-button" disabled={!host.trim() || add.isPending}>{add.isPending ? "Adding…" : "Add domain"}</button>
        </form>}
        {domains.isLoading && <p role="status">Loading domains…</p>}
        {domains.error && <p role="alert" className="bl-error">{domains.error.message}</p>}
        {domains.data?.length === 0 && <p className="ws-settings-note">No review domain yet. Links use this Backline address.</p>}
        <ul className="bl-domain-list">
          {domains.data?.map((domain) => <li key={domain.id}>
            <div className="bl-domain-head">
              <strong>{domain.host}</strong>
              <span className={`bl-domain-state is-${domain.status === "verified" ? (domain.connected ? "live" : "verified") : domain.status}`}>{domain.status === "verified" ? (domain.connected ? "Live" : "Verified") : "Waiting for DNS"}</span>
              {canEdit && <span className="bl-domain-actions">
                <button type="button" className="bl-quiet" disabled={verify.isPending} onClick={() => verify.mutate(domain.id)}>{verify.isPending && verify.variables === domain.id ? "Checking…" : domain.status === "verified" ? "Check again" : "Verify"}</button>
                <button type="button" className="bl-quiet" disabled={remove.isPending} onClick={() => remove.mutate(domain.id)}>Remove</button>
              </span>}
            </div>
            {!(domain.status === "verified" && domain.connected) && <ol className="bl-domain-steps">
              <li>Add a <b>TXT</b> record <code>{domain.txt_name}</code> with value <code>{domain.txt_value}</code>.</li>
              <li>Add a <b>CNAME</b> record for <code>{domain.host}</code> pointing to <code>{domain.cname_target}</code>.</li>
              <li>Press Verify. DNS changes can take up to an hour to appear.</li>
            </ol>}
            {domain.last_error && <p className="ws-settings-note">{domain.last_error}</p>}
          </li>)}
        </ul>
      </div>
    </section>}
  </>;
}
