import { type ReactNode, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { invalidateProjectMutation, qk } from "../../lib/query-keys";
import { useOnClickOutside } from "../../lib/use-click-outside";
import { useAuth } from "../auth/AuthContext";
import { listShareLinks } from "../share-links/api";
import type { ProjectOut } from "./api";
import * as api from "./api";

type MenuIconName = "archive" | "download" | "duplicate" | "link" | "page" | "rename" | "restore" | "settings" | "share" | "trash";

function MenuIcon({ name }: { name: MenuIconName }) {
  return <svg className="bl-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "settings" && <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></>}
    {name === "share" && <><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="3.5" /><path d="M19 8v6M22 11h-6" /></>}
    {name === "link" && <><path d="m9.5 14.5 5-5M11 6.5l2-1.9a3.6 3.6 0 0 1 5 5l-1.9 2M13 17.4l-2 2a3.6 3.6 0 0 1-5-5l1.9-1.9" /></>}
    {name === "rename" && <><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>}
    {name === "page" && <><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h5" /></>}
    {name === "duplicate" && <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
    {name === "download" && <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></>}
    {name === "archive" && <><rect x="2" y="4" width="20" height="5" rx="1" /><path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9M10 13h4" /></>}
    {name === "restore" && <><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" /></>}
    {name === "trash" && <><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>}
  </svg>;
}

function reviewUrl(token: string): string {
  return `${window.location.origin}/review/${token}`;
}

export function ProjectMenu({ project, workspaceSlug, onManagePages, onShare, onSettings }: {
  project: ProjectOut;
  workspaceSlug: string;
  onManagePages?: () => void;
  onShare?: () => void;
  onSettings?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const cache = useQueryClient();
  const { role } = useAuth();
  const { toast } = useToast();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const [showHardDelete, setShowHardDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const canHardDelete = role === "owner" || role === "admin";

  useOnClickOutside(menuRef, () => setOpen(false));

  function refreshWorkspace() {
    return invalidateProjectMutation(cache, project.workspace_id);
  }

  const rename = useMutation({ mutationFn: () => api.updateProject(project.id, { name: renameValue.trim() }), onSuccess: async () => { await refreshWorkspace(); setRenaming(false); toast("Project renamed."); } });
  const copyLink = useMutation({
    mutationFn: () => listShareLinks(project.id),
    onSuccess: (links) => {
      const active = links.find((link) => !link.revoked_at);
      if (!active) { toast("No active review link — use Share to create one.", "warning"); return; }
      void navigator.clipboard.writeText(reviewUrl(active.token)).then(() => toast("Review link copied.")).catch(() => toast("Could not copy. Open Share and copy the link manually.", "warning"));
    },
    onError: () => toast("Could not load the review link.", "error"),
  });
  const exportComments = useMutation({
    mutationFn: () => api.exportProject(project.id),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-comments.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setConfirmExport(false);
      toast("Comment export downloaded.");
    },
  });
  const archive = useMutation({ mutationFn: () => api.archiveProject(project.id), onSuccess: async () => { await refreshWorkspace(); setConfirmArchive(false); toast("Project archived."); } });
  const restore = useMutation({ mutationFn: () => api.restoreProject(project.id), onSuccess: async () => { await refreshWorkspace(); setConfirmRestore(false); toast("Project restored."); } });

  function focusMenuEdge(edge: "first" | "last") {
    requestAnimationFrame(() => {
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []);
      items[edge === "first" ? 0 : items.length - 1]?.focus();
    });
  }

  function item(label: string, icon: MenuIconName, onClick: () => void, options: { danger?: boolean; disabled?: boolean; note?: string } = {}) {
    return <button type="button" role="menuitem" className={`bl-dropdown-item${options.danger ? " danger" : ""}`} disabled={options.disabled} onClick={onClick}><MenuIcon name={icon} /><span className="stack">{label}{options.note && <small>{options.note}</small>}</span></button>;
  }

  return (
    <div className="bl-dropdown" ref={menuRef} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); return; }
      if (!open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
      event.preventDefault();
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []);
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
      <button ref={triggerRef} type="button" className="bl-dropdown-trigger" aria-haspopup="menu" aria-expanded={open} aria-label="Project options" onClick={() => { setOpen((value) => !value); if (!open) focusMenuEdge("first"); }} onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setOpen(true); focusMenuEdge(event.key === "ArrowUp" ? "last" : "first"); } }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>

      {open && <div role="menu" className="bl-dropdown-pop bl-project-menu" aria-label={`${project.name} project`}>
        <p className="bl-dropdown-label">{project.name}</p>
        {onSettings && item("Project settings", "settings", () => { setOpen(false); onSettings(); }, { disabled: Boolean(project.archived_at), note: project.archived_at ? "Restore to edit" : undefined })}
        {onShare && item("Share project", "share", () => { setOpen(false); onShare(); }, { disabled: Boolean(project.archived_at) })}
        {item(copyLink.isPending ? "Copying…" : "Copy review link", "link", () => { setOpen(false); copyLink.mutate(); }, { disabled: Boolean(project.archived_at) || copyLink.isPending })}
        {item("Rename project", "rename", () => { setRenameValue(project.name); setRenaming(true); setOpen(false); })}
        {onManagePages && item("Manage pages", "page", () => { setOpen(false); onManagePages(); }, { disabled: Boolean(project.archived_at), note: project.archived_at ? "Restore to edit" : undefined })}
        {!onManagePages && project.project_type !== "website" && item("Manage files", "page", () => undefined, { disabled: true, note: "Coming soon" })}
        <div className="bl-dropdown-sep" role="separator" />
        {item("Duplicate project", "duplicate", () => { setConfirmDuplicate(true); setOpen(false); })}
        {item("Export comments", "download", () => { setConfirmExport(true); setOpen(false); })}
        {project.archived_at ? item("Restore project", "restore", () => { setConfirmRestore(true); setOpen(false); }) : item("Archive project", "archive", () => { setConfirmArchive(true); setOpen(false); })}
        <div className="bl-dropdown-sep" role="separator" />
        {item("Delete project", "trash", () => { setShowHardDelete(true); setOpen(false); }, { danger: true, disabled: !canHardDelete, note: !canHardDelete ? "Owners and admins only" : "Permanent" })}
      </div>}

      {renaming && <Dialog title="Rename project" onClose={() => setRenaming(false)}><div className="bl-dialog-intro"><p>{project.name}</p></div><form className="bl-compact-form" onSubmit={(event) => { event.preventDefault(); rename.mutate(); }}><label>Project name<input className="bl-input" autoFocus maxLength={200} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} /><small>Reviewers see this name on the review link.</small></label>{rename.error && <p role="alert" className="bl-error">{rename.error.message}</p>}<footer className="bl-dialog-actions"><button type="button" className="bl-quiet" onClick={() => setRenaming(false)}>Cancel</button><button className="bl-button mint" disabled={rename.isPending || !renameValue.trim()}>{rename.isPending ? "Saving…" : "Save name"}</button></footer></form></Dialog>}

      {confirmDuplicate && <DuplicateProjectDialog project={project} workspaceSlug={workspaceSlug} onClose={() => setConfirmDuplicate(false)} />}
      {confirmExport && <ConfirmAction title="Export project comments?" icon="download" message={<>Download every comment you can access in <strong>{project.name}</strong> as a CSV file?</>} detail="The export contains comment text, workflow metadata, page context, and author names. Nothing in the project is changed." error={exportComments.error} pending={exportComments.isPending} confirmLabel={exportComments.isPending ? "Preparing…" : "Download CSV"} onCancel={() => setConfirmExport(false)} onConfirm={() => exportComments.mutate()} />}
      {confirmArchive && <ConfirmAction title="Archive project?" icon="archive" tone="warning" message={<>Archive <strong>{project.name}</strong>?</>} detail="Review links stop working and the project leaves active views. Its comments, history, files, and settings stay intact so you can restore it later." error={archive.error} pending={archive.isPending} confirmLabel={archive.isPending ? "Archiving…" : "Archive project"} onCancel={() => setConfirmArchive(false)} onConfirm={() => archive.mutate()} />}
      {confirmRestore && <ConfirmAction title="Restore project?" icon="restore" message={<>Restore <strong>{project.name}</strong> to active projects?</>} detail="Its existing review links become available again with their original safeguards." error={restore.error} pending={restore.isPending} confirmLabel={restore.isPending ? "Restoring…" : "Restore project"} onCancel={() => setConfirmRestore(false)} onConfirm={() => restore.mutate()} />}

      {showHardDelete && <HardDeleteDialog project={project} onClose={() => setShowHardDelete(false)} onDeleted={async () => { await refreshWorkspace(); setShowHardDelete(false); navigate(`/w/${workspaceSlug}`); }} />}
    </div>
  );
}

