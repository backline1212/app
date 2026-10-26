import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schemas } from "@backline/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Dialog } from "../../components/Dialog";
import { ApiError } from "../../lib/api-client";
import { type ProjectRole, type ProjectVisibility, roleLabel } from "../../lib/project-roles";
import { invalidateProjectMutation, qk } from "../../lib/query-keys";
import { useAuth } from "../auth/AuthContext";
import { uploadAsset } from "../assets/api";
import { planLimitUpgrade } from "../billing/api";
import { listClients } from "../clients/api";
import { listShareLinks } from "../share-links/api";
import { reviewLinkState } from "../share-links/link-state";
import { listMembers } from "../workspaces/api";
import type { WorkspaceOut } from "../workspaces/api";
import { ProjectAccessFields } from "./access/ProjectAccessFields";
import * as api from "./api";
import { reviewLinkUrl, useReviewDomain } from "../workspaces/review-url";
import { getSubscription } from "../billing/api";

type ProjectType = "website" | "image" | "pdf";
// Web App and Mobile App are review flavours of a website and an image project
// (ProjectOut.variant), so they reuse those review paths end to end.
type ProjectKind = ProjectType | "webapp" | "mobile";

const PROJECT_TYPES: Array<{
  id: ProjectKind;
  label: string;
  description: string;
}> = [
  { id: "website", label: "Website", description: "Public or staging websites, including sign-in pages. Use browser review when needed." },
  { id: "webapp", label: "Web App", description: "Signed-in apps. Comments carry steps to reproduce plus console and network errors." },
  { id: "mobile", label: "Mobile App", description: "Screens from TestFlight, APK or device builds, grouped by build and device." },
  { id: "image", label: "Images", description: "PNG, JPG, WebP or GIF. Comments pin to the artwork itself." },
  { id: "pdf", label: "PDF", description: "Pin comments to pages in an uploaded PDF document." },
];

