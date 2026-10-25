import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "../../components/Dialog";
import { qk } from "../../lib/query-keys";
import { projectCan } from "../../lib/project-roles";
import { useDraftNavigationGuard } from "../../lib/draft-navigation";
import type { ProjectOut } from "../projects/api";
import * as api from "./api";

export function ManageFilesDialog({ project, onClose, onVersionUploaded }: { project: ProjectOut; onClose: () => void; onVersionUploaded?: (saved: api.Asset, replaced: api.Asset) => void }) {
  const cache = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const busy = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  // Mobile App projects also record which build/device each screen came from.
  const mobile = project.variant === "mobile";
  const [build, setBuild] = useState({ build_label: "", device: "", platform: "" });
  const [archiveTarget, setArchiveTarget] = useState<api.Asset | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [progress, setProgress] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const batch = useRef<{ files: File[]; completed: Set<File> } | null>(null);
  const [hasPendingBatch, setHasPendingBatch] = useState(false);
  const files = useQuery({ queryKey: qk.assetManagement(project.id), queryFn: () => api.listAssets(project.id, undefined, true) });
  const canEdit = projectCan(project, "edit") && !project.archived_at;
  // Earlier versions of a file are listed under it, not as files of their own.
  const activeCount = (files.data ?? []).filter(file => !file.archived_at && !file.superseded_by).length;
  const limit = project.project_type === "pdf" ? 1 : 50;
  const visible = (files.data ?? []).filter(file => Boolean(file.archived_at) === showArchived && !file.superseded_by);
  const earlierVersions = (file: api.Asset) => (files.data ?? []).filter(item => item.superseded_by && (item.version_group ?? item.id) === (file.version_group ?? file.id)).length;
  const versionInput = useRef<HTMLInputElement>(null);
  const [versionTarget, setVersionTarget] = useState<api.Asset | null>(null);

  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: qk.assets(project.id) }),
      cache.invalidateQueries({ queryKey: qk.projectPages(project.id) }),
      cache.invalidateQueries({ queryKey: qk.activity(project.workspace_id) }),
    ]);
  }
  const update = useMutation({
    mutationFn: async ({ file, patch }: { file: api.Asset; patch: Parameters<typeof api.updateAsset>[2] }) => {
      return api.updateAsset(project.id, file.id, { ...patch, expected_revision: file.revision ?? 0 });
    },
    onSuccess: saved => {
      if (!mounted.current) return;
      setEditing(null); setArchiveTarget(null);
      try { cache.setQueryData<api.Asset[]>(qk.assetManagement(project.id), current => [...(current ?? []).filter(file => file.id !== saved.id), saved]); }
      catch { setRefreshWarning("File change saved. Reload the file list to see the latest state."); }
      void refresh().catch(() => setRefreshWarning("File change saved. Reload the file list to see the latest state."));
    },
    onSettled: () => { busy.current = false; },
  });
  const newVersion = useMutation({
    mutationFn: async ({ file, selected }: { file: api.Asset; selected: File }) => {
      if (!selected.size || selected.size > 20 * 1024 * 1024) throw new Error(`${selected.name} must contain data and be at most 20 MiB.`);
      if (project.project_type === "pdf" ? !/\.pdf$/i.test(selected.name) : !/\.(png|jpe?g|webp|gif)$/i.test(selected.name)) throw new Error(project.project_type === "pdf" ? "Choose a PDF document." : "Choose PNG, JPG, WebP or GIF files.");
      setProgress(`Uploading a new version of ${file.filename}…`);
      return api.uploadAsset(project.id, selected, undefined, file.id);
    },
    onSuccess: (saved, { file }) => {
      onVersionUploaded?.(saved, file);
      if (!mounted.current) return;
      setProgress(`${saved.filename} uploaded as v${saved.version ?? 2}. Earlier comments stay on the earlier version.`);
      void cache.invalidateQueries({ queryKey: qk.assetManagement(project.id) });
      void refresh().catch(() => setRefreshWarning("New version saved. Reload the file list to see it."));
    },
    onError: () => setProgress(""),
    onSettled: () => { busy.current = false; setVersionTarget(null); },
  });
  const upload = useMutation({
    mutationFn: async (selected: File[]) => {
      if (!batch.current && selected.length > limit - activeCount) throw new Error(`This project has room for ${Math.max(0, limit - activeCount)} more file(s).`);
      for (const file of selected) {
        if (!file.size || file.size > 20 * 1024 * 1024) throw new Error(`${file.name} must contain data and be at most 20 MiB.`);
        if (project.project_type === "pdf" ? !/\.pdf$/i.test(file.name) : !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) throw new Error(project.project_type === "pdf" ? "Choose a PDF document." : "Choose PNG, JPG, WebP or GIF files.");
      }
      batch.current ??= { files: selected, completed: new Set() };
      setHasPendingBatch(true);
      const current = batch.current;
      for (const [index, file] of current.files.entries()) {
        if (!mounted.current) throw new Error("Upload batch stopped after leaving the file manager. Check the saved files before selecting them again.");
        if (current.completed.has(file)) continue;
        setProgress(`Uploading ${index + 1} of ${current.files.length}: ${file.name}`);
        await api.uploadAsset(project.id, file);
        current.completed.add(file);
      }
      batch.current = null;
      setHasPendingBatch(false);
      setProgress("Files uploaded. They are ready for review.");
    },
    onError: () => setProgress(batch.current ? "Some uploads are unconfirmed. Retry this batch to recover saved files and continue the rest." : "The upload could not start. Check the files and available space."),
    onSettled: () => {
      busy.current = false;
      if (!mounted.current) return;
      void refresh().catch(() => setRefreshWarning("The file list could not refresh. Check it before starting another upload; confirmed files stay saved."));
    },
  });
  const pending = update.isPending || upload.isPending || newVersion.isPending;
  const editingFile = editing !== null ? files.data?.find(file => file.id === editing) : undefined;
  const renamed = editing !== null && (filename !== editingFile?.filename
    || (mobile && (build.build_label !== (editingFile?.build_label ?? "") || build.device !== (editingFile?.device ?? "") || build.platform !== (editingFile?.platform ?? ""))));
  const protect = pending || hasPendingBatch || renamed;
  useDraftNavigationGuard({
    name: "file changes", dirty: protect && !pending, pending,
    unconfirmed: hasPendingBatch,
    discard: () => { batch.current = null; setHasPendingBatch(false); setEditing(null); setConfirmClose(false); onClose(); },
  });
  function requestClose() {
    if (busy.current) return;
    if (hasPendingBatch || renamed) setConfirmClose(true); else onClose();
  }
  function submitUpdate(file: api.Asset, patch: Parameters<typeof api.updateAsset>[2]) {
    if (busy.current || !canEdit) return;
    busy.current = true; setRefreshWarning(""); update.mutate({ file, patch });
  }
  function submitUpload(selected: File[]) {
    if (busy.current || !canEdit || !selected.length) return;
    busy.current = true; setRefreshWarning(""); upload.mutate(selected);
  }
  return <Dialog title="Manage files" onClose={requestClose}>
    <div className="bl-file-manager">
      <p>{project.name} · {activeCount} / {limit} active {limit === 1 ? "document" : "files"}</p>
      <p>Archive a file to take it out of active review. Its comments and original file remain saved. Restore it here when there is room.</p>
      <div className="bl-toolbar wrap">
        <div className="bl-segment" aria-label="File visibility">
          <button type="button" aria-pressed={!showArchived} disabled={pending} onClick={() => setShowArchived(false)}>Active</button>
          <button type="button" aria-pressed={showArchived} disabled={pending} onClick={() => setShowArchived(true)}>Archived</button>
        </div>
        {canEdit && <label className="bl-button mint">{upload.isPending ? "Uploading…" : "Add files"}<input type="file" className="sr-only" aria-label="Add project files" disabled={pending || hasPendingBatch || files.isLoading || files.isError || activeCount >= limit} multiple={limit > 1} accept={project.project_type === "pdf" ? "application/pdf" : "image/png,image/jpeg,image/webp,image/gif"} onChange={event => { const selected = Array.from(event.target.files ?? []); event.target.value = ""; if (!batch.current) submitUpload(selected); }} /></label>}
      </div>
      {files.isLoading && <p role="status">Loading files…</p>}
      {files.error && <p role="alert" className="bl-error">{files.error.message} <button type="button" onClick={() => void files.refetch()}>Retry</button></p>}
      {newVersion.error && <p role="alert" className="bl-error">{newVersion.error.message}</p>}
      <input ref={versionInput} type="file" hidden accept={project.project_type === "pdf" ? "application/pdf,.pdf" : "image/png,image/jpeg,image/webp,image/gif"} onChange={(event) => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected && versionTarget && !busy.current) { busy.current = true; newVersion.mutate({ file: versionTarget, selected }); } }} />
      {(update.error || upload.error) && <p role="alert" className="bl-error">{update.error?.message ?? upload.error?.message} {update.error && <button type="button" className="bl-quiet" disabled={files.isFetching} onClick={() => void files.refetch()}>Reload file list</button>}</p>}
      {progress && <p role="status">{progress}</p>}
      {refreshWarning && <p role="status">{refreshWarning}</p>}
      {hasPendingBatch && !upload.isPending && <div><button type="button" className="bl-button" disabled={pending || !canEdit} onClick={() => { if (batch.current) submitUpload(batch.current.files); }}>Retry remaining uploads</button><button type="button" className="bl-quiet" disabled={pending} onClick={() => { batch.current = null; setHasPendingBatch(false); setProgress("Batch closed. Check the file list before selecting files again; unconfirmed uploads may already be saved."); upload.reset(); }}>Close batch</button></div>}
      {!files.isLoading && !files.error && !visible.length && <p>No {showArchived ? "archived" : "active"} files.</p>}
      <ul className="bl-managed-files">
        {visible.map(file => <li key={file.id}>
          {editing === file.id ? <form onSubmit={event => { event.preventDefault(); if (filename.trim()) submitUpdate(file, { filename: filename.trim(), ...(mobile ? build : {}) }); }}>
            <label>{mobile ? "Screen name" : "File display name"}<input className="bl-input" required autoFocus maxLength={255} readOnly={pending} value={filename} onChange={event => setFilename(event.target.value)} /></label>
            {mobile && <div className="bl-build-fields">
              <label>Build<input className="bl-input" maxLength={80} readOnly={pending} value={build.build_label} placeholder="2.4.0 (311)" onChange={event => setBuild(current => ({ ...current, build_label: event.target.value }))} /></label>
              <label>Device<input className="bl-input" maxLength={80} readOnly={pending} value={build.device} placeholder="iPhone 15 Pro" onChange={event => setBuild(current => ({ ...current, device: event.target.value }))} /></label>
              <label>Platform<select className="bl-input" disabled={pending} value={build.platform} onChange={event => setBuild(current => ({ ...current, platform: event.target.value }))}><option value="">—</option><option>iOS</option><option>Android</option><option>iPadOS</option><option>Other</option></select></label>
            </div>}
            <div><button className="bl-button" disabled={pending || !filename.trim()}>{mobile ? "Save details" : "Save name"}</button><button type="button" className="bl-quiet" disabled={pending} onClick={() => setEditing(null)}>Cancel</button></div>
          </form> : <><div><strong>{file.filename}</strong><small>{mobile ? [file.build_label && `Build ${file.build_label}`, file.device, file.platform].filter(Boolean).join(" · ") || "No build or device yet" : `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.page_count} ${file.page_count === 1 ? "page" : "pages"}`}{(file.version ?? 1) > 1 ? ` · v${file.version}` : ""}{earlierVersions(file) ? ` · ${earlierVersions(file)} earlier version${earlierVersions(file) === 1 ? "" : "s"}` : ""}{file.archived_at ? " · Archived" : ""}</small></div>
            {canEdit && <div>{!file.archived_at && <button type="button" className="bl-quiet" disabled={pending || renamed} title="Upload a new version; comments on this one are kept with it" onClick={() => { if (busy.current) return; newVersion.reset(); setVersionTarget(file); versionInput.current?.click(); }}>{newVersion.isPending && versionTarget?.id === file.id ? "Uploading…" : "New version"}</button>}<button type="button" className="bl-quiet" disabled={pending || (renamed && editing !== file.id)} onClick={() => { if (busy.current) return; update.reset(); setFilename(file.filename); setBuild({ build_label: file.build_label ?? "", device: file.device ?? "", platform: file.platform ?? "" }); setEditing(file.id); }}>{mobile ? "Edit details" : "Rename"}</button><button type="button" className="bl-quiet" disabled={pending || renamed || Boolean(file.archived_at && activeCount >= limit)} onClick={() => { if (busy.current) return; update.reset(); if (file.archived_at) submitUpdate(file, { archived: false }); else setArchiveTarget(file); }}>{file.archived_at ? "Restore" : "Archive"}</button></div>}</>}
        </li>)}
      </ul>
      {archiveTarget && <div className="bl-file-confirm" role="group" aria-label="Confirm file archive"><p>Archive <strong>{archiveTarget.filename}</strong>? It will disappear from active file review. Existing feedback is retained.</p><button type="button" className="bl-quiet" disabled={pending} onClick={() => setArchiveTarget(null)}>Keep file</button><button type="button" className="bl-button" disabled={pending || !canEdit} onClick={() => submitUpdate(archiveTarget, { archived: true })}>{update.isPending ? "Archiving…" : "Archive file"}</button></div>}
      {!canEdit && <p>Editors and managers can add, rename, archive and restore files.</p>}
    </div>
    <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-button" disabled={pending} onClick={requestClose}>Done</button></footer>
    {confirmClose && <Dialog title="Keep your file changes?" onClose={() => setConfirmClose(false)}><div className="bl-form"><p>{hasPendingBatch ? "Some uploads are unconfirmed. Stay to retry the same batch. Closing loses this tab's retry details; check the file list before selecting files again." : "Your file name has unsaved changes. Stay to save it, or discard the name and close."}</p></div><footer className="bl-dialog-actions"><button type="button" className="bl-button" onClick={() => setConfirmClose(false)}>Stay and review</button><button type="button" className="bl-button" disabled={pending} onClick={() => { if (!busy.current) onClose(); }}>Discard draft and close</button></footer></Dialog>}
  </Dialog>;
}
