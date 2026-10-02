import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BulkBar } from "../../components/BulkBar";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import { useToast } from "../../components/Toast";
import { projectCan } from "../../lib/project-roles";
import { invalidateProjectMutation, qk } from "../../lib/query-keys";
import { type BulkResult, bulkSummary, plural, runBulk } from "../../lib/run-bulk";
import type { Selection } from "../../lib/use-selection";
import { useAuth } from "../auth/AuthContext";
import * as api from "./api";

// Bulk actions for the Projects page (TDR-0058): archive or restore several projects,
// and - for owners and admins, on archived projects only - delete them permanently.
// Each one goes through the same per-project endpoint as its ⋯ menu.
export function ProjectBulkActions({ selection, projects, workspaceId, archivedView }: {
  selection: Selection;
  projects: api.ProjectOut[];
  workspaceId: string;
  archivedView: boolean;
}) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const { role } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);
  const chosen = projects.filter((p) => selection.selectedIds.includes(p.id));
  // Archiving and restoring take a project manager; the menu greys them out the same way.
  const manageable = chosen.filter((p) => projectCan(p, "manage"));
  const skipped = chosen.length - manageable.length;
  const canHardDelete = role === "owner" || role === "admin";

  async function run(label: string, rows: api.ProjectOut[], task: (p: api.ProjectOut) => Promise<unknown>) {
    setBusy(`${label} ${plural(rows.length, "project")}…`);
    const result = await runBulk(rows, task);
    await invalidateProjectMutation(cache, workspaceId);
    setBusy(null);
    if (result.failed.length === 0) selection.clear();
    return result;
  }

  async function archive() {
    const result = await run("Archiving", manageable, (p) => api.archiveProject(p.id));
    const { message, variant } = bulkSummary(result, "project", "archived");
    const archived = result.done;
    toast(skipped ? `${message} ${plural(skipped, "project")} skipped - you don't manage ${skipped === 1 ? "it" : "them"}.` : message, skipped && variant === "success" ? "warning" : variant, archived.length ? {
      action: {
        label: "Undo",
        onClick: () => {
          void runBulk(archived, (p) => api.restoreProject(p.id)).then(async (undo) => {
            await invalidateProjectMutation(cache, workspaceId);
            const summary = bulkSummary(undo, "project", "restored");
            toast(summary.message, summary.variant);
          });
        },
      },
    } : undefined);
  }

  async function restore() {
    const result = await run("Restoring", manageable, (p) => api.restoreProject(p.id));
    const { message, variant } = bulkSummary(result, "project", "restored");
    toast(skipped ? `${message} ${plural(skipped, "project")} skipped - you don't manage ${skipped === 1 ? "it" : "them"}.` : message, variant);
  }

  const notManager = manageable.length === 0 ? "You don't manage any of the selected projects" : undefined;

  return (
    <>
      <BulkBar count={selection.count} noun="projects" onClear={selection.clear} busy={busy}>
        {archivedView ? (
          <>
            <button type="button" className="bl-bulkbar-btn" disabled={!manageable.length} title={notManager} onClick={() => void restore()}>
              Restore
            </button>
            {canHardDelete && (
              <button type="button" className="bl-bulkbar-btn danger" onClick={() => setConfirm("delete")}>
                Delete permanently
              </button>
            )}
          </>
        ) : (
          <button type="button" className="bl-bulkbar-btn" disabled={!manageable.length} title={notManager} onClick={() => setConfirm("archive")}>
            Archive
          </button>
        )}
      </BulkBar>

      {confirm === "archive" && (
        <ConfirmDialog
          title={`Archive ${plural(manageable.length, "project")}?`}
          message={
            <>
              <ul className="bl-bulk-list">
                {manageable.slice(0, 6).map((p) => <li key={p.id}>{p.name}</li>)}
                {manageable.length > 6 && <li className="is-more">and {manageable.length - 6} more</li>}
              </ul>
              <p>Their review links stop working and they leave active views. Comments, history and files stay intact - restore them any time from Archived.</p>
              {skipped > 0 && <p className="bl-inline-warning">{plural(skipped, "selected project")} will be skipped - only project managers can archive.</p>}
            </>
          }
          confirmLabel={`Archive ${plural(manageable.length, "project")}`}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void archive();
          }}
        />
      )}

      {confirm === "delete" && (
        <BulkHardDeleteDialog
          projects={chosen}
          onClose={() => setConfirm(null)}
          onDone={async (result) => {
            setConfirm(null);
            await invalidateProjectMutation(cache, workspaceId);
            if (result.failed.length === 0) selection.clear();
            const { message, variant } = bulkSummary(result, "project", "deleted");
            toast(message, variant);
          }}
        />
      )}
    </>
  );
}

