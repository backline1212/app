import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog } from "../../../components/Dialog";
import { invalidateTicketsAndDashboard, qk } from "../../../lib/query-keys";
import { TAGS } from "../../../lib/workflow";
import { listProjects } from "../../projects/api";
import type { WorkspaceOut, MemberOut } from "../../workspaces/api";
import * as api from "../api";
import { DatePicker } from "./DatePicker";
import { PeoplePicker } from "./PeoplePicker";

export function NewTicket({ workspace, members, onClose }: { workspace: WorkspaceOut; members: MemberOut[]; onClose: () => void }) {
  const cache = useQueryClient();
  const projects = useQuery({ queryKey: qk.projects(workspace.id), queryFn: () => listProjects(workspace.id, true) });
  const [projectId, setProjectId] = useState("");
  const [body, setBody] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [tags, setTags] = useState<(typeof TAGS)[number][]>([]);
  const save = useMutation({
    mutationFn: () => api.createTicket(projectId, { body, status: "todo", priority, assignee_ids: assignees, due_at: dueAt, tags }),
    onSuccess: async () => {
      await invalidateTicketsAndDashboard(cache, workspace.id);
      await cache.invalidateQueries({ queryKey: qk.projectComments(projectId) });
      onClose();
    },
  });
  return (
    <Dialog title="New team ticket" onClose={onClose}>
      <form
        className="bl-form"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <p>Raise work for your team without pinning it to a page.</p>
        <label>
          Project
          <select className="bl-input" required value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Choose a project</option>
            {projects.data
              ?.filter((p) => !p.archived_at)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          What needs to change?
          <textarea className="bl-input" required rows={4} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <div className="bl-fields">
          <label>
            Priority
            <select className="bl-input" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              {["high", "medium", "low"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <DatePicker value={dueAt} onChange={setDueAt} />
          </label>
        </div>
        <fieldset>
          <legend>Tags</legend>
          <div className="bl-chip-row">
            {TAGS.map((tag) => (
              <label className="bl-chip" key={tag}>
                <input type="checkbox" checked={tags.includes(tag)} onChange={(e) => setTags(e.target.checked ? [...tags, tag] : tags.filter((t) => t !== tag))} />
                {tag}
              </label>
            ))}
          </div>
        </fieldset>
        <PeoplePicker label="Assignees" members={members} selected={assignees} onChange={setAssignees} />
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Screenshots</label>
          <div className="bl-attach-disabled">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 15 5-5 4 4 3-3 6 6" />
            </svg>
            <span>
              Attaching a screenshot when raising a team ticket isn't available yet.
              <span className="bl-saved-only">Coming soon</span>
            </span>
          </div>
        </div>
        {save.error && (
          <p role="alert" className="bl-error">
            {save.error.message}
          </p>
        )}
        <div className="bl-form-actions">
          <button type="button" className="bl-quiet" onClick={onClose}>
            Cancel
          </button>
          <button className="bl-button" disabled={save.isPending || !projectId || !body.trim()}>
            {save.isPending ? "Creating…" : "Create ticket"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
