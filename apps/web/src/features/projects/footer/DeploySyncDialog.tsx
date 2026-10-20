import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { Schemas } from "@backline/types";
import { Dialog } from "../../../components/Dialog";
import { ApiError } from "../../../lib/api-client";
import { formatDate } from "../../../lib/date-format";
import { projectCan } from "../../../lib/project-roles";
import { qk } from "../../../lib/query-keys";
import * as api from "../api";

const STATUS: Record<Schemas["DeploymentOut"]["status"], string> = {
  awaiting_review: "Waiting for member review capture",
  captured: "Review captured",
  superseded: "Superseded by another deployment",
  cancelled: "Cancelled when the credential changed",
};

export function DeploySyncDialog({ project, onClose, onSelectPage }: {
  project: api.ProjectOut; onClose: () => void; onSelectPage: (pageId: string) => void;
}) {
  const cache = useQueryClient();
  const busy = useRef(false);
  const request = useRef<Schemas["DeployCredentialRequest"] | null>(null);
  const candidateVersion = useRef<number | null>(null);
  const revokeVersion = useRef<number | null>(null);
  const [retryRequest, setRetryRequest] = useState(false);
  const [retryRevoke, setRetryRevoke] = useState(false);
  const [confirmation, setConfirmation] = useState<"rotate" | "revoke" | null>(null);
  const [secret, setSecret] = useState<Schemas["DeployCredentialOut"] | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [closeWarning, setCloseWarning] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const settings = useQuery({ queryKey: qk.deploySync(project.id), queryFn: () => api.getDeploySync(project.id), refetchInterval: 30_000 });
  const history = useInfiniteQuery({
    queryKey: qk.deployments(project.id), initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.listDeployments(project.id, pageParam),
    getNextPageParam: page => page.next_cursor ?? undefined, refetchInterval: 30_000,
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: qk.deploySync(project.id) }),
      cache.invalidateQueries({ queryKey: qk.deployments(project.id) }),
      cache.invalidateQueries({ queryKey: qk.activity(project.workspace_id) }),
    ]);
  };
  const rotate = useMutation({
    gcTime: 0,
    mutationFn: async () => {
      if (busy.current || !settings.data) throw new Error("Load Deploy sync settings first.");
      busy.current = true;
      request.current ??= { expected_version: candidateVersion.current ?? settings.data.version, client_request_id: crypto.randomUUID() };
      setSecret(null);
      return api.createDeployCredential(project.id, request.current);
    },
    onSuccess: async result => {
      setSecret(result); setShowSecret(false); setCopyStatus("");
      request.current = null; candidateVersion.current = null; setRetryRequest(false); setConfirmation(null);
      await refresh();
    },
    onError: error => {
      if (error instanceof ApiError && [400, 403, 404, 409, 422].includes(error.status)) {
        request.current = null; candidateVersion.current = null; setRetryRequest(false); setConfirmation(null); void settings.refetch();
      } else setRetryRequest(Boolean(request.current));
    },
    onSettled: () => { busy.current = false; },
  });
  const revoke = useMutation({
    mutationFn: async () => {
      if (busy.current || !settings.data) throw new Error("Load Deploy sync settings first.");
      busy.current = true;
      revokeVersion.current ??= candidateVersion.current ?? settings.data.version;
      return api.revokeDeployCredential(project.id, revokeVersion.current);
    },
    onSuccess: async () => { revokeVersion.current = null; candidateVersion.current = null; setRetryRevoke(false); setSecret(null); setConfirmation(null); await refresh(); },
    onError: error => {
      if (error instanceof ApiError && [400, 403, 404, 409, 422].includes(error.status)) {
        revokeVersion.current = null; candidateVersion.current = null; setRetryRevoke(false); setConfirmation(null);
      } else setRetryRevoke(true);
      void settings.refetch();
    },
    onSettled: () => { busy.current = false; },
  });
  const pending = rotate.isPending || revoke.isPending;
  const canManage = projectCan(project, "manage");
  const fragmentRoute = Boolean(settings.data?.start_url.includes("#"));
  const canCreate = canManage && !project.archived_at && !fragmentRoute && !settings.isError;
  const rows = history.data?.pages.flatMap(page => page.items) ?? [];
  const error = rotate.error ?? revoke.error;
  const tryClose = () => {
    if (busy.current) return;
    if ((secret || retryRequest || retryRevoke) && !closeWarning) { setCloseWarning(true); return; }
    onClose();
  };
  async function copySecret() {
    if (!secret) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(secret.signing_secret);
      setCopyStatus("Secret copied.");
    } catch { setShowSecret(true); setCopyStatus("Copy was unavailable. Select the secret field and copy it manually."); }
  }
  function begin(action: "rotate" | "revoke") {
    if (busy.current) return;
    rotate.reset(); revoke.reset(); setCloseWarning(false);
    if (!retryRequest && !retryRevoke) candidateVersion.current = settings.data?.version ?? null;
    if (action === "rotate" && (!settings.data?.enabled || retryRequest)) rotate.mutate();
    else if (action === "revoke" && retryRevoke) revoke.mutate();
    else setConfirmation(action);
  }

  return <Dialog title="Deploy sync" onClose={tryClose}>
    <div className="bl-file-manager bl-deploy-sync">
      <p>Notify Backline after a successful deployment, then open the starting page in member review to capture it. Existing version recovery runs when captured content changes.</p>
      <p>A capture records the browser state observed after the notification. It does not verify a commit, clear browser caches or close tickets. Automatic background capture is unavailable.</p>
      {settings.isPending && <p role="status">Loading Deploy sync…</p>}
      {settings.error && <div role="alert"><p className="bl-error">{settings.error.message}</p><button className="bl-button" type="button" disabled={settings.isFetching} onClick={() => void settings.refetch()}>Retry settings</button></div>}
      {settings.data && <>
        <p role="status"><strong>{settings.data.credential_usable ? "Ready for signed notifications" : settings.data.unavailable_reason === "inactive_project" ? "Unavailable for this inactive project" : settings.data.unavailable_reason === "fragment_route" ? "Unavailable for fragment routes" : settings.data.enabled ? "Credential needs a current project manager" : "Deploy sync is off"}</strong></p>
        {settings.data.version > 0 && <p>Credential version {settings.data.version}{settings.data.rotated_at ? ` · Changed ${formatDate(settings.data.rotated_at, { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>}
        {fragmentRoute && <p>Deploy sync cannot distinguish fragment routes yet. Website review still works.</p>}
        {project.archived_at && <p>Restore this project before receiving deployment notifications.</p>}
        {!canManage && <p>A project manager can create, rotate or revoke the CI credential.</p>}
        <label>BACKLINE_HOOK_URL<input className="bl-input bl-mono" readOnly value={settings.data.hook_url} onFocus={event => event.target.select()} /></label>
        <label>BACKLINE_PROJECT_URL<input className="bl-input" readOnly value={settings.data.start_url} onFocus={event => event.target.select()} /></label>
        <label>BACKLINE_ENVIRONMENT<input className="bl-input" readOnly value={settings.data.environment} onFocus={event => event.target.select()} /></label>
        {canManage && <div className="bl-toolbar">
          <button type="button" className="bl-button mint" disabled={pending || !canCreate || retryRevoke} onClick={() => begin("rotate")}>{rotate.isPending ? "Creating…" : retryRequest ? "Retry credential request" : settings.data.enabled ? "Replace credential" : "Create CI credential"}</button>
          {(settings.data.enabled || retryRevoke) && <button type="button" className="bl-button" disabled={pending || retryRequest} onClick={() => begin("revoke")}>{retryRevoke ? "Retry revocation" : "Revoke credential"}</button>}
        </div>}
        {confirmation && <div className="bl-file-confirm">
          <p>Credential version {candidateVersion.current}. {confirmation === "rotate" ? "Replace this signing secret? Update your CI secret afterward. Pending deployment captures will be cancelled." : "Revoke this signing secret and cancel pending captures? New notifications will be rejected until a manager creates another credential."}</p>
          <div className="bl-toolbar"><button type="button" className="bl-button" disabled={pending} onClick={() => setConfirmation(null)}>Cancel</button><button type="button" className="bl-button mint" disabled={pending} onClick={() => { if (!busy.current) { if (confirmation === "rotate") rotate.mutate(); else revoke.mutate(); } }}>{pending ? "Saving…" : confirmation === "rotate" ? "Replace signing secret" : "Revoke signing secret"}</button></div>
        </div>}
        {error && <p role="alert" className="bl-error">{error.message}{retryRequest ? " Retry keeps the same credential request." : ""}</p>}
        {secret && <div className="bl-file-confirm">
          <p><strong>Save this as BACKLINE_DEPLOY_SECRET in your CI secret store.</strong> It is shown for this creation request only. Credential version {secret.version}.</p>
          <label>Signing secret<input className="bl-input bl-mono" type={showSecret ? "text" : "password"} readOnly value={secret.signing_secret} onFocus={event => event.target.select()} /></label>
          <div className="bl-toolbar"><button type="button" className="bl-button" onClick={() => setShowSecret(value => !value)}>{showSecret ? "Hide secret" : "Show secret"}</button><button type="button" className="bl-button" onClick={() => void copySecret()}>Copy secret</button><button type="button" className="bl-quiet" onClick={() => { setSecret(null); setCloseWarning(false); setCopyStatus(""); }}>I saved the secret</button></div>
          {copyStatus && <p role="status">{copyStatus}</p>}
        </div>}
        <section aria-label="CI setup">
          <h3>Connect your deployment job</h3>
          <p><a className="bl-text-link" href="/backline-deploy.mjs" download>Download the CI sender</a> and run <code>node backline-deploy.mjs</code> with Node.js 20 or newer after deployment succeeds.</p>
          <p>Set the three values above and BACKLINE_DEPLOY_SECRET. Set BACKLINE_DELIVERY_ID to a unique deployment ID, BACKLINE_DEPLOYED_AT to its ISO timestamp, and optionally BACKLINE_COMMIT_REF to its commit reference.</p>
          <p>Keep the delivery ID, deployment time and payload values unchanged when retrying. The sender retries up to three times. Use a separate project for a different environment or starting URL.</p>
          <button type="button" className="bl-button" disabled={pending || Boolean(secret) || retryRequest || retryRevoke || !settings.data.credential_usable} onClick={() => { onSelectPage(""); onClose(); }}>Go to starting page</button>
          <p>Then reload or reopen website review to submit a fresh snapshot. Save the signing secret before leaving this dialog.</p>
        </section>
      </>}
      <section aria-label="Deploy history">
        <div className="bl-toolbar"><h3>Deployment history</h3><button type="button" className="bl-quiet" disabled={history.isFetching || settings.isFetching} onClick={() => { void settings.refetch(); void history.refetch(); }}>Refresh</button></div>
        {history.isPending && <p role="status">Loading deployment history…</p>}
        {history.error && <div role="alert"><p className="bl-error">{history.error.message}</p><button type="button" className="bl-button" disabled={history.isFetching} onClick={() => void history.refetch()}>Retry history</button></div>}
        {history.isSuccess && rows.length === 0 && <p>No deployment notifications yet. Configure the sender, deploy successfully and check this history.</p>}
        <ol className="bl-deployment-list">{rows.map(row => <li key={row.id}>
          <strong>{row.status === "cancelled" && row.cancel_reason === "project_changed" ? "Cancelled when the project address or environment changed" : STATUS[row.status]}</strong>
          <span className="bl-mono">{row.delivery_id}{row.commit_ref ? ` · ${row.commit_ref}` : ""}</span>
          <small>Deployed {formatDate(row.deployed_at, { dateStyle: "medium", timeStyle: "short" })} · Received {formatDate(row.received_at, { dateStyle: "medium", timeStyle: "short" })}</small>
          {row.status === "awaiting_review" && <p>Open or reload the configured starting page in member review. Snapshot submissions already in progress before this notification cannot complete it.</p>}
          {row.status === "captured" && <p>Version {row.revision_id?.slice(-8)} · {row.recovery_delivery_state === "done" ? "Version delivery complete. Review ticket recovery results separately." : "Version delivery pending; the worker retries failures."}</p>}
          {row.page_id && <button type="button" className="bl-quiet" disabled={pending || Boolean(secret) || retryRequest || retryRevoke} onClick={() => { onSelectPage(row.page_id!); onClose(); }}>Open page</button>}
        </li>)}</ol>
        {history.hasNextPage && <button type="button" className="bl-button" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>{history.isFetchingNextPage ? "Loading…" : "Load older deployments"}</button>}
      </section>
      {closeWarning && <p role="alert">{secret ? "Closing hides this secret. Save it in your CI secret store first, or replace the credential later." : "This credential change was not confirmed. Check settings before replacing it; closing loses this tab's retry request."} Press Close again to leave.</p>}
    </div>
    <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-button" disabled={pending} onClick={tryClose}>Close</button></footer>
  </Dialog>;
}
