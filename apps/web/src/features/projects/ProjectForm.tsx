import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Dialog } from "../../components/Dialog";
import { invalidateProjectMutation, qk } from "../../lib/query-keys";
import { uploadAsset } from "../assets/api";
import { createClient, listClients } from "../clients/api";
import { listShareLinks } from "../share-links/api";
import type { WorkspaceOut } from "../workspaces/api";
import * as api from "./api";

type ProjectType = "website" | "image" | "pdf";

const PROJECT_TYPES: Array<{
  id: ProjectType | "webapp" | "mobile";
  label: string;
  description: string;
  available: boolean;
}> = [
  { id: "website", label: "Website", description: "Any public or staging URL. Reviewers comment straight on the live page.", available: true },
  { id: "image", label: "Images", description: "PNG, JPG, WebP or GIF. Comments pin to the artwork itself.", available: true },
  { id: "pdf", label: "PDF", description: "Comments attach to the page and survive a re-export.", available: true },
  { id: "webapp", label: "Web App", description: "Review behind a login, with state captured.", available: false },
  { id: "mobile", label: "Mobile App", description: "Comment on a TestFlight or APK build from a real device.", available: false },
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

export function ProjectForm({ workspace, project, initialType, onClose }: {
  workspace: WorkspaceOut;
  project?: api.ProjectOut;
  initialType?: ProjectType;
  onClose: () => void;
}) {
  const cache = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clients = useQuery({ queryKey: qk.clients(workspace.id), queryFn: () => listClients(workspace.id) });
  const [phase, setPhase] = useState<"type" | "details" | "saving" | "retry" | "complete">(project ? "details" : "type");
  const submitting = useRef(false);
  const close = () => { if (!submitting.current) onClose(); };
  const [type, setType] = useState<ProjectType>(project?.project_type ?? initialType ?? "website");
  const [typeChosen, setTypeChosen] = useState(Boolean(project || initialType));
  const [name, setName] = useState(project?.name ?? "");
  const [url, setUrl] = useState(project?.target_origin ?? "");
  const [client, setClient] = useState(project?.client_id ?? "");
  const [environment, setEnvironment] = useState<"live" | "staging">(project?.environment ?? "live");
  const [environmentEdited, setEnvironmentEdited] = useState(Boolean(project));
  const [captureDeviceDetails, setCaptureDeviceDetails] = useState(project?.settings.capture_device_details ?? false);
  const [reviewerCanResolve, setReviewerCanResolve] = useState(project?.settings.reviewer_can_resolve ?? false);
  const [showBoardToClient, setShowBoardToClient] = useState(project?.settings.show_board_to_client ?? false);
  const [enableCrossBrowserRender, setEnableCrossBrowserRender] = useState(
    project?.settings.enable_cross_browser_render ?? false,
  );
  const [newClientName, setNewClientName] = useState("");
  const [newClientContact, setNewClientContact] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [created, setCreated] = useState<api.ProjectOut | null>(null);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");


  const selectedClient = useMemo(() => clients.data?.find((item) => item.id === client), [client, clients.data]);
  const typeLabel = PROJECT_TYPES.find((item) => item.id === type)?.label ?? "Project";

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

  const save = useMutation({
    mutationFn: async () => {
      if (submitting.current) throw new Error("A save is already in progress.");
      submitting.current = true;
      setPhase("saving");
      let clientId = client;
      if (client === "new") {
        const newClient = await createClient(workspace.id, { name: newClientName.trim(), contact_name: newClientContact.trim(), email: newClientEmail.trim() || null });
        clientId = newClient.id;
        setClient(newClient.id);
        await cache.invalidateQueries({ queryKey: qk.clients(workspace.id) });
      }
      if (project) {
        await api.updateProjectSettings(project.id, {
          capture_device_details: captureDeviceDetails,
          reviewer_can_resolve: reviewerCanResolve,
          show_board_to_client: showBoardToClient,
          enable_cross_browser_render: enableCrossBrowserRender,
        });
        return api.updateProject(project.id, { name: name.trim(), ...(type === "website" ? { target_origin: url.trim(), environment } : {}), client_id: clientId || null });
      }
      const current = created ?? await api.createProject(workspace.id, name.trim(), type === "website" ? url.trim() : "", { project_type: type, environment, client_id: clientId || null });
      setCreated(current);
      for (const file of files) {
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!uploaded.includes(key)) { await uploadAsset(current.id, file); setUploaded((old) => [...old, key]); }
      }
      const links = await listShareLinks(current.id).catch(() => []);
      const active = links.find((item) => !item.revoked_at);
      setLink(active ? `${window.location.origin}/review/${active.token}` : "");
      return current;
    },
    onError: () => setPhase("retry"),
    onSettled: () => { submitting.current = false; },
    onSuccess: async () => {
      await invalidateProjectMutation(cache, workspace.id);
      if (project) { await cache.invalidateQueries({ queryKey: qk.project(project.id) }); onClose(); }
      else setPhase("complete");
    },
  });

  if (phase === "complete" && created) {
    return (
      <Dialog title="Project created" onClose={close}>
        <div className="bl-project-success">
          <span className="bl-success-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5" /></svg></span>
          <p className="bl-dialog-kicker">{created.name}{selectedClient ? ` · ${selectedClient.name}` : ""}</p>
          <h3>Ready for feedback</h3>
          <p>Send the review link to your client. They can open it and leave comments without an account or extension.</p>
          {link ? (
            <div className="bl-link-row">
              <input className="bl-input bl-mono" aria-label="Review link" readOnly value={link} onFocus={(event) => event.target.select()} />
              <button type="button" className="bl-quiet" onClick={() => { setCopyError(""); void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setCopyError("Select the link and copy it manually.")); }}>{copied ? "Copied" : "Copy link"}</button>
            </div>
          ) : <p className="bl-inline-warning">The project was created, but its review link could not be loaded. Open the project and use Share to retrieve it.</p>}
          {copyError && <p role="alert" className="bl-error">{copyError}</p>}
          <p className="bl-policy-note">Reviewers are asked for a name before their first comment on the default link.</p>
          <footer className="bl-dialog-actions"><button type="button" className="bl-quiet" onClick={onClose}>Done</button><Link className="bl-button mint" to={`/w/${workspace.slug}/p/${created.id}`}>Open project</Link></footer>
        </div>
      </Dialog>
    );
  }

  if (!project && phase === "type") {
    return (
      <Dialog title="New project" onClose={close}>
        <div className="bl-dialog-progress" aria-label="Step 1 of 3"><i className="is-on" /><i /><i /></div>
        <div className="bl-dialog-intro"><p>What are you collecting feedback on?</p></div>
        <div className="bl-project-type-body">
          <div className="bl-project-type-grid primary" role="radiogroup" aria-label="Project type">
            {PROJECT_TYPES.filter((item) => item.available).map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={typeChosen && type === item.id} className="bl-project-type-card" onClick={() => { if (type !== item.id) { setFiles([]); setFileError(""); } setType(item.id as ProjectType); setTypeChosen(true); }}><span className="bl-type-icon"><TypeIcon type={item.id} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span></button>
            ))}
          </div>
          <div className="bl-roadmap-label"><span>On the roadmap</span></div>
          <div className="bl-project-type-grid roadmap">
            {PROJECT_TYPES.filter((item) => !item.available).map((item) => (
              <button key={item.id} type="button" className="bl-project-type-card" disabled aria-describedby={`${item.id}-soon`}><span className="bl-type-icon"><TypeIcon type={item.id} /></span><span><strong>{item.label}</strong><small>{item.description}</small><em id={`${item.id}-soon`}>Coming soon</em></span></button>
            ))}
          </div>
        </div>
        <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-quiet" onClick={onClose}>Cancel</button><button type="button" className="bl-button mint" disabled={!typeChosen} onClick={() => setPhase("details")}>Continue</button></footer>
      </Dialog>
    );
  }

  let validUrl = type !== "website";
  if (type === "website") {
    try { const parsed = new URL(url.includes("://") ? url.trim() : `https://${url.trim()}`); validUrl = ["http:", "https:"].includes(parsed.protocol) && !!parsed.hostname && !parsed.username && !parsed.password; } catch { validUrl = false; }
  }
  const canSubmit = validUrl && Boolean(name.trim() && (client !== "new" || newClientName.trim()) && (type === "website" ? url.trim() : project || files.length > 0) && !fileError);

  return (
    <Dialog title={project ? "Project settings" : type === "website" ? "Add the page to review" : "Upload your files"} onClose={close}>
      {!project && <div className="bl-dialog-progress" aria-label="Step 2 of 3"><i className="is-on" /><i className="is-on" /><i /></div>}
      <div className="bl-dialog-intro"><p>{project ? project.name : `${typeLabel} project`}</p></div>
      <form className="bl-project-form" onSubmit={(event) => { event.preventDefault(); if (canSubmit && !submitting.current) save.mutate(); }}>
        <fieldset disabled={phase === "saving"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="bl-form-section">
          <label htmlFor="project-client">Client</label>
          {clients.isLoading ? <div className="bl-input bl-input-loading" role="status">Loading clients…</div> : clients.isError ? <div className="bl-inline-error" role="alert"><span>Clients could not load.</span><button type="button" onClick={() => clients.refetch()}>Try again</button></div> : (
            <select id="project-client" className="bl-input" value={client} onChange={(event) => setClient(event.target.value)} disabled={Boolean(created) || save.isPending}><option value="">No client — internal work</option>{clients.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="new">＋ Add a new client</option></select>
          )}
          <small>The project appears with this client, while access remains controlled by its review link.</small>
        </div>

        {client === "new" && <div className="bl-new-client-fields"><label>Client name<input className="bl-input" required maxLength={200} placeholder="Sarvam AI" value={newClientName} onChange={(event) => setNewClientName(event.target.value)} disabled={Boolean(created) || save.isPending} /></label><div className="bl-two-fields"><label>Main contact<input className="bl-input" maxLength={200} placeholder="Ravi Kulkarni" value={newClientContact} onChange={(event) => setNewClientContact(event.target.value)} disabled={Boolean(created) || save.isPending} /></label><label>Their email<input className="bl-input" type="email" placeholder="ravi@client.com" value={newClientEmail} onChange={(event) => setNewClientEmail(event.target.value)} disabled={Boolean(created) || save.isPending} /></label></div></div>}

        <div className="bl-form-section"><label htmlFor="project-name">Project name</label><input id="project-name" className="bl-input" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} placeholder={type === "website" ? "Sarvam AI redesign" : "Launch creative"} disabled={Boolean(created) || save.isPending} /></div>

        {type === "website" ? <>
          <div className="bl-form-section"><label htmlFor="project-url">Review URL <span className="bl-required">Required</span></label><input id="project-url" className="bl-input" required type="text" inputMode="url" value={url} onChange={(event) => { setUrl(event.target.value); if (!environmentEdited) setEnvironment(detectEnvironment(event.target.value)); }} placeholder="staging.yoursite.com" disabled={Boolean(created) || save.isPending} /><small>Backline loads this page each time a reviewer opens the project. HTTP and HTTPS addresses are supported.</small></div>
          <fieldset className="bl-environment-field" disabled={Boolean(created) || save.isPending}><legend>Environment</legend><div className="bl-segment"><button type="button" aria-pressed={environment === "staging"} onClick={() => { setEnvironment("staging"); setEnvironmentEdited(true); }}>Staging</button><button type="button" aria-pressed={environment === "live"} onClick={() => { setEnvironment("live"); setEnvironmentEdited(true); }}>Live</button></div><small>{environmentEdited ? "Manually selected." : "Detected from the domain — override it here if needed."}</small></fieldset>
        </> : !project ? <div className="bl-form-section">
          <label>Files <span className="bl-required">Required</span></label>
          <button type="button" className={`bl-upload-drop${files.length ? " has-files" : ""}${dragging ? " is-dragging" : ""}`} onClick={() => fileInputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); selectFiles(Array.from(event.dataTransfer.files)); }} disabled={save.isPending}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 9l5-5 5 5M12 4v12" /></svg>
            {files.length ? <><span className="bl-file-list">{files.slice(0, 6).map((file) => <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>)}{files.length > 6 && <span>+{files.length - 6} more</span>}</span><strong>{files.length} file{files.length === 1 ? "" : "s"} ready</strong><small>Click or drop again to replace the selection.</small></> : <><strong>Drop {type === "pdf" ? "a PDF" : "images"} here, or click to choose</strong><small>{type === "pdf" ? "One document · up to 200 pages · 20 MB" : "PNG, JPG, WebP or GIF · up to 50 files · 20 MB each"}</small></>}
          </button>
          <input ref={fileInputRef} type="file" hidden multiple={type === "image"} accept={type === "pdf" ? "application/pdf" : "image/png,image/jpeg,image/webp,image/gif"} onChange={(event) => selectFiles(Array.from(event.target.files ?? []))} />
          {files.filter((file) => !uploaded.includes(`${file.name}:${file.size}:${file.lastModified}`)).map((file) => <button type="button" className="bl-quiet" key={`${file.name}:${file.lastModified}`} disabled={save.isPending} onClick={() => { setFiles((old) => old.filter((item) => item !== file)); setFileError(""); }}>Remove {file.name}</button>)}
          {fileError && <p role="alert" className="bl-error">{fileError}</p>}{uploaded.length > 0 && <p className="bl-mono">{uploaded.length} of {files.length} uploaded</p>}
        </div> : null}

        {project && <fieldset className="bl-review-settings"><legend>Review settings</legend><SettingRow checked={captureDeviceDetails} onChange={setCaptureDeviceDetails} label="Capture browser and device details" description="Attaches OS, viewport and the element selector to every new comment." /><SettingStatusRow label="Automatic anchor recovery" description="Recovery runs for every new revision. The legacy per-project toggle is retained for compatibility but is not an active control." status="Always on" /><SettingRow checked={reviewerCanResolve} onChange={setReviewerCanResolve} label="Let reviewers resolve their own comments" description="Off means only your team can move a guest comment to Resolved." /><SettingRow checked={showBoardToClient} onChange={setShowBoardToClient} label="Show the ticket board to this client" description="Off hides due dates, assignees and the board from guest reviewers." /><SettingRow checked={enableCrossBrowserRender} onChange={setEnableCrossBrowserRender} label="Render real cross-browser screenshots" description="Lets the footer's Capture As dropdown request a real Chromium/WebKit/Firefox screenshot instead of just tagging the browser name. Each render costs worker time, so it's off by default." /><SettingStatusRow label="Client email digest" description="Client digest delivery has no approved recipient, privacy, or scheduling contract and cannot be enabled." status="Not available" /></fieldset>}

        </fieldset>
        {phase === "saving" && <p role="status">{files.length ? `${uploaded.length} of ${files.length} files uploaded. Processing remaining files…` : "Saving project…"}</p>}
        {save.error && (
          <div style={{ marginTop: "12px" }}>
            <p role="alert" className="bl-error">{save.error.message}{created && " The project was saved. Retry to finish the remaining uploads, or open it from Projects."}</p>
            {save.error.message.toLowerCase().includes("limit") && (
              <div style={{ marginTop: "8px" }}>
                <Link
                  to={`/w/${workspace.slug}/billing?upgrade=solo`}
                  className="bl-button mint"
                  style={{ display: "inline-flex" }}
                  onClick={onClose}
                >
                  ⭐ Upgrade Plan to Add More Projects
                </Link>
              </div>
            )}
          </div>
        )}
        <footer className="bl-dialog-actions bl-dialog-actions-in-form"><button type="button" className="bl-quiet" disabled={save.isPending || Boolean(created)} onClick={project ? close : () => setPhase("type")}>{project ? "Cancel" : "Back"}</button><button className="bl-button mint" disabled={save.isPending || !canSubmit}>{save.isPending ? (uploaded.length ? `Uploading ${uploaded.length + 1} of ${files.length}…` : "Saving…") : project ? "Save changes" : created ? "Finish uploads" : "Create project"}</button></footer>
      </form>
    </Dialog>
  );
}
