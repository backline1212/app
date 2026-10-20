import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { qk } from "../../lib/query-keys";
import { projectCan } from "../../lib/project-roles";
import type { ProjectOut } from "../projects/api";
import * as api from "./api";

export function ManageFilesDialog({ project, onClose }: { project: ProjectOut; onClose: () => void }) {
  const cache = useQueryClient();
  const busy = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<api.Asset | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [progress, setProgress] = useState("");
  const files = useQuery({ queryKey: qk.assetManagement(project.id), queryFn: () => api.listAssets(project.id, undefined, true) });
  const canEdit = projectCan(project, "edit") && !project.archived_at;
  const activeCount = (files.data ?? []).filter(file => !file.archived_at).length;
  const limit = project.project_type === "pdf" ? 1 : 50;
  const visible = (files.data ?? []).filter(file => Boolean(file.archived_at) === showArchived);

  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: qk.assets(project.id) }),
      cache.invalidateQueries({ queryKey: qk.projectPages(project.id) }),
      cache.invalidateQueries({ queryKey: qk.activity(project.workspace_id) }),
    ]);
  }
  const update = useMutation({
    mutationFn: async ({ file, patch }: { file: api.Asset; patch: Parameters<typeof api.updateAsset>[2] }) => {
      if (busy.current) throw new Error("A file change is already in progress.");
      busy.current = true;
      return api.updateAsset(project.id, file.id, patch);
    },
    onSuccess: async () => { setEditing(null); setArchiveTarget(null); await refresh(); },
    onSettled: () => { busy.current = false; },
  });
  const upload = useMutation({
    mutationFn: async (selected: File[]) => {
      if (busy.current) throw new Error("A file change is already in progress.");
      busy.current = true;
      if (selected.length > limit - activeCount) throw new Error(`This project has room for ${Math.max(0, limit - activeCount)} more file(s).`);
      for (const file of selected) {
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MB file limit.`);
        if (project.project_type === "pdf" ? !/\.pdf$/i.test(file.name) : !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) throw new Error(project.project_type === "pdf" ? "Choose a PDF document." : "Choose PNG, JPG, WebP or GIF files.");
      }
      for (const [index, file] of selected.entries()) {
        setProgress(`Uploading ${index + 1} of ${selected.length}: ${file.name}`);
        await api.uploadAsset(project.id, file);
      }
      setProgress("Files uploaded. They are ready for review.");
    },
    onError: () => setProgress("Check the file list before uploading again; completed uploads stay saved."),
    onSettled: async () => { await refresh(); busy.current = false; },
  });
  const pending = update.isPending || upload.isPending;
  return <Dialog title="Manage files" onClose={() => { if (!busy.current) onClose(); }}>
    <div className="bl-file-manager">
      <p>{project.name} · {activeCount} / {limit} active {limit === 1 ? "document" : "files"}</p>
      <p>Archive a file to take it out of active review. Its comments and original file remain saved. Restore it here when there is room.</p>
      <div className="bl-toolbar wrap">
        <div className="bl-segment" aria-label="File visibility">
          <button type="button" aria-pressed={!showArchived} disabled={pending} onClick={() => setShowArchived(false)}>Active</button>
          <button type="button" aria-pressed={showArchived} disabled={pending} onClick={() => setShowArchived(true)}>Archived</button>
        </div>
        {canEdit && <label className="bl-button mint">{upload.isPending ? "Uploading…" : "Add files"}<input type="file" className="sr-only" aria-label="Add project files" disabled={pending || files.isLoading || files.isError || activeCount >= limit} multiple={limit > 1} accept={project.project_type === "pdf" ? "application/pdf" : "image/png,image/jpeg,image/webp,image/gif"} onChange={event => { const selected = Array.from(event.target.files ?? []); event.target.value = ""; if (selected.length && !busy.current) upload.mutate(selected); }} /></label>}
      </div>
      {files.isLoading && <p role="status">Loading files…</p>}
      {files.error && <p role="alert" className="bl-error">{files.error.message} <button type="button" onClick={() => void files.refetch()}>Retry</button></p>}
      {(update.error || upload.error) && <p role="alert" className="bl-error">{update.error?.message ?? upload.error?.message}</p>}
      {progress && <p role="status">{progress}</p>}
      {!files.isLoading && !files.error && !visible.length && <p>No {showArchived ? "archived" : "active"} files.</p>}
      <ul className="bl-managed-files">
        {visible.map(file => <li key={file.id}>
          {editing === file.id ? <form onSubmit={event => { event.preventDefault(); if (!busy.current && filename.trim()) update.mutate({ file, patch: { filename: filename.trim() } }); }}>
            <label>File display name<input className="bl-input" required autoFocus maxLength={255} readOnly={pending} value={filename} onChange={event => setFilename(event.target.value)} /></label>
            <div><button className="bl-button" disabled={pending || !filename.trim()}>Save name</button><button type="button" className="bl-quiet" disabled={pending} onClick={() => setEditing(null)}>Cancel</button></div>
          </form> : <><div><strong>{file.filename}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · {file.page_count} {file.page_count === 1 ? "page" : "pages"}{file.archived_at ? " · Archived" : ""}</small></div>
            {canEdit && <div><button type="button" className="bl-quiet" disabled={pending} onClick={() => { update.reset(); setFilename(file.filename); setEditing(file.id); }}>Rename</button><button type="button" className="bl-quiet" disabled={pending || Boolean(file.archived_at && activeCount >= limit)} onClick={() => { update.reset(); if (file.archived_at) update.mutate({ file, patch: { archived: false } }); else setArchiveTarget(file); }}>{file.archived_at ? "Restore" : "Archive"}</button></div>}</>}
        </li>)}
      </ul>
      {archiveTarget && <div className="bl-file-confirm" role="group" aria-label="Confirm file archive"><p>Archive <strong>{archiveTarget.filename}</strong>? It will disappear from active file review. Existing feedback is retained.</p><button type="button" className="bl-quiet" disabled={pending} onClick={() => setArchiveTarget(null)}>Keep file</button><button type="button" className="bl-button" disabled={pending} onClick={() => { if (!busy.current) update.mutate({ file: archiveTarget, patch: { archived: true } }); }}>{update.isPending ? "Archiving…" : "Archive file"}</button></div>}
      {!canEdit && <p>Editors and managers can add, rename, archive and restore files.</p>}
    </div>
    <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-button" disabled={pending} onClick={onClose}>Done</button></footer>
  </Dialog>;
}
