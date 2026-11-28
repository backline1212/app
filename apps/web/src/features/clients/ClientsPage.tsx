import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Schemas } from "@backline/types";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { Dialog } from "../../components/Dialog";
import { nameInitials } from "../../lib/initials";
import { LoadingScreen } from "../../components/LoadingScreen";
import { useToast } from "../../components/Toast";
import { PlusIcon } from "../../components/icons";
import { EmptyArt } from "../../components/illustrations";
import { invalidateProjectMutation, qk } from "../../lib/query-keys";
import { ApiError } from "../../lib/api-client";
import { useDocumentTitle } from "../../lib/use-document-title";
import { pastelColor } from "../../lib/pastel-color";
import { shortAgo } from "../../lib/time";
import { useOnClickOutside } from "../../lib/use-click-outside";
import { useFloatingPosition } from "../../lib/use-floating-position";
import { listProjects, updateProject, type ProjectOut } from "../projects/api";
import { ProjectForm } from "../projects/ProjectForm";
import type { WorkspaceOut } from "../workspaces/api";
import { ShareProjectModal } from "../workspaces/ShareProjectModal";
import * as api from "./api";

export function ClientsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, 'Clients']);
  const { toast } = useToast();
  // Global search links here with the client it found, so that row can be pointed out.
  const [params] = useSearchParams();
  const targetId = params.get("client");
  const [edit, setEdit] = useState<api.Client | "new" | null>(null);
  const [newProjectFor, setNewProjectFor] = useState<api.Client | null>(null);
  const [attachFor, setAttachFor] = useState<api.Client | null>(null);
  const [share, setShare] = useState<ProjectOut | null>(null);
  const clients = useQuery({
    queryKey: qk.clientsList(workspace.id, false),
    queryFn: () => api.listClients(workspace.id, false),
  });
  const projects = useQuery({ queryKey: qk.projects(workspace.id), queryFn: () => listProjects(workspace.id, true) });
  const exportClients = useMutation({
    mutationFn: () => api.exportClients(workspace.id),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${workspace.slug}-clients.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast("Client export downloaded.");
    },
    onError: () => toast("Could not export clients.", "error"),
  });
  const visible = (clients.data ?? []).filter((c) => !c.archived_at);
  const found = visible.some((c) => c.id === targetId);
  useEffect(() => {
    if (found) document.getElementById(`client-${targetId}`)?.scrollIntoView({ block: "center" });
  }, [found, targetId]);

  return <main className="bl-wrap">
    <header className="bl-head">
      <div>
        <h1>Clients</h1>
        <p>Your client relationships and the projects you're reviewing together.</p>
      </div>
      <div className="bl-head-actions">
        <button type="button" className="bl-quiet" disabled={exportClients.isPending || !clients.data?.length} onClick={() => exportClients.mutate()}>{exportClients.isPending ? "Exporting…" : "Export CSV"}</button>
        <button type="button" className="bl-button mint" onClick={() => setEdit("new")}><PlusIcon width="14" height="14" /> Add client</button>
      </div>
    </header>

    {clients.isLoading && <LoadingScreen inline />}
    {clients.error && <p role="alert" className="bl-error">{clients.error.message}</p>}
    {projects.error && <p role="alert" className="bl-error">Project associations could not load: {projects.error.message}</p>}

    {!clients.isLoading && !clients.error && (
      visible.length > 0 ? (
        <>
          {/* Visual column captions; each row spells its own numbers out, so these stay hidden from screen readers. */}
          <div className="bl-cl-head" aria-hidden="true">
            <span className="bl-cl-avatar-space" /><span className="bl-cl-main">Client</span><span className="bl-cl-projects">Projects</span>
            <span className="bl-cl-num">Open</span><span className="bl-cl-num">Resolved</span><span className="bl-cl-num">Reviewers</span>
            <span className="bl-cl-time">Activity</span><span className="bl-cl-actions" />
          </div>
          <ul className="bl-cl-rows" aria-label="Clients">
            {visible.map((client) => {
              const clientProjects = (projects.data ?? []).filter((p) => p.client_id === client.id && !p.archived_at);
              const open = client.stats?.open_tickets_count ?? 0;
              const resolved = client.stats?.resolved_tickets_count ?? 0;
              const reviewers = client.stats?.reviewers_count ?? 0;
              const lastActivity = client.stats?.last_activity_at;
              return (
                <li key={client.id} id={`client-${client.id}`} className={`bl-cl-row${client.id === targetId ? " is-target" : ""}`}>
                  <span className="bl-cl-avatar" style={{ background: pastelColor(client.id) }} aria-hidden="true">{nameInitials(client.contact_name || client.name)}</span>
                  <button type="button" className="bl-cl-main" onClick={() => setEdit(client)}>
                    <span className="bl-cl-name">{client.name}</span>
                    <span className="bl-cl-contact">{client.contact_name || "No contact"}{client.email ? ` · ${client.email}` : ""}</span>
                  </button>
                  <span className="bl-cl-projects">
                    {clientProjects.length === 0 && <button type="button" className="bl-cl-chip is-empty" onClick={() => setAttachFor(client)}>+ Add projects</button>}
                    {clientProjects.slice(0, 2).map((p) => <Link className="bl-cl-chip" key={p.id} to={`/w/${workspace.slug}/p/${p.id}`} title={p.name}>
                      <i style={{ background: PROJECT_TYPE_COLORS[p.project_type ?? "website"] }} aria-hidden="true" />
                      <span>{p.name}</span>
                    </Link>)}
                    {clientProjects.length > 2 && <Link className="bl-cl-chip is-more" to={`/w/${workspace.slug}?client=${client.id}`}>+{clientProjects.length - 2} more</Link>}
                  </span>
                  <span className={`bl-cl-num${open ? "" : " is-muted"}`}><b>{open}</b> open</span>
                  <span className="bl-cl-num is-muted"><b>{resolved}</b> resolved</span>
                  <span className="bl-cl-num is-muted">{reviewers} reviewer{reviewers === 1 ? "" : "s"}</span>
                  <span className="bl-cl-time" title={lastActivity ? new Date(lastActivity).toLocaleString() : "No activity yet"}>{lastActivity ? shortAgo(lastActivity) : "—"}</span>
                  <span className="bl-cl-actions">
                    <button type="button" className="bl-ghost-btn" disabled={clientProjects.length === 0} title={clientProjects.length ? `Share ${clientProjects[0].name}` : "Add a project to share it"} aria-label={`Share a project with ${client.name}`} onClick={() => setShare(clientProjects[0])}>Share</button>
                    <ClientMenu name={client.name} onEdit={() => setEdit(client)} onNewProject={() => setNewProjectFor(client)} onAttach={() => setAttachFor(client)} />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="bl-empty">
          <EmptyArt kind="clients" />
          <h2>Your next client starts here</h2>
          <p>Add a client, then connect their review projects.</p>
        </div>
      )
    )}

    {newProjectFor && <ProjectForm workspace={workspace} initialClientId={newProjectFor.id} onClose={() => setNewProjectFor(null)} />}

    {attachFor && <AttachProjectsDialog workspaceId={workspace.id} client={attachFor} clients={clients.data ?? []} projects={(projects.data ?? []).filter((p) => !p.archived_at)} onClose={() => setAttachFor(null)} />}

    {edit && <ClientForm key={edit === "new" ? "new" : edit.id} workspaceId={workspace.id} client={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}

    {share && <ShareProjectModal project={share} workspaceId={workspace.id} workspaceSlug={workspace.slug} workspaceName={workspace.name} onClose={() => setShare(null)} />}
  </main>;
}

// The design's square colour per project type.
const PROJECT_TYPE_COLORS: Record<string, string> = { website: "#5B7FA6", image: "#E8B833", pdf: "#C2542E" };

function ClientMenu({ name, onEdit, onNewProject, onAttach }: { name: string; onEdit: () => void; onNewProject: () => void; onAttach: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const position = useFloatingPosition(triggerRef, menuRef, open);
  useOnClickOutside([triggerRef as RefObject<HTMLElement>, menuRef], () => setOpen(false));
  // Focus moves into the menu once it has a position (it is hidden until then).
  const placed = open && position !== null;
  useEffect(() => {
    if (placed) menuRef.current?.querySelector("button")?.focus();
  }, [placed]);
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  // The trigger takes focus back first, so a dialog opened from here can return to it.
  const choose = (action: () => void) => () => { close(); action(); };

  return <>
    <button ref={triggerRef} type="button" className="bl-cl-more" aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
    </button>
    {open && createPortal(
      <div ref={menuRef} className="bl-pop" role="menu" aria-label={`Actions for ${name}`}
        style={{ position: "fixed", top: position?.top ?? -9999, left: position?.left ?? -9999, visibility: position ? "visible" : "hidden" }}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); close(); return; }
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          const items = Array.from(event.currentTarget.querySelectorAll("button"));
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }}>
        <button type="button" role="menuitem" onClick={choose(onEdit)}>Rename / edit</button>
        <button type="button" role="menuitem" onClick={choose(onNewProject)}>New project</button>
        <button type="button" role="menuitem" onClick={choose(onAttach)}>Add existing projects</button>
      </div>,
      document.body,
    )}
  </>;
}

/** Moves existing projects under a client - the other half of "New project" for
 * agencies that set up projects before adding the client record. */
function AttachProjectsDialog({ workspaceId, client, clients, projects, onClose }: { workspaceId: string; client: api.Client; clients: api.Client[]; projects: ProjectOut[]; onClose: () => void }) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const candidates = projects.filter((p) => p.client_id !== client.id);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<string[]>([]);
  const clientName = (id: string | null | undefined) => clients.find((c) => c.id === id)?.name;
  const attach = useMutation({
    mutationFn: async () => {
      const chosen = candidates.filter((p) => picked.has(p.id));
      const results = await Promise.allSettled(chosen.map((p) => updateProject(p.id, { client_id: client.id, expected_metadata_version: p.metadata_version, client_request_id: crypto.randomUUID() })));
      return chosen.flatMap((p, index) => {
        const result = results[index];
        return result.status === "rejected" ? [`${p.name}: ${result.reason instanceof Error ? result.reason.message : "could not be moved"}`] : [];
      });
    },
    onSuccess: async (failed) => {
      await invalidateProjectMutation(cache, workspaceId);
      if (failed.length) { setFailures(failed); setPicked(new Set()); return; }
      toast(`${picked.size === 1 ? "Project" : `${picked.size} projects`} added to ${client.name}.`, "success");
      onClose();
    },
  });
  return <Dialog title={`Add projects to ${client.name}`} onClose={() => { if (!attach.isPending) onClose(); }}>
    <div className="bl-form">
      {candidates.length === 0
        ? <p>Every active project already belongs to {client.name}. Create a new one from the client's options.</p>
        : <fieldset className="bl-attach-list" disabled={attach.isPending}>
          <legend>Projects</legend>
          {candidates.map((p) => <label key={p.id} className="bl-check">
            <input type="checkbox" checked={picked.has(p.id)} onChange={(event) => setPicked((current) => { const next = new Set(current); if (event.target.checked) next.add(p.id); else next.delete(p.id); return next; })} />
            <span>{p.name}{clientName(p.client_id) && <small> · now with {clientName(p.client_id)}</small>}</span>
          </label>)}
        </fieldset>}
      {failures.length > 0 && <div role="alert" className="bl-error">{failures.map((f) => <p key={f}>{f}</p>)}</div>}
      {attach.error && <p role="alert" className="bl-error">{attach.error.message}</p>}
      <div className="bl-form-actions">
        <button type="button" className="bl-quiet" disabled={attach.isPending} onClick={onClose}>Cancel</button>
        <button type="button" className="bl-button" disabled={attach.isPending || picked.size === 0} onClick={() => attach.mutate()}>{attach.isPending ? "Adding…" : picked.size > 1 ? `Add ${picked.size} projects` : "Add project"}</button>
      </div>
    </div>
  </Dialog>;
}

