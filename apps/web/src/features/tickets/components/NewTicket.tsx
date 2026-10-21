import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Schemas } from "@backline/types";
import { Dialog } from "../../../components/Dialog";
import { invalidateTicketsAndDashboard, qk } from "../../../lib/query-keys";
import { TAGS } from "../../../lib/workflow";
import { uploadAttachment } from "../../board/api";
import { listPages, listProjects } from "../../projects/api";
import type { WorkspaceOut, MemberOut } from "../../workspaces/api";
import * as api from "../api";
import { DatePicker } from "./DatePicker";
import { projectCan } from "../../../lib/project-roles";
import { reviewPagePath } from "../../../lib/review-page-path";

type Shot = Schemas["AttachmentIn"] & { preview: string };

function pageLabel(page: { title: string | null; url_normalized: string }) {
  if (/^https?:\/\//.test(page.url_normalized)) {
    return reviewPagePath(page.url_normalized);
  }
  return page.title || page.url_normalized;
}

export function NewTicket({ workspace, members, onClose, initialProjectId = "", initialPageId = "", teamNote = false }: { workspace: WorkspaceOut; members: MemberOut[]; onClose: () => void; initialProjectId?: string; initialPageId?: string; teamNote?: boolean }) {
  const cache = useQueryClient();
  const mounted = useRef(true);
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; uploadController.current?.abort(); }; }, []);
  const [confirmed, setConfirmed] = useState(false);
  const [completionWarning, setCompletionWarning] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const projects = useQuery({ queryKey: qk.projects(workspace.id), queryFn: () => listProjects(workspace.id, true) });
  const active = useMemo(() => projects.isError ? [] : projects.data?.filter((p) => !p.archived_at && projectCan(p, "edit")) ?? [], [projects.data, projects.isError]);
  const [projectId, setProjectId] = useState(initialProjectId);
  const pages = useQuery({ queryKey: qk.projectPages(projectId), queryFn: ({ signal }) => listPages(projectId, signal), enabled: Boolean(projectId) });
  const [pageId, setPageId] = useState(initialPageId);
  const busy = useRef(false);
  const uploadBusy = useRef(false);
  const prepared = useRef<{ projectId: string; payload: Schemas["TicketCreate"] } | null>(null);
  const [retryLocked, setRetryLocked] = useState(false);
  const ambiguous = useRef(false);
  const [copyStatus, setCopyStatus] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const [body, setBody] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [tag, setTag] = useState<(typeof TAGS)[number] | "">("Bug");
  const [shots, setShots] = useState<Shot[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Preselect the first live project, and its first page, like the design does.
  useEffect(() => {
    if (!projectId && active[0]) setProjectId(active[0].id);
  }, [projectId, active]);
  useEffect(() => {
    if (pages.data && !busy.current && !retryLocked) setPageId(current => !current || pages.data.some(page => page.id === current) ? current : pages.data[0]?.id ?? "");
  }, [pages.data, retryLocked]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.preview)), []);

  function changeProject(id: string) {
    if (busy.current || uploadBusy.current || retryLocked) return;
    setProjectId(id);
    setPageId("");
    // Uploads are keyed to a project, so they can't follow the ticket to another one.
    shots.forEach((s) => URL.revokeObjectURL(s.preview));
    shotsRef.current = [];
    setShots([]);
  }

  async function addShots(files: FileList | null) {
    if (!files?.length || !projectId || busy.current || uploadBusy.current || retryLocked || confirmed || !active.some(project => project.id === projectId)) return;
    const selected = Array.from(files);
    if (selected.length > 10 - shotsRef.current.length) { setUploadError(`Choose at most ${10 - shotsRef.current.length} more screenshots. No files from this selection were uploaded.`); if (fileRef.current) fileRef.current.value = ""; return; }
    uploadBusy.current = true;
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true);
    setUploadError("");
    // Kept even if a later file fails, so the screenshots that did upload stay attached.
    let failed = 0;
    try {
      for (const file of selected) {
        if (!mounted.current || controller.signal.aborted) break;
        try {
          if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) throw new Error("Unsupported screenshot type");
          const attachment = await uploadAttachment(projectId, file, controller.signal);
          if (!mounted.current || controller.signal.aborted) break;
          const shot = { ...attachment, preview: URL.createObjectURL(file) };
          shotsRef.current = [...shotsRef.current, shot];
          setShots(shotsRef.current);
        } catch { failed += 1; }
      }
      if (mounted.current && failed) setUploadError(`${failed} screenshot(s) could not be confirmed. Successful uploads are kept. Retry only failed files; PNG, JPG, WebP or GIF files must be at most 20 MiB.`);
    } finally {
      if (mounted.current) setUploading(false);
      uploadBusy.current = false;
      if (uploadController.current === controller) uploadController.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const submission = prepared.current;
      if (!submission) throw new Error("Prepare your ticket before saving.");
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30_000);
      try { return await api.createTicket(submission.projectId, submission.payload, controller.signal); }
      catch (error) {
        const status = error instanceof Error && "status" in error ? Number(error.status) : 0;
        if (!ambiguous.current && [400, 403, 404, 413, 422].includes(status)) {
          prepared.current = null;
          setRetryLocked(false);
        } else {
          ambiguous.current = true;
          setRetryLocked(true);
        }
        throw error;
      } finally { window.clearTimeout(timeout); }
    },
    onSettled: () => { busy.current = false; },
    onSuccess: () => {
      if (!mounted.current) return;
      setConfirmed(true); setRetryLocked(false); ambiguous.current = false; prepared.current = null;
      void Promise.all([
        invalidateTicketsAndDashboard(cache, workspace.id),
        cache.invalidateQueries({ queryKey: qk.projectComments(projectId) }),
      ]).then(() => { if (mounted.current) onClose(); })
        .catch(() => { if (mounted.current) setCompletionWarning("Saved. Some views could not refresh. Close this form and reload to see the saved ticket or team note."); });
    },
  });

  const hasDraft = !confirmed && Boolean(body.trim() || shots.length || assignee || dueAt || priority !== "medium" || tag !== "Bug" || retryLocked);
  useEffect(() => {
    if (!hasDraft && !save.isPending && !uploading) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [hasDraft, save.isPending, uploading]);
  function requestClose() {
    if (busy.current || uploadBusy.current) return;
    if (hasDraft) setConfirmClose(true); else onClose();
  }
  function submit() {
    if (busy.current || uploadBusy.current || confirmed || !body.trim() || body.trim().length > 10_000 || !active.some(project => project.id === projectId)) return;
    prepared.current ??= { projectId, payload: structuredClone({
      body: body.trim(), status: "todo", priority, assignee_ids: assignee ? [assignee] : [],
      due_at: dueAt, tags: tag ? [tag] : [], page_id: pageId || null,
      attachments: shotsRef.current.map(({ key, filename, content_type }) => ({ key, filename, content_type })), client_request_id: requestId.current,
    }) };
    busy.current = true; save.mutate();
  }

  return (
    <Dialog title={teamNote ? "New team note" : "New ticket"} onClose={requestClose}>
      <p className="bl-nt-sub">{teamNote ? "A team-only note for this page. It stays in Backline and is hidden from guest reviewers." : "Create a team-only ticket, with an optional page and screenshots."}</p>
      <form
        className="bl-nt"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={save.isPending || uploading || retryLocked || confirmed} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className="bl-nt-field">
          <span>What needs doing</span>
          <textarea className="bl-nt-ta" required autoFocus rows={3} maxLength={10000} placeholder="Check the analytics event fires on the pricing CTA" value={body} onChange={(e) => { if (!busy.current) setBody(e.target.value); }} />
        </label>
        <div className="bl-nt-grid">
          <label className="bl-nt-field">
            <span>Project</span>
            <select className="bl-nt-sel" required value={projectId} onChange={(e) => changeProject(e.target.value)}>
              {!active.length && <option value="">No active projects with editor access</option>}
              {projectId && !active.some(project => project.id === projectId) && <option value={projectId} disabled>Previous project unavailable — choose another</option>}
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bl-nt-field">
            <span>Page or file</span>
            <select className="bl-nt-sel" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={!projectId || pages.isLoading}>
              {pages.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {pageLabel(p)}
                </option>
              ))}
              <option value="">Whole project</option>
            </select>
          </label>
          <div className="bl-nt-field">
            <span>Due date</span>
            <DatePicker disabled={save.isPending || uploading || retryLocked || confirmed || !active.some(project => project.id === projectId)} value={dueAt} onChange={setDueAt} triggerClassName="bl-nt-date">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              {dueAt ? new Date(dueAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "No due date"}
            </DatePicker>
          </div>
          <label className="bl-nt-field">
            <span>Priority</span>
            <select className="bl-nt-sel" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="bl-nt-field">
            <span>Assignee</span>
            <select className="bl-nt-sel" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bl-nt-field">
            <span>Tag</span>
            <select className="bl-nt-sel" value={tag} onChange={(e) => setTag(e.target.value as typeof tag)}>
              {TAGS.map((t) => (
                <option key={t}>{t}</option>
              ))}
              <option value="">No tag</option>
            </select>
          </label>
        </div>
        <div className="bl-nt-field">
          <span>Screenshots</span>
          <div className="bl-nt-shots">
            {shots.map((s, i) => (
              <span className="bl-nt-shot" key={s.key}>
                <img src={s.preview} alt={s.filename} title={s.filename} />
                <button type="button" aria-label={`Remove ${s.filename}`} onClick={() => {
                    URL.revokeObjectURL(s.preview);
                    shotsRef.current = shots.filter((_, j) => j !== i);
                    setShots(shotsRef.current);
                  }}>
                  ×
                </button>
              </span>
            ))}
            {shots.length < 10 && (
              <button type="button" className="bl-nt-shot-add" disabled={!projectId || uploading} onClick={() => fileRef.current?.click()}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="8.5" cy="9.5" r="1.7" />
                  <path d="M21 15l-5-5L5 20" />
                </svg>
                {uploading ? "Uploading…" : shots.length ? "Add another" : "Attach a screenshot"}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => void addShots(e.target.files)} />
          </div>
          <small>Whoever picks this up sees them on the ticket.</small>
        </div>
        </fieldset>
        {projects.error && <p role="alert" className="bl-error">{projects.error.message} <button type="button" onClick={() => void projects.refetch()}>Retry loading projects</button></p>}
        {pages.error && <p role="alert" className="bl-error">{pages.error.message} <button type="button" onClick={() => void pages.refetch()}>Retry loading pages</button></p>}
        {(save.error || uploadError) && (
          <p role="alert" className="bl-error">
            {save.error?.message ?? uploadError}
          </p>
        )}
        {retryLocked && <p role="status">Saving is unconfirmed. Retry sends the same ticket. Check Backline before starting another one.</p>}
        {confirmed && <p role="status">Saved. You can close this form while the ticket list refreshes.</p>}
        {completionWarning && <p role="status">{completionWarning}</p>}
        {body.trim() && <button type="button" className="bl-quiet" disabled={save.isPending} onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(body).then(() => setCopyStatus("Text copied.")).catch(() => setCopyStatus("Select your original text below and copy it manually.")); else setCopyStatus("Select your original text below and copy it manually."); }}>Copy text</button>}
        {copyStatus && <p role="status">{copyStatus}</p>}
        {copyStatus.startsWith("Select") && <textarea className="bl-input" readOnly aria-label="Original ticket text to copy" value={body} onFocus={event => event.target.select()} />}
        <div className="bl-form-actions">
          <button type="button" className="bl-quiet" disabled={save.isPending || uploading} onClick={requestClose}>
            {retryLocked || confirmed ? "Close" : "Cancel"}
          </button>
          <button className="bl-button" disabled={confirmed || save.isPending || uploading || !active.some(project => project.id === projectId) || !body.trim()}>
            {confirmed ? "Saved" : save.isPending ? "Saving…" : retryLocked ? "Retry save" : teamNote ? "Save team note" : "Create ticket"}
          </button>
        </div>
      </form>
      {confirmClose && <Dialog title="Keep your ticket draft?" onClose={() => setConfirmClose(false)}><div className="bl-form"><p>{retryLocked ? "Saving is unconfirmed. Stay to retry or copy the original ticket. It may already be saved; check Backline before creating it again." : "You have unsaved ticket text, details or screenshots. Stay to save or copy them, or discard this draft and close."}</p></div><footer className="bl-dialog-actions"><button type="button" className="bl-button" onClick={() => setConfirmClose(false)}>Stay and review</button><button type="button" className="bl-button" disabled={save.isPending || uploading} onClick={() => { if (!busy.current && !uploadBusy.current) onClose(); }}>Discard draft and close</button></footer></Dialog>}
    </Dialog>
  );
}
