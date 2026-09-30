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
  const [roomCode, setRoomCode] = useState(workspace.room_code || "");
  const [requiresApproval, setRequiresApproval] = useState(workspace.join_requires_approval);

  const nameChanged = name.trim().length > 0 && name.trim() !== workspace.name;
  const roomCodeChanged = roomCode !== (workspace.room_code || "");
  const approvalChanged = requiresApproval !== workspace.join_requires_approval;
  const hasChanges = nameChanged || roomCodeChanged || approvalChanged;
  
  useUnsavedChanges(canEdit && hasChanges);

  const updateMutation = useMutation({
    mutationFn: (update: { name?: string; room_code?: string | null; join_requires_approval?: boolean }) => workspacesApi.updateWorkspace(workspace.id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      toast("Workspace settings updated.", "success");
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : "Could not update workspace settings.", "error");
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
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
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
          </div>
        </div>
      </section>

      <section className="bl-attention bl-settings-section">
        <header>
          <h2>Room Code Access</h2>
        </header>
        <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
            <div>
              <label htmlFor="room-code" style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Room Code</label>
              <p className="bl-mono">Users can request to join using this code.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                id="room-code"
                value={roomCode}
                maxLength={50}
                placeholder="e.g. MYTEAM2024"
                readOnly={!canEdit}
                onChange={(event) => setRoomCode(event.target.value)}
                className="bl-input"
                style={{ width: "220px" }}
              />
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "20px", flexWrap: "wrap" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, marginBottom: "4px" }}>Join Requires Approval</label>
              <p className="bl-mono">If disabled, users with the room code join instantly.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="checkbox"
                checked={requiresApproval}
                disabled={!canEdit}
                onChange={(event) => setRequiresApproval(event.target.checked)}
                className="bl-checkbox"
              />
            </div>
          </div>
        </div>
      </section>

      {canEdit && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "24px" }}>
          <button 
            type="button" 
            className="bl-button mint" 
            disabled={!hasChanges || updateMutation.isPending}
            onClick={() => {
              if (canEdit && hasChanges && !updateMutation.isPending) {
                const update: { name?: string; room_code?: string | null; join_requires_approval?: boolean } = {};
                if (nameChanged) update.name = name.trim();
                if (roomCodeChanged) update.room_code = roomCode.trim() || null;
                if (approvalChanged) update.join_requires_approval = requiresApproval;
                updateMutation.mutate(update);
              }
            }}
          >
            {updateMutation.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </main>
  );
}