type Preview = { project: api.ProjectOut; preview: api.ProjectHardDeletePreviewOut | null; error: string | null };

// The permanent-delete dialog runs each project's own dry-run first, shows the combined
// counts and which projects can't go (not archived, or files outside the project's
// storage), and asks for a typed confirmation before deleting the eligible ones.
function BulkHardDeleteDialog({ projects, onClose, onDone }: {
  projects: api.ProjectOut[];
  onClose: () => void;
  onDone: (result: BulkResult<Preview>) => void;
}) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const previews = useQuery({
    queryKey: qk.bulkHardDeletePreview(projects.map((p) => p.id)),
    gcTime: 0,
    staleTime: Infinity,
    queryFn: async (): Promise<Preview[]> =>
      Promise.all(
        projects.map(async (project) => {
          try {
            return { project, preview: await api.previewHardDeleteProject(project.id), error: null };
          } catch (error) {
            return { project, preview: null, error: error instanceof Error ? error.message : "Preview failed." };
          }
        }),
      ),
  });
  const rows = previews.data ?? [];
  const reasonFor = (row: Preview) =>
    row.error ?? (!row.preview?.archived ? "Not archived" : (row.preview.counts.unsafe_object_references ?? 0) > 0 ? "Has files outside its storage - open it to review" : null);
  const eligible = rows.filter((row) => reasonFor(row) === null);
  const blocked = rows.filter((row) => reasonFor(row) !== null);
  const sum = (key: "comments" | "pages" | "project_assets" | "share_links") => eligible.reduce((total, row) => total + (row.preview?.counts[key] ?? 0), 0);
  const phrase = `delete ${plural(eligible.length, "project")}`;

  return (
    // Closing mid-delete (Escape always closes a native dialog) only hides it: the
    // deletions carry on and onDone still reports them.
    <Dialog title={`Delete ${plural(projects.length, "project")} permanently?`} onClose={onClose}>
      <div className="bl-danger-banner">
        <span>
          <strong>This cannot be undone</strong>
          <small>Every review link shared from these projects breaks. Keep them archived if you may need any part of them later.</small>
        </span>
      </div>
      <div className="bl-hard-delete-body">
        {previews.isLoading && (
          <div className="bl-delete-loading" role="status">
            <i />
            <span>Checking exactly what would be deleted…</span>
          </div>
        )}
        {previews.data && (
          <>
            {eligible.length > 0 && (
              <>
                <dl className="bl-delete-counts">
                  <div><dt>Projects</dt><dd>{eligible.length}</dd></div>
                  <div><dt>Comments</dt><dd>{sum("comments")}</dd></div>
                  <div><dt>Pages</dt><dd>{sum("pages")}</dd></div>
                  <div><dt>Assets</dt><dd>{sum("project_assets")}</dd></div>
                  <div><dt>Share links</dt><dd>{sum("share_links")}</dd></div>
                </dl>
                <ul className="bl-bulk-list">
                  {eligible.map((row) => <li key={row.project.id}>{row.project.name}</li>)}
                </ul>
                {eligible[0].preview?.retention_notice && <p className="bl-retention-note">{eligible[0].preview.retention_notice}</p>}
              </>
            )}
            {blocked.length > 0 && (
              <div className="bl-state-panel" role="note">
                <h3>{plural(blocked.length, "project")} won't be deleted</h3>
                <ul className="bl-bulk-list">
                  {blocked.map((row) => (
                    <li key={row.project.id}>
                      {row.project.name} <small>- {reasonFor(row)}</small>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {eligible.length > 0 && (
              <label className="bl-delete-confirm-label">
                Type <strong>{phrase}</strong> to confirm
                <input className="bl-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" disabled={deleting} />
              </label>
            )}
          </>
        )}
      </div>
      <footer className="bl-dialog-actions bl-dialog-actions-bordered">
        <button type="button" className="bl-quiet" disabled={deleting} onClick={onClose}>
          Cancel
        </button>
        {eligible.length > 0 && (
          <button
            type="button"
            className="bl-button danger"
            disabled={deleting || typed.trim().toLowerCase() !== phrase}
            onClick={async () => {
              setDeleting(true);
              // One at a time: each deletion is a heavy, multi-collection job on the server.
              const result = await runBulk(eligible, (row) => api.confirmHardDeleteProject(row.project.id, { correlation_id: row.preview!.correlation_id, project_name: row.project.name }), 1);
              onDone(result);
            }}
          >
            {deleting ? "Deleting…" : `Delete ${plural(eligible.length, "project")} forever`}
          </button>
        )}
      </footer>
    </Dialog>
  );
}