function TypeIcon({ type }: { type: (typeof PROJECT_TYPES)[number]["id"] }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {type === "website" && <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" /></>}
      {type === "image" && <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.7" /><path d="m21 15-5-5L5 20" /></>}
      {type === "pdf" && <><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5M9 14h6M9 17h4" /></>}
      {type === "webapp" && <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></>}
      {type === "mobile" && <><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18.5h2" /></>}
    </svg>
  );
}

function SettingRow({ checked, description, label, onChange }: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="bl-setting-row">
      <span className="bl-setting-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <input className="bl-switch-input" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="bl-switch" aria-hidden="true"><i /></span>
    </label>
  );
}

function SettingStatusRow({ description, label, status }: {
  description: string;
  label: string;
  status: string;
}) {
  return (
    <div className="bl-setting-row bl-setting-row-static">
      <span className="bl-setting-copy">
        <strong>{label}<span className="bl-saved-only">{status}</span></strong>
        <span>{description}</span>
      </span>
    </div>
  );
}

function detectEnvironment(value: string): "live" | "staging" {
  return /(^|[./-])(staging|stage|dev|preview|test|localhost)([./:-]|$)|vercel\.app|netlify\.app|webflow\.io/i.test(value) ? "staging" : "live";
}

export function ProjectForm({ workspace, project, initialType, initialClientId, onClose }: {
  workspace: WorkspaceOut;
  project?: api.ProjectOut;
  initialType?: ProjectKind;
  /** Preselects the client, for "New project" started from that client's row. */
  initialClientId?: string;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clients = useQuery({ queryKey: qk.clients(workspace.id), queryFn: () => listClients(workspace.id) });
  const membersQuery = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => listMembers(workspace.id) });
  const [phase, setPhase] = useState<"type" | "details" | "saving" | "retry" | "complete">(project ? "details" : "type");
  const submitting = useRef(false);
  const close = () => { if (!submitting.current) onClose(); };
  const [kind, setKind] = useState<ProjectKind>(project?.variant ?? project?.project_type ?? initialType ?? "website");
  const type: ProjectType = kind === "webapp" ? "website" : kind === "mobile" ? "image" : kind;
  const variant = kind === "webapp" || kind === "mobile" ? kind : null;
  const [buildLabel, setBuildLabel] = useState("");
  const [device, setDevice] = useState("");
  const [platform, setPlatform] = useState("");
  const [typeChosen, setTypeChosen] = useState(Boolean(project || initialType));
  const [name, setName] = useState(project?.name ?? "");
  const [url, setUrl] = useState(project?.start_url ?? project?.target_origin ?? "");
  const [client, setClient] = useState(project?.client_id ?? initialClientId ?? "");
  const [environment, setEnvironment] = useState<"live" | "staging">(project?.environment ?? "live");
  const [environmentEdited, setEnvironmentEdited] = useState(Boolean(project));
  const [captureDeviceDetails, setCaptureDeviceDetails] = useState(project?.settings.capture_device_details ?? false);
  const [reviewerCanResolve, setReviewerCanResolve] = useState(project?.settings.reviewer_can_resolve ?? false);
  const [showBoardToClient, setShowBoardToClient] = useState(project?.settings.show_board_to_client ?? false);
  // How clients open the review link (TDR-0207); the URL check suggests one until the
  // person picks it themselves.
  const [clientReviewMode, setClientReviewMode] = useState<ClientReviewMode>(project?.settings.client_review_mode ?? "ask");
  const reviewModeEdited = useRef(Boolean(project));
  const [enableCrossBrowserRender, setEnableCrossBrowserRender] = useState(project?.settings.enable_cross_browser_render ?? false);
  const expectedVersion = useRef(project?.metadata_version ?? 0);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [latestError, setLatestError] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [newClientContact, setNewClientContact] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [created, setCreated] = useState<api.ProjectOut | null>(null);
  const createdRef = useRef<api.ProjectOut | null>(null);
  const preparedCreate = useRef<Schemas["ProjectCreate"] | null>(null);
  const preparedUpdate = useRef<Schemas["ProjectUpdate"] | null>(null);
  const ambiguous = useRef(false);
  const [retryLocked, setRetryLocked] = useState(false);
  const [draftCopy, setDraftCopy] = useState("");
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  // Access (TDR-0056): only chosen when creating - an existing project's access is
  // managed from its Share dialog, where everyone with access is listed.
  const [visibility, setVisibility] = useState<ProjectVisibility>("workspace");
  const [defaultRole, setDefaultRole] = useState<ProjectRole>("editor");
  const [grants, setGrants] = useState<Record<string, ProjectRole>>({});
  const [peopleQuery, setPeopleQuery] = useState("");
  const { role: myRole, user } = useAuth();
  const reviewDomain = useReviewDomain(workspace.id);
  // Said on the first step, before anything is filled in, when the plan is full.
  const subscription = useQuery({ queryKey: qk.subscription(workspace.id), queryFn: () => getSubscription(workspace.id), enabled: !project });
  const projectUsage = subscription.data?.usage;
  const atProjectLimit = Boolean(projectUsage && projectUsage.projects_limit !== null && projectUsage.projects_used >= projectUsage.projects_limit);


  const selectedClient = useMemo(() => clients.data?.find((item) => item.id === client), [client, clients.data]);
  const typeLabel = PROJECT_TYPES.find((item) => item.id === kind)?.label ?? "Project";

  function selectFiles(selected: File[]) {
    if (submitting.current) return;
    setFileError("");
    const allowed = type === "pdf"
      ? selected.filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))
      : selected.filter((file) => /^(image\/(png|jpeg|webp|gif))$/.test(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name));
    if (allowed.length !== selected.length) setFileError(type === "pdf" ? "Choose a valid PDF document." : "Choose PNG, JPG, WebP or GIF images.");
    if (allowed.some((file) => file.size > 20 * 1024 * 1024)) { setFileError("Each file must be smaller than 20 MB."); return; }
    if (type === "pdf" && allowed.length > 1) { setFileError("PDF projects accept one document."); setFiles(allowed.slice(0, 1)); return; }
    if (type === "image" && allowed.length > 50) { setFileError("Image projects accept up to 50 files."); setFiles(allowed.slice(0, 50)); return; }
    const completed = files.filter((file) => uploaded.includes(`${file.name}:${file.size}:${file.lastModified}`));
    const unique = Array.from(new Map([...completed, ...allowed].map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file])).values());
    if (unique.length > (type === "pdf" ? 1 : 50)) { setFileError("Remove pending files before adding more."); return; }
    setFiles(unique);
  }

  // The review URL is checked as it's typed (TDR-0206): whether it loads, needs sign-in
  // or is bot-protected - and http:// when the site doesn't answer on https.
  const [urlCheck, setUrlCheck] = useState<{ input: string; result: api.UrlCheckOut | null; error: string | null } | null>(null);
  const checkingUrl = type === "website" && !created && Boolean(url.trim()) && urlCheck?.input !== url.trim();
  useEffect(() => {
    const input = url.trim();
    if (type !== "website" || created || !input || (project && input === (project.start_url ?? project.target_origin))) { setUrlCheck(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.checkProjectUrl(workspace.id, input, controller.signal)
        .then((result) => {
          const typedScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
          if (!typedScheme && result.url.startsWith("http://")) {
            // Keep what was typed, with the scheme that works; the effect re-checks it.
            setUrl(result.url);
            return;
          }
          setUrlCheck({ input, result, error: null });
          if (!reviewModeEdited.current) {
            setClientReviewMode(result.status === "ok" ? "preview" : result.status === "sign_in" || result.status === "blocked" ? "extension" : "ask");
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setUrlCheck({ input, result: null, error: error instanceof Error ? error.message : "Couldn't check this address." });
        });
    }, 700);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [url, type, created, project, workspace.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (submitting.current) throw new Error("A save is already in progress.");
      submitting.current = true;
      setPhase("saving");
      const newClient = client === "new" ? { name: newClientName.trim(), contact_name: newClientContact.trim(), email: newClientEmail.trim() || null, client_request_id: crypto.randomUUID() } : null;
      const clientId = client === "new" ? null : client || null;
      if (project) {
        const settings = {
          capture_device_details: captureDeviceDetails,
          reviewer_can_resolve: reviewerCanResolve,
          show_board_to_client: showBoardToClient,
          enable_cross_browser_render: enableCrossBrowserRender,
          ...(type === "website" ? { client_review_mode: clientReviewMode } : {}),
        };
        preparedUpdate.current ??= { name: name.trim(), ...(type === "website" ? { target_origin: url.trim(), environment } : {}), client_id: clientId, new_client: newClient, settings, expected_metadata_version: expectedVersion.current, client_request_id: crypto.randomUUID() };
        return api.updateProject(project.id, preparedUpdate.current);
      }
      const members = Object.entries(grants).map(([user_id, role]) => ({ user_id, role }));
      preparedCreate.current ??= { name: name.trim(), target_origin: type === "website" ? url.trim() : "", project_type: type, variant, environment, client_id: clientId, new_client: newClient, visibility, default_role: defaultRole, members, ...(type === "website" ? { client_review_mode: clientReviewMode } : {}), client_request_id: crypto.randomUUID() };
      const request = preparedCreate.current;
      const current = createdRef.current ?? await api.createProject(workspace.id, request.name, request.target_origin ?? "", request);
      createdRef.current = current;
      setCreated(current);
      setRetryLocked(false);
      if (current.client_id) {
        setClient(current.client_id);
        void cache.invalidateQueries({ queryKey: qk.clients(workspace.id) });
      }
      for (const file of files) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!uploaded.includes(key)) { await uploadAsset(current.id, file, kind === "mobile" ? { build_label: buildLabel, device, platform } : undefined); setUploaded((old) => [...old, key]); }
      }
      const links = await listShareLinks(current.id).catch(() => []);
      const active = links.find((item) => reviewLinkState(item) === "active");
      setLink(active ? reviewLinkUrl(active.token, reviewDomain) : "");
      return current;
    },
    onError: (error) => {
      if (!createdRef.current) {
        if (!ambiguous.current && error instanceof ApiError && [400, 402, 403, 404, 413, 422].includes(error.status)) {
          preparedCreate.current = null;
          preparedUpdate.current = null;
          setRetryLocked(false);
        } else {
          ambiguous.current = true;
          setRetryLocked(true);
        }
      }
      setPhase("retry");
    },
    onSettled: () => { submitting.current = false; },
    onSuccess: async () => {
      await invalidateProjectMutation(cache, workspace.id);
      await cache.invalidateQueries({ queryKey: qk.clients(workspace.id) });
      if (project) { await cache.invalidateQueries({ queryKey: qk.project(project.id) }); onClose(); }
      else setPhase("complete");
    },
  });
  const upgradePlan = planLimitUpgrade(save.error);
  // Said next to the disabled Create button, so it never sits there unexplained.
  const missingFields = [
    !name.trim() && "a project name",
    type === "website" && !url.trim() && "a review URL",
    type !== "website" && !project && files.length === 0 && (kind === "mobile" ? "at least one screen" : type === "pdf" ? "a PDF" : "images"),
    client === "new" && !newClientName.trim() && "the client's name",
  ].filter((item): item is string => Boolean(item));
  function projectDraftText() {
    return JSON.stringify({
      name, project_type: type, ...(type === "website" ? { url, environment } : {}),
      client: client === "new" ? { name: newClientName, contact: newClientContact, email: newClientEmail } : selectedClient?.name ?? client,
      ...(project ? { settings: { capture_device_details: captureDeviceDetails, reviewer_can_resolve: reviewerCanResolve, show_board_to_client: showBoardToClient, enable_cross_browser_render: enableCrossBrowserRender } } : {}),
    }, null, 2);
  }
  const updateConflict = Boolean(project && save.error instanceof ApiError && save.error.status === 409);
  async function loadLatestDetails() {
    if (!project || submitting.current) return;
    submitting.current = true; setLoadingLatest(true); setLatestError("");
    try {
      const latest = await api.getProject(project.id);
      expectedVersion.current = latest.metadata_version ?? 0;
      setName(latest.name); setUrl(latest.start_url ?? latest.target_origin); setClient(latest.client_id ?? ""); setEnvironment(latest.environment); setEnvironmentEdited(true);
      setCaptureDeviceDetails(latest.settings.capture_device_details); setReviewerCanResolve(latest.settings.reviewer_can_resolve); setShowBoardToClient(latest.settings.show_board_to_client); setEnableCrossBrowserRender(latest.settings.enable_cross_browser_render); setClientReviewMode(latest.settings.client_review_mode ?? "ask");
      setNewClientName(""); setNewClientContact(""); setNewClientEmail("");
      preparedUpdate.current = null; ambiguous.current = false; setRetryLocked(false); setDraftCopy(""); setPhase("details"); save.reset();
      cache.setQueryData(qk.project(latest.id), latest);
    } catch (error) { setLatestError(error instanceof Error ? error.message : "Latest details could not be loaded."); }
    finally { submitting.current = false; setLoadingLatest(false); }
  }

  if (phase === "complete" && created) {
    return (
      <Dialog title="Project created" onClose={close}>
        <div className="bl-project-success">
          <span className="bl-success-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5" /></svg></span>
          <p className="bl-dialog-kicker">{created.name}{selectedClient ? ` · ${selectedClient.name}` : ""}</p>
          <h3>{type === "website" ? "Your project is saved. Try the review first." : "Your files are ready for review."}</h3>
          {type === "website" ? <>
            <p>Check the page before sharing it with your client. Creating a project doesn't verify the website's loading or sign-in.</p>
            <ol className="bl-setup-checklist"><li>Open the project and check the website loads.</li><li>If it asks for sign-in or doesn't load, choose Open with extension and sign in on the real website.</li><li>Save a first comment, confirm it appears in Backline, then send the review link.</li></ol>
          </> : <p>Open the project to check the uploaded files, then share the review link.</p>}
          {link ? (
            <div className="bl-link-row">
              <input className="bl-input bl-mono" aria-label="Review link" readOnly value={link} onFocus={(event) => event.target.select()} />
              <button type="button" className="bl-quiet" onClick={() => { setCopyError(""); void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setCopyError("Select the link and copy it manually.")); }}>{copied ? "Copied" : "Copy link"}</button>
            </div>
          ) : <p className="bl-inline-warning">The project was created, but its review link could not be loaded. Open the project and use Share to retrieve it.</p>}
          {copyError && <p role="alert" className="bl-error">{copyError}</p>}
          <p className="bl-policy-note">Reviewers are asked for a name before their first comment on the default link.</p>
          <footer className="bl-dialog-actions"><button type="button" className="bl-quiet" onClick={onClose}>Done</button><Link className="bl-button mint" to={`/w/${workspace.slug}/p/${created.id}`} onClick={onClose}>{type === "website" ? "Open and check review" : "Open project"}</Link></footer>
        </div>
      </Dialog>
    );
  }

  if (!project && !workspace.members_can_create_projects && myRole === "member") {
    return (
      <Dialog title="New project" onClose={close}>
        <div className="bl-state-panel">
          <h3>Only owners and admins can create projects here</h3>
          <p>{workspace.name} keeps project creation to its owners and admins. Ask one of them to set the project up and add you to it.</p>
        </div>
        <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-button" onClick={onClose}>Got it</button></footer>
      </Dialog>
    );
  }

  if (!project && phase === "type") {
    return (
      <Dialog title="New project" onClose={close}>
        <div className="bl-dialog-progress" aria-label="Step 1 of 3"><i className="is-on" /><i /><i /></div>
        <div className="bl-dialog-intro"><p>What are you collecting feedback on?</p></div>
        {atProjectLimit && projectUsage && <p className="bl-inline-warning bl-plan-full" role="status">{subscription.data?.plan_name ?? "Your plan"} includes {projectUsage.projects_limit} active projects and they're all in use. Archive one or <Link to={`/w/${workspace.slug}/billing`} onClick={onClose}>upgrade your plan</Link> to add another.</p>}
        <div className="bl-project-type-body">
          <div className="bl-project-type-grid primary" role="radiogroup" aria-label="Project type">
            {PROJECT_TYPES.map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={typeChosen && kind === item.id} className="bl-project-type-card" onClick={() => { if (kind !== item.id) { setFiles([]); setFileError(""); } setKind(item.id); setTypeChosen(true); }}><span className="bl-type-icon"><TypeIcon type={item.id} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span></button>
            ))}
          </div>
        </div>
        <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-quiet" onClick={onClose}>Cancel</button><button type="button" className="bl-button mint" disabled={!typeChosen} onClick={() => setPhase("details")}>Continue</button></footer>
      </Dialog>
    );
  }

  let validUrl = type !== "website";
  if (type === "website") {
    try { const parsed = new URL(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`); validUrl = ["http:", "https:"].includes(parsed.protocol) && !!parsed.hostname && !parsed.username && !parsed.password; } catch { validUrl = false; }
  }
  const canSubmit = validUrl && Boolean(name.trim() && (client !== "new" || newClientName.trim()) && (type === "website" ? url.trim() : project || files.length > 0) && !fileError);

  return (
    <Dialog title={project ? "Project settings" : type === "website" ? "Add the page to review" : "Upload your files"} onClose={close}>
      {!project && <div className="bl-dialog-progress" aria-label="Step 2 of 3"><i className="is-on" /><i className="is-on" /><i /></div>}
      <div className="bl-dialog-intro"><p>{project ? project.name : `${typeLabel} project`}</p></div>
      <form className="bl-project-form" onSubmit={(event) => { event.preventDefault(); if (canSubmit && !submitting.current) save.mutate(); }}>
        <fieldset disabled={phase === "saving" || retryLocked || loadingLatest} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="bl-form-section">
          <label htmlFor="project-client">Client</label>
          {clients.isLoading ? <div className="bl-input bl-input-loading" role="status">Loading clients…</div> : clients.isError ? <div className="bl-inline-error" role="alert"><span>Clients could not load.</span><button type="button" onClick={() => clients.refetch()}>Try again</button></div> : (
            <select id="project-client" className="bl-input" value={client} onChange={(event) => setClient(event.target.value)} disabled={Boolean(created) || save.isPending}><option value="">No client — internal work</option>{clients.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="new">＋ Add a new client</option></select>
          )}
          <small>This groups the project under a client. Team access is managed below; guest access uses its review link.</small>
        </div>

        {client === "new" && <div className="bl-new-client-fields"><label>Client name<input className="bl-input" required maxLength={200} placeholder="Client name" value={newClientName} onChange={(event) => setNewClientName(event.target.value)} disabled={Boolean(created) || save.isPending} /></label><div className="bl-two-fields"><label>Main contact<input className="bl-input" maxLength={200} placeholder="Main contact" value={newClientContact} onChange={(event) => setNewClientContact(event.target.value)} disabled={Boolean(created) || save.isPending} /></label><label>Their email<input className="bl-input" type="email" placeholder="name@client.com" value={newClientEmail} onChange={(event) => setNewClientEmail(event.target.value)} disabled={Boolean(created) || save.isPending} /></label></div></div>}

        <div className="bl-form-section"><label htmlFor="project-name">Project name <span className="bl-required">Required</span></label><input id="project-name" className="bl-input" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder={type === "website" ? "Website redesign" : kind === "mobile" ? "App 2.4 release" : "Launch creative"} disabled={Boolean(created) || save.isPending} /></div>

        {project ? (
          <div className="bl-form-section">
            <span className="pf-label">Access</span>
            <p className="pf-access-summary">
              {project.access.visibility === "private" ? "Private" : `Open to ${workspace.name}`} · your role: {roleLabel(project.my_role)}.
              {" "}Change who can open it from <strong>Share</strong> in the project menu.
            </p>
          </div>
        ) : (
          <ProjectAccessFields
            workspaceName={workspace.name}
            members={membersQuery.data}
            membersLoading={membersQuery.isLoading}
            membersError={membersQuery.isError}
            onRetry={() => void membersQuery.refetch()}
            myUserId={user?.id}
            visibility={visibility}
            onVisibility={setVisibility}
            defaultRole={defaultRole}
            onDefaultRole={setDefaultRole}
            grants={grants}
            onGrants={setGrants}
            query={peopleQuery}
            onQuery={setPeopleQuery}
            disabled={Boolean(created) || save.isPending}
          />
        )}

        {type === "website" ? <>
          <div className="bl-form-section"><label htmlFor="project-url">Review URL <span className="bl-required">Required</span></label><input id="project-url" className="bl-input" required type="text" inputMode="url" value={url} onChange={(event) => { setUrl(event.target.value); if (!environmentEdited) setEnvironment(detectEnvironment(event.target.value)); }} onBlur={() => { if (!name.trim() && url.trim()) { try { setName(new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`).hostname.replace(/^www\./, "")); } catch { /* leave the name for the reviewer to type */ } } }} placeholder="staging.yoursite.com" disabled={Boolean(created) || save.isPending} aria-describedby="project-url-check" /><small>Backline loads this page each time a reviewer opens the project. HTTP and HTTPS addresses are supported.</small>
            <UrlCheckLine id="project-url-check" checking={checkingUrl && validUrl} check={urlCheck?.input === url.trim() ? urlCheck : null} />
          </div>
          <fieldset className="bl-form-section bl-review-mode">
            <legend>How clients open it</legend>
            <div className="bl-segment" role="radiogroup" aria-label="How clients open it">
              {CLIENT_REVIEW_MODES.map((option) => (
                <button key={option.id} type="button" role="radio" aria-checked={clientReviewMode === option.id} disabled={Boolean(created) || save.isPending}
                  onClick={() => { reviewModeEdited.current = true; setClientReviewMode(option.id); }}>{option.label}</button>
              ))}
            </div>
            <small>{CLIENT_REVIEW_MODES.find((option) => option.id === clientReviewMode)?.help}</small>
          </fieldset>
          <fieldset className="bl-environment-field" disabled={Boolean(created) || save.isPending}><legend>Environment</legend><div className="bl-segment"><button type="button" aria-pressed={environment === "staging"} onClick={() => { setEnvironment("staging"); setEnvironmentEdited(true); }}>Staging</button><button type="button" aria-pressed={environment === "live"} onClick={() => { setEnvironment("live"); setEnvironmentEdited(true); }}>Live</button></div><small>{environmentEdited ? "Manually selected." : "Detected from the domain — override it here if needed."}</small></fieldset>
        </> : !project ? <>{kind === "mobile" && <div className="bl-form-section">
          <label htmlFor="project-build">Build and device <span className="bl-optional">Optional</span></label>
          <div className="bl-build-fields">
            <input id="project-build" className="bl-input" maxLength={80} value={buildLabel} onChange={(event) => setBuildLabel(event.target.value)} placeholder="Build, e.g. 2.4.0 (311)" disabled={Boolean(created) || save.isPending} />
            <input className="bl-input" aria-label="Device" maxLength={80} value={device} onChange={(event) => setDevice(event.target.value)} placeholder="Device, e.g. iPhone 15 Pro" disabled={Boolean(created) || save.isPending} />
            <select className="bl-input" aria-label="Platform" value={platform} onChange={(event) => setPlatform(event.target.value)} disabled={Boolean(created) || save.isPending}><option value="">Platform</option><option>iOS</option><option>Android</option><option>iPadOS</option><option>Other</option></select>
          </div>
          <small>Applied to the screens you add now. Change them per screen later in Manage files.</small>
        </div>}<div className="bl-form-section">
          <label>{kind === "mobile" ? "Screens" : "Files"} <span className="bl-required">Required</span></label>
          <button type="button" className={`bl-upload-drop${files.length ? " has-files" : ""}${dragging ? " is-dragging" : ""}`} onClick={() => fileInputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFiles(Array.from(event.dataTransfer.files)); }} disabled={save.isPending}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 9l5-5 5 5M12 4v12" /></svg>
            {files.length ? <><span className="bl-file-list">{files.slice(0, 6).map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>)}{files.length > 6 && <span>+{files.length - 6} more</span>}</span><strong>{files.length} file{files.length === 1 ? "" : "s"} ready</strong><small>Click or drop again to replace the selection.</small></> : <><strong>Drop {type === "pdf" ? "a PDF" : "images"} here, or click to choose</strong><small>{type === "pdf" ? "One document · up to 200 pages · 20 MB" : "PNG, JPG, WebP or GIF · up to 50 files · 20 MB each"}</small></>}
          </button>
          <input ref={fileInputRef} type="file" hidden multiple={type === "image"} accept={type === "pdf" ? "application/pdf" : "image/png,image/jpeg,image/webp,image/gif"} onChange={(event) => selectFiles(Array.from(event.target.files ?? []))} />
          {files.filter((file) => !uploaded.includes(`${file.name}:${file.size}:${file.lastModified}`)).map((file) => <button type="button" className="bl-quiet" key={`${file.name}:${file.lastModified}`} disabled={save.isPending} onClick={() => { setFiles((old) => old.filter((item) => item !== file)); setFileError(""); }}>Remove {file.name}</button>)}
          {fileError && <p role="alert" className="bl-error">{fileError}</p>}{uploaded.length > 0 && <p className="bl-mono">{uploaded.length} of {files.length} uploaded</p>}
        </div></> : null}

        {project && <fieldset className="bl-review-settings"><legend>Review settings</legend><SettingRow checked={captureDeviceDetails} onChange={setCaptureDeviceDetails} label="Capture browser and device details" description="Saves browser, OS, device and viewport details with new comments. Page URLs and element anchors are saved either way." /><SettingStatusRow label="Automatic anchor recovery" description="When the page changes, pins move with the element they were left on." status="Always on" /><SettingRow checked={reviewerCanResolve} onChange={setReviewerCanResolve} label="Let reviewers resolve their own comments" description="Off means only your team can move a guest comment to Resolved." /><SettingRow checked={showBoardToClient} onChange={setShowBoardToClient} label="Show the ticket board to this client" description="Off hides due dates, assignees and the board from guest reviewers." /></fieldset>}

        </fieldset>
        {phase === "saving" && <p role="status">{files.length ? `${uploaded.length} of ${files.length} files uploaded. Processing remaining files…` : "Saving project…"}</p>}
        {save.error && <p role="alert" className="bl-error">{save.error.message}{created && " The project was saved. Retry to finish the remaining uploads, or open it from Projects."}{upgradePlan && <> <Link to={`/w/${workspace.slug}/billing?upgrade=${upgradePlan}`} onClick={onClose}>See plans</Link></>}</p>}
        {updateConflict && <div className="bl-file-confirm"><p>Copy any details you want to keep below. Loading latest replaces this form with the saved project, so you can review and reapply your changes.</p><button type="button" className="bl-button" disabled={loadingLatest || save.isPending} onClick={() => void loadLatestDetails()}>{loadingLatest ? "Loading latest…" : "Load latest project details"}</button></div>}
        {latestError && <p role="alert" className="bl-error">{latestError}</p>}
        {retryLocked && <div role="status"><p>{updateConflict ? "This save cannot overwrite newer project details. Copy your draft before loading the latest version." : "Saving is unconfirmed. Retry sends the original details. Check Projects before starting another project if you close this window."}</p><button type="button" className="bl-quiet" onClick={() => {
          const draft = projectDraftText();
          if (!navigator.clipboard) { setDraftCopy("Select the details below to copy them manually."); return; }
          void navigator.clipboard.writeText(draft).then(() => setDraftCopy("Details copied.")).catch(() => setDraftCopy("Select the details below to copy them manually."));
        }}>Copy details</button><textarea className="bl-input" readOnly aria-label="Project details to copy" value={projectDraftText()} onFocus={(event) => event.target.select()} />{draftCopy && <p>{draftCopy}</p>}</div>}
        {!project && !retryLocked && !canSubmit && !save.isPending && missingFields.length > 0 && <p className="bl-form-missing" role="status">To create the project, add {missingFields.join(", ")}.</p>}
        <footer className="bl-dialog-actions bl-dialog-actions-in-form"><button type="button" className="bl-quiet" disabled={save.isPending || loadingLatest || Boolean(created)} onClick={retryLocked || project ? close : () => setPhase("type")}>{retryLocked ? "Close" : project ? "Cancel" : "Back"}</button><button className="bl-button mint" disabled={save.isPending || loadingLatest || updateConflict || (!retryLocked && !canSubmit)}>{save.isPending ? (uploaded.length ? `Uploading ${uploaded.length + 1} of ${files.length}…` : "Saving…") : retryLocked ? "Retry save" : project ? "Save changes" : created ? "Finish uploads" : "Create project"}</button></footer>
      </form>
    </Dialog>
  );
}

