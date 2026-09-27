import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Schemas } from "@backline/types";
import { Dialog } from "../../../components/Dialog";
import { invalidateTicketsAndDashboard, qk } from "../../../lib/query-keys";
import { TAGS } from "../../../lib/workflow";
import { createUpload } from "../../board/api";
import { listPages, listProjects } from "../../projects/api";
import type { WorkspaceOut, MemberOut } from "../../workspaces/api";
import * as api from "../api";
import { DatePicker } from "./DatePicker";

type Shot = Schemas["AttachmentIn"] & { preview: string };

function pageLabel(page: { title: string | null; url_normalized: string }) {
  if (/^https?:\/\//.test(page.url_normalized)) {
    try {
      return new URL(page.url_normalized).pathname || "/";
    } catch {
      /* fall through to the title */
    }
  }
  return page.title || page.url_normalized;
}

export function NewTicket({ workspace, members, onClose }: { workspace: WorkspaceOut; members: MemberOut[]; onClose: () => void }) {
  const cache = useQueryClient();
  const projects = useQuery({ queryKey: qk.projects(workspace.id), queryFn: () => listProjects(workspace.id, true) });
  const active = useMemo(() => projects.data?.filter((p) => !p.archived_at) ?? [], [projects.data]);
  const [projectId, setProjectId] = useState("");
  const pages = useQuery({ queryKey: qk.projectPages(projectId), queryFn: ({ signal }) => listPages(projectId, signal), enabled: Boolean(projectId) });
  const [pageId, setPageId] = useState("");
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
    setPageId(pages.data?.[0]?.id ?? "");
  }, [pages.data]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.preview)), []);

  function changeProject(id: string) {
    setProjectId(id);
    setPageId("");
    // Uploads are keyed to a project, so they can't follow the ticket to another one.
    shots.forEach((s) => URL.revokeObjectURL(s.preview));
    setShots([]);
  }

  async function addShots(files: FileList | null) {
    if (!files?.length || !projectId) return;
    setUploading(true);
    setUploadError("");
    try {
      const added: Shot[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const upload = await createUpload(projectId, file.type, file.size);
        const put = await fetch(upload.upload_url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!put.ok) throw new Error(`Couldn't upload ${file.name}.`);
        added.push({ key: upload.key, filename: file.name, content_type: file.type, preview: URL.createObjectURL(file) });
      }
      setShots((prev) => [...prev, ...added].slice(0, 10));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't upload that screenshot.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const save = useMutation({
    mutationFn: () =>
      api.createTicket(projectId, {
        body,
        status: "todo",
        priority,
        assignee_ids: assignee ? [assignee] : [],
        due_at: dueAt,
        tags: tag ? [tag] : [],
        page_id: pageId || null,
        attachments: shots.map(({ key, filename, content_type }) => ({ key, filename, content_type })),
      }),
    onSuccess: async () => {
      await invalidateTicketsAndDashboard(cache, workspace.id);
      await cache.invalidateQueries({ queryKey: qk.projectComments(projectId) });
      onClose();
    },
  });

  return (
    <Dialog title="New ticket" onClose={onClose}>
      <p className="bl-nt-sub">Raise work that is not tied to a comment yet — pin it on a page later</p>
      <form
        className="bl-nt"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="bl-nt-field">
          <span>What needs doing</span>
          <textarea className="bl-nt-ta" required autoFocus rows={3} maxLength={10000} placeholder="Check the analytics event fires on the pricing CTA" value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <div className="bl-nt-grid">
          <label className="bl-nt-field">
            <span>Project</span>
            <select className="bl-nt-sel" required value={projectId} onChange={(e) => changeProject(e.target.value)}>
              {!active.length && <option value="">No projects yet</option>}
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
            <DatePicker value={dueAt} onChange={setDueAt} triggerClassName="bl-nt-date">
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
                    setShots(shots.filter((_, j) => j !== i));
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
        {(save.error || uploadError) && (
          <p role="alert" className="bl-error">
            {save.error?.message ?? uploadError}
          </p>
        )}
        <div className="bl-form-actions">
          <button type="button" className="bl-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="bl-button" disabled={save.isPending || uploading || !projectId || !body.trim()}>
            {save.isPending ? "Creating…" : "Create ticket"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