function ConfirmAction({ title, icon, message, detail, error, pending, confirmLabel, onCancel, onConfirm, tone = "default" }: {
  title: string;
  icon: MenuIconName;
  message: ReactNode;
  detail: string;
  error: Error | null;
  pending: boolean;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone?: "default" | "warning";
}) {
  return <Dialog title={title} onClose={onCancel}><div className="bl-confirm-body"><span className={`bl-confirm-icon ${tone}`}><MenuIcon name={icon} /></span><div><p>{message}</p><small>{detail}</small></div></div>{error && <p role="alert" className="bl-error bl-confirm-error">{error.message}</p>}<footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-quiet" onClick={onCancel}>Cancel</button><button type="button" className={`bl-button${tone === "warning" ? " danger" : " mint"}`} disabled={pending} onClick={onConfirm}>{confirmLabel}</button></footer></Dialog>;
}

// Two-step preview/confirm keeps the server-issued correlation id and archived-project
// gate intact. Permanent deletion remains owner/admin only via project:hard_delete.
function HardDeleteDialog({ project, onClose, onDeleted }: { project: ProjectOut; onClose: () => void; onDeleted: () => void }) {
  const [typedName, setTypedName] = useState("");
  const preview = useQuery({ queryKey: qk.hardDeletePreview(project.id), queryFn: () => api.previewHardDeleteProject(project.id) });
  const confirm = useMutation({ mutationFn: () => api.confirmHardDeleteProject(project.id, { correlation_id: preview.data!.correlation_id, project_name: typedName }), onSuccess: onDeleted });
  const isArchived = preview.data?.archived ?? false;
  const nameMatches = typedName.trim() === project.name;
  const hasUnsafeReferences = (preview.data?.counts.unsafe_object_references ?? 0) > 0;

  return <Dialog title={`Delete “${project.name}”?`} onClose={onClose}>
    <div className="bl-danger-banner"><MenuIcon name="trash" /><span><strong>This cannot be undone</strong><small>Archive the project instead if you may need any part of it later.</small></span></div>
    <div className="bl-hard-delete-body">
      {preview.isLoading && <div className="bl-delete-loading" role="status"><i /><span>Checking exactly what would be deleted…</span></div>}
      {preview.isError && <div className="bl-state-panel" role="alert"><h3>Deletion preview unavailable</h3><p>{preview.error.message}</p><button type="button" className="bl-quiet" onClick={() => preview.refetch()}>Try again</button></div>}
      {preview.data && !isArchived && <div className="bl-state-panel"><span className="bl-confirm-icon warning"><MenuIcon name="archive" /></span><h3>Archive this project first</h3><p>Permanent deletion is only available for already-archived projects. Close this dialog and choose Archive project; you can review the deletion plan afterward.</p></div>}
      {preview.data && isArchived && <>
        <p>Permanently deleting this project removes its working data and breaks every review link shared with clients.</p>
        <dl className="bl-delete-counts">
          <div><dt>Pages</dt><dd>{preview.data.counts.pages}</dd></div><div><dt>Comments</dt><dd>{preview.data.counts.comments}</dd></div><div><dt>Assets</dt><dd>{preview.data.counts.project_assets}</dd></div><div><dt>Revisions</dt><dd>{preview.data.counts.revisions}</dd></div><div><dt>Revision diffs</dt><dd>{preview.data.counts.revision_diffs}</dd></div><div><dt>Recovery logs</dt><dd>{preview.data.counts.recovery_logs}</dd></div><div><dt>Share links</dt><dd>{preview.data.counts.share_links}</dd></div><div><dt>Guest sessions</dt><dd>{preview.data.counts.guest_sessions}</dd></div><div><dt>Notifications</dt><dd>{preview.data.counts.notifications}</dd></div><div><dt>Integrations</dt><dd>{preview.data.counts.project_integrations}</dd></div><div><dt>Stored files</dt><dd>{preview.data.counts.object_keys}</dd></div><div><dt>Audit events retained</dt><dd>{preview.data.counts.retained_audit_events}</dd></div>
        </dl>
        <p className="bl-retention-note">{preview.data.retention_notice}</p>
        {hasUnsafeReferences && <div className="bl-state-panel" role="alert"><span className="bl-confirm-icon warning"><MenuIcon name="archive" /></span><h3>Cannot delete yet</h3><p>The dry-run found {preview.data.counts.unsafe_object_references} object reference(s) outside this project's accepted storage prefixes. Resolve them, then run the preview again before permanent deletion.</p><button type="button" className="bl-quiet" onClick={() => preview.refetch()}>Re-check</button></div>}
        {!hasUnsafeReferences && <>
          <label className="bl-delete-confirm-label">Type <strong>{project.name}</strong> to confirm<input className="bl-input" value={typedName} onChange={(event) => setTypedName(event.target.value)} autoFocus autoComplete="off" /></label>
          {confirm.isError && <p role="alert" className="bl-error">{confirm.error.message}</p>}
        </>}
      </>}
    </div>
    <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-quiet" onClick={onClose}>Cancel</button>{preview.data && isArchived && !hasUnsafeReferences && <button type="button" className="bl-button danger" disabled={!nameMatches || confirm.isPending} onClick={() => confirm.mutate()}>{confirm.isPending ? "Deleting…" : "Delete project forever"}</button>}</footer>
  </Dialog>;
}

// Shared by the ⋯ menu and the card's hover "Duplicate" button.
export function DuplicateProjectDialog({ project, workspaceSlug, onClose }: { project: ProjectOut; workspaceSlug: string; onClose: () => void }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const { toast } = useToast();
  const duplicate = useMutation({
    mutationFn: () => api.duplicateProject(project.id),
    onSuccess: async (newProject) => {
      await invalidateProjectMutation(cache, project.workspace_id);
      onClose();
      toast("Project duplicated without comments or history.");
      navigate(`/w/${workspaceSlug}/p/${newProject.id}`);
    },
  });
  return <ConfirmAction title="Duplicate project?" icon="duplicate" message={<><strong>{project.name}</strong> will be copied with its metadata, review settings, and website page list.</>} detail="Comments, revision and recovery history, share links, uploaded assets, and integrations stay with the original." error={duplicate.error} pending={duplicate.isPending} confirmLabel={duplicate.isPending ? "Duplicating…" : "Duplicate project"} onCancel={onClose} onConfirm={() => duplicate.mutate()} />;
}