type ClientReviewMode = Schemas["ProjectSettingsOut"]["client_review_mode"];
const CLIENT_REVIEW_MODES: { id: ClientReviewMode; label: string; help: string }[] = [
  { id: "preview", label: "In the preview", help: "Public pages: the review link opens the site in Backline's preview, nothing to install." },
  { id: "extension", label: "With the extension", help: "Sites that need a sign-in or block previews: clients review the real site with the browser extension." },
  { id: "ask", label: "Let them choose", help: "The review link asks the client whether the site needs a sign-in." },
];

function UrlCheckLine({ id, checking, check }: { id: string; checking: boolean; check: { result: api.UrlCheckOut | null; error: string | null } | null }) {
  if (checking) return <p id={id} className="bl-url-check" role="status">Checking the address…</p>;
  if (!check) return <p id={id} className="bl-url-check" role="status" />;
  if (check.error) return <p id={id} className="bl-url-check is-warn" role="status">{check.error}</p>;
  const result = check.result!;
  const tone = result.status === "ok" ? "is-ok" : result.status === "unreachable" || result.status === "error_status" ? "is-warn" : "is-info";
  return <p id={id} className={`bl-url-check ${tone}`} role="status">{result.status === "ok" ? `✓ ${result.message}` : result.message}</p>;
}
