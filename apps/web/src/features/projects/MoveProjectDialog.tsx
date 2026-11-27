import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { invalidateProjectMutation, qk } from "../../lib/query-keys";
import { listWorkspaces } from "../workspaces/api";
import * as api from "./api";

/** Moves a project, archived or not, to another workspace the person runs (TDR-0243). */
export function MoveProjectDialog({ project, onClose }: { project: api.ProjectOut; onClose: () => void }) {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [targetId, setTargetId] = useState("");
  const [typedName, setTypedName] = useState("");
  const workspaces = useQuery({ queryKey: qk.workspaces(), queryFn: listWorkspaces });
  const destinations = (workspaces.data ?? []).filter((w) => w.id !== project.workspace_id && (w.role === "owner" || w.role === "admin"));
  const nameMatches = typedName.trim() === project.name.trim();

  const move = useMutation({
    mutationFn: () => api.transferProject(project.id, { target_workspace_id: targetId, project_name: typedName }),
    onSuccess: (moved) => {
      toast(`${project.name} moved to ${moved.workspace_name}.`, "success", {
        action: {
          label: "Open",
          onClick: () => navigate(moved.archived ? `/w/${moved.workspace_slug}?archived=true` : `/w/${moved.workspace_slug}/p/${moved.project_id}`),
        },
      });
      onClose();
      // Last: refreshing removes this project's card, and this dialog with it.
      void invalidateProjectMutation(cache, project.workspace_id);
    },
  });
  const close = () => { if (!move.isPending) onClose(); };

  return <Dialog title={`Move “${project.name}” to another workspace`} onClose={close}>
    <form className="bl-compact-form bl-move-form" onSubmit={(event) => { event.preventDefault(); if (targetId && nameMatches && !move.isPending) move.mutate(); }}>
      {workspaces.isLoading && <p role="status">Loading your workspaces…</p>}
      {workspaces.error && <p role="alert" className="bl-error">{workspaces.error.message}</p>}
      {workspaces.data && destinations.length === 0
        ? <p>There is nowhere to move it yet. You need to be an owner or admin of a second workspace.</p>
        : <>
          <label>Destination workspace
            <select className="bl-input" required disabled={move.isPending} value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="" disabled>Choose a workspace…</option>
              {destinations.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <div className="bl-move-notes">
            <p><strong>Moves with it:</strong> pages, comments, tickets, history, files and client review links.{project.archived_at ? " It stays archived." : ""}</p>
            <p><strong>Changes:</strong></p>
            <ul>
              <li>Tickets get new numbers.</li>
              <li>People who are not in the destination lose access and are unassigned.</li>
              <li>The client link on the project is removed. Add it to a client there.</li>
              <li>Project integrations, extension connections and deploy notification addresses need setting up again.</li>
              <li>Notifications about it are cleared. Past activity stays in this workspace.</li>
            </ul>
          </div>
          <label><span>Type <strong>{project.name}</strong> to confirm</span>
            <input className="bl-input" autoComplete="off" disabled={move.isPending} value={typedName} onChange={(event) => setTypedName(event.target.value)} />
          </label>
        </>}
      {move.error && <p role="alert" className="bl-error">{move.error.message}</p>}
      <footer className="bl-dialog-actions">
        <button type="button" className="bl-quiet" disabled={move.isPending} onClick={close}>Cancel</button>
        {destinations.length > 0 && <button className="bl-button" disabled={!targetId || !nameMatches || move.isPending}>{move.isPending ? "Moving…" : "Move project"}</button>}
      </footer>
    </form>
  </Dialog>;
}
