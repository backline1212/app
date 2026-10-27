import { Avatar } from "@backline/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useUnsavedChanges } from "../../lib/use-unsaved-changes";
import { useAuth } from "../auth/AuthContext";
import * as workspacesApi from "./api";
import type { WorkspaceOut } from "./api";
import { RoomCodePanel } from "./team/RoomCodePanel";
import { BrandingSettings } from "./BrandingSettings";
import { WORKSPACE_ROLE_LABEL } from "./team/team-utils";

export function SettingsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "Settings"]);
  const { toast } = useToast();
  const { role } = useAuth();
  const navigate = useNavigate();
  // UI only: every change here needs workspace:update_settings, which the API checks itself.
  const canEdit = role === "owner" || role === "admin";
  const queryClient = useQueryClient();
  const [name, setName] = useState(workspace.name);
  const [leaving, setLeaving] = useState(false);

  const nameChanged = name.trim().length > 0 && name.trim() !== workspace.name;
  useUnsavedChanges(canEdit && nameChanged);

  const update = useMutation({
    mutationFn: (changes: workspacesApi.WorkspaceUpdate) => workspacesApi.updateWorkspace(workspace.id, changes),
    onSuccess: async (_, changes) => {
      await queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      toast(changes.name ? "Workspace name updated." : "Workspace settings updated.", "success");
    },
    onError: (error) => toast(error instanceof Error ? error.message : "Could not update the workspace.", "error"),
  });
  const [deleting, setDeleting] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const remove = useMutation({
    mutationFn: () => workspacesApi.deleteWorkspace(workspace.id, deleteName),
    onSuccess: async () => {
      setDeleting(false);
      await queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      navigate("/", { replace: true });
    },
  });

  const leave = useMutation({
    mutationFn: () => workspacesApi.leaveWorkspace(workspace.id),
    onSuccess: async () => {
      setLeaving(false);
      await queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      navigate("/", { replace: true });
    },
  });

  function saveName(event: FormEvent) {
    event.preventDefault();
    if (canEdit && nameChanged && !update.isPending) update.mutate({ name: name.trim() });
  }

  return (
    <main className="bl-wrap ws-settings">
      <header className="bl-head">
        <div>
          <h1>Settings</h1>
          <p>
            {canEdit
              ? "Your workspace's name, how people join, and who can start projects."
              : "Your workspace's name and how people join. Owners and admins can change these."}
          </p>
        </div>
      </header>

      <section className="ws-card">
        <header>
          <h2>Workspace</h2>
          <p>How it appears to your team and to clients on review links.</p>
        </header>
        <form className="ws-settings-body" onSubmit={saveName}>
          <div className="ws-settings-identity">
            <Avatar name={workspace.name} size={52} />
            <p className="bl-mono">The avatar is made from the workspace name.</p>
          </div>
          <label className="ws-settings-field" htmlFor="workspace-name">
            <span>Name</span>
            <span className="ws-settings-inline">
              <input
                id="workspace-name"
                value={name}
                maxLength={200}
                readOnly={!canEdit}
                onChange={(event) => setName(event.target.value)}
                className="bl-input"
              />
              {canEdit && (
                <button type="submit" className="bl-button mint" disabled={!nameChanged || update.isPending}>
                  {update.isPending && update.variables?.name ? "Saving…" : "Save"}
                </button>
              )}
            </span>
          </label>
        </form>
      </section>

      <section className="ws-card">
        <header>
          <h2>Joining</h2>
          <p>One room code your team can enter to join, instead of an email invite each.</p>
        </header>
        <div className="ws-settings-body">
          {canEdit ? (
            <RoomCodePanel workspace={workspace} />
          ) : (
            <p className="ws-settings-note">
              {workspace.room_code_enabled
                ? "People can join this workspace with a room code. Ask an owner or admin for it."
                : "People join by email invite from an owner or admin."}
            </p>
          )}
        </div>
      </section>

      <section className="ws-card">
        <header>
          <h2>Projects</h2>
          <p>Who can start projects. Access to each project is set on the project.</p>
        </header>
        <div className="ws-settings-body">
          <label className={`bl-setting-row${canEdit ? "" : " bl-setting-row-static"}`}>
            <span className="bl-setting-copy">
              <strong>Members can create projects</strong>
              <span>
                {workspace.members_can_create_projects
                  ? "Anyone in the workspace can start a project, and manages the projects they create."
                  : "Only owners and admins start projects. Members work on the projects they're added to."}
              </span>
            </span>
            <input
              type="checkbox"
              className="bl-switch-input"
              checked={workspace.members_can_create_projects}
              disabled={!canEdit || update.isPending}
              onChange={(event) => update.mutate({ members_can_create_projects: event.target.checked })}
              aria-label="Members can create projects"
            />
            <span className="bl-switch" aria-hidden="true"><i /></span>
          </label>
          <p className="ws-settings-note">
            Who can open each project, and with what role, is set on the project itself - or for everyone at once on
            the <Link to={`/w/${workspace.slug}/members?view=access`}>Team page's Access tab</Link>.
          </p>
        </div>
      </section>

      <BrandingSettings workspace={workspace} canEdit={canEdit} />

      <section className="ws-card">
        <header>
          <h2>Your membership</h2>
          <p>Your own place in this workspace.</p>
        </header>
        <div className="ws-settings-body">
          <p className="ws-settings-note">
            You're {role === "owner" ? "the" : role === "admin" ? "an" : "a"}{" "}
            <strong>{(WORKSPACE_ROLE_LABEL[role ?? ""] ?? role ?? "member").toLowerCase()}</strong> of {workspace.name}.
          </p>
          {role === "owner" ? (
            <p className="ws-settings-note">
              To leave, first make someone else the owner from their profile on the{" "}
              <Link to={`/w/${workspace.slug}/members`}>Team page</Link>.
            </p>
          ) : (
            <button type="button" className="bl-quiet danger" onClick={() => setLeaving(true)}>
              Leave {workspace.name}
            </button>
          )}
        </div>
      </section>

      {role === "owner" && (
        <section className="ws-card">
          <header>
            <h2>Delete workspace</h2>
            <p>Close {workspace.name} for everyone.</p>
          </header>
          <div className="ws-settings-body">
            <p className="ws-settings-note">
              Everyone loses access at once and review links stop working. Projects, files and comments are deleted
              permanently 30 days later. Billing and audit records are kept.
            </p>
            <button type="button" className="bl-quiet danger" onClick={() => { setDeleteName(""); remove.reset(); setDeleting(true); }}>
              Delete {workspace.name}…
            </button>
          </div>
        </section>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${workspace.name}?`}
          message={
            <>
              <p>Everyone in it loses access now; its projects, files and comments are deleted after 30 days. Type the workspace name to confirm.</p>
              <input className="bl-input" aria-label="Workspace name" value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={workspace.name} autoFocus />
              {remove.error && <p className="bl-error" role="alert">{remove.error.message}</p>}
            </>
          }
          confirmLabel={remove.isPending ? "Deleting…" : "Delete workspace"}
          destructive
          pending={remove.isPending}
          confirmDisabled={deleteName.trim() !== workspace.name.trim()}
          onConfirm={() => remove.mutate()}
          onCancel={() => setDeleting(false)}
        />
      )}

      {leaving && (
        <ConfirmDialog
          title={`Leave ${workspace.name}?`}
          message={
            <>
              <p>You lose access to its projects. To come back you'll need a new invite or the room code.</p>
              {leave.error && <p className="bl-error" role="alert">{leave.error.message}</p>}
            </>
          }
          confirmLabel={leave.isPending ? "Leaving…" : "Leave workspace"}
          destructive
          pending={leave.isPending}
          onConfirm={() => leave.mutate()}
          onCancel={() => setLeaving(false)}
        />
      )}
    </main>
  );
}