function ClientForm({ workspaceId, client, onClose }: { workspaceId: string; client?: api.Client; onClose: () => void }) {
  const { toast } = useToast();
  const cache = useQueryClient();
  const [name, setName] = useState(client?.name ?? "");
  const [contact, setContact] = useState(client?.contact_name ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const prepared = useRef<Schemas["ClientCreate"] | null>(null);
  const submitting = useRef(false);
  const ambiguous = useRef(false);
  const [retryLocked, setRetryLocked] = useState(false);
  const close = () => { if (!submitting.current) onClose(); };

  const save = useMutation({
    mutationFn: async () => {
      if (submitting.current) throw new Error("A save is already in progress.");
      submitting.current = true;
      prepared.current ??= { name: name.trim(), contact_name: contact.trim(), email: email.trim() || null, ...(client ? {} : { client_request_id: crypto.randomUUID() }) };
      return client ? api.updateClient(workspaceId, client.id, prepared.current) : api.createClient(workspaceId, prepared.current);
    },
    onError: (error) => {
      if (!ambiguous.current && error instanceof ApiError && [400, 402, 403, 404, 413, 422].includes(error.status)) {
        prepared.current = null;
        setRetryLocked(false);
      } else {
        ambiguous.current = true;
        setRetryLocked(true);
      }
    },
    onSettled: () => { submitting.current = false; },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: qk.clients(workspaceId) });
      toast(client ? "Client updated." : `${name.trim() || "Client"} added.`);
      onClose();
    }
  });

  return <Dialog title={client ? "Edit client" : "Add a client"} onClose={close}>
    <form className="bl-compact-form" onSubmit={(e) => { e.preventDefault(); if (!submitting.current) save.mutate(); }}>
      <label>
        <span>Client name <span className="bl-required">Required</span></span>
        <input className="bl-input" autoFocus required maxLength={200} disabled={save.isPending || retryLocked} value={name} onChange={(e) => setName(e.target.value)} placeholder="E.g. Acme Corp" />
      </label>
      <label>Main contact
        <input className="bl-input" maxLength={200} disabled={save.isPending || retryLocked} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Name of the person you work with" />
      </label>
      <label>Email
        <input className="bl-input" type="email" disabled={save.isPending || retryLocked} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contact@client.com" />
        <small>Kept private to team members only.</small>
      </label>
      {save.error && <p role="alert" className="bl-error">{save.error.message}</p>}
      {retryLocked && <div role="status"><p>Saving is unconfirmed. Retry sends the original details. Check Clients before adding another client if you close this window.</p><textarea className="bl-input" readOnly aria-label="Client details to copy" value={[name, contact, email].filter(Boolean).join("\n")} onFocus={(event) => event.target.select()} /></div>}
      <footer className="bl-dialog-actions">
        <button type="button" className="bl-quiet" disabled={save.isPending} onClick={close}>{retryLocked ? "Close" : "Cancel"}</button>
        <button className="bl-button mint" disabled={save.isPending || !name.trim()}>
          {save.isPending ? "Saving…" : retryLocked ? "Retry save" : "Save client"}
        </button>
      </footer>
    </form>
  </Dialog>;
}
