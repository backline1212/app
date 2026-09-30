import { Avatar } from "@backline/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useUnsavedChanges } from "../../lib/use-unsaved-changes";
import { useAuth } from "../auth/AuthContext";
import * as workspacesApi from "./api";
import type { WorkspaceOut } from "./api";

export function SettingsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, 'Settings']);
  const { toast } = useToast();
  const { role } = useAuth();
  // UI only: renaming needs workspace:update_settings, which the API checks itself.
  const canEdit = role === "owner" || role === "admin";
  const queryClient = useQueryClient();
  const [name, setName] = useState(workspace.name);

  const nameChanged = name.trim().length > 0 && name.trim() !== workspace.name;
  useUnsavedChanges(canEdit && nameChanged);

  const renameMutation = useMutation({
    mutationFn: (newName: string) => workspacesApi.updateWorkspace(workspace.id, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      toast("Workspace name updated.", "success");
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : "Could not update workspace name.", "error");
    },
  });

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>Settings</h1>
          <p>{canEdit ? "Manage your workspace's name and how it appears." : "Your workspace's name and how it appears. Owners and admins can change it."}</p>
        </div>
      </header>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Workspace Avatar</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <Avatar name={workspace.name} size={56} />
          <div>
            <p style={{ fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Avatar</p>
            <p className="bl-mono">Made from the workspace name. Uploading an image isn't available yet.</p>
          </div>
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Workspace Name</h2>
        </header>
        <form
          style={{ flex: 1, padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}
          onSubmit={(event) => {
            event.preventDefault();
            if (canEdit && nameChanged && !renameMutation.isPending) renameMutation.mutate(name.trim());
          }}
        >
          <div>
            <label htmlFor="workspace-name" style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Name</label>
            <p className="bl-mono">This is your workspace's visible name within Backline.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              id="workspace-name"
              value={name}
              maxLength={200}
              readOnly={!canEdit}
              onChange={(event) => setName(event.target.value)}
              className="bl-input"
              style={{ width: "220px" }}
            />
            {canEdit && (
              <button type="submit" className="bl-button mint" disabled={!nameChanged || renameMutation.isPending}>
                {renameMutation.isPending ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
