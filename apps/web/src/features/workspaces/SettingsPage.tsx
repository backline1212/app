import { Avatar } from "@backline/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useUnsavedChanges } from "../../lib/use-unsaved-changes";
import * as workspacesApi from "./api";
import type { WorkspaceOut } from "./api";

export function SettingsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, 'Settings']);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(workspace.name);
  
  const nameChanged = name.trim().length > 0 && name.trim() !== workspace.name;
  useUnsavedChanges(nameChanged);

  const renameMutation = useMutation({
    mutationFn: (newName: string) => workspacesApi.updateWorkspace(workspace.id, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      toast("Workspace name updated.", "success");
    },
    onError: () => {
      toast("Could not update workspace name.", "error");
    },
  });

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>Settings</h1>
          <p>Manage your workspace avatar and name.</p>
        </div>
      </header>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Workspace Avatar</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <Avatar name={workspace.name} size={56} />
            <div>
              <p style={{ fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Avatar</p>
              <p className="bl-mono">Click on the avatar to upload a new image (max 5MB)</p>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: "10px", color: "var(--bl-muted)", marginBottom: "8px" }}>Avatar uploads aren't available yet.</p>
            <button className="bl-button" disabled>Save</button>
          </div>
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Workspace Name</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Name</p>
            <p className="bl-mono">This is your workspace's visible name within Backline.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="bl-input"
              style={{ width: "220px" }}
            />
            <button 
              className="bl-button mint"
              disabled={!nameChanged || renameMutation.isPending}
              onClick={() => renameMutation.mutate(name.trim())}
            >
              Save
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
