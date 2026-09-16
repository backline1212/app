import { Avatar } from "@backline/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import * as projectsApi from "../projects/api";
import * as workspacesApi from "./api";
import type { WorkspaceOut } from "./api";

// usePermission-style check: UI-only, purely to avoid showing controls the user can't
// use - the backend re-checks every one of these against the same matrix regardless
// (05-Frontend-Architecture.md §5.5, 13-Authentication.md §13.5).
function canManageMembers(role: string | null): boolean {
  return role === "owner" || role === "admin";
}
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import { LoadingScreen } from "../../components/LoadingScreen";
import { SearchIcon } from "../../components/icons";
import type { MemberOut } from "./api";

interface AddMemberModalProps {
  onInvite: (email: string, role: "admin" | "member") => Promise<void>;
  onClose: () => void;
}

function AddMemberModal({ onInvite, onClose }: AddMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onInvite(email, role);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog title="Add member" onClose={onClose}>
      <form onSubmit={handleSubmit} className="bl-form">
        <label>
          Email
          <input
            required
            type="email"
            autoFocus
            placeholder="teammate@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="bl-input"
          />
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as "admin" | "member")}
            className="bl-select"
            style={{ width: "100%", maxWidth: "none" }}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {error && <div className="bl-error">{error}</div>}
        <footer className="bl-form-actions">
          <button type="button" className="bl-quiet" onClick={onClose}>Cancel</button>
          <button type="submit" className="bl-button mint" disabled={isSubmitting}>
            Send invite
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

export function MembersPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle('Members');
  const { role: myRole } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [removeCandidate, setRemoveCandidate] = useState<MemberOut | null>(null);

  const { data: members, isLoading, error: membersError } = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => workspacesApi.listMembers(workspace.id),
  });

  const { data: projects } = useQuery({
    queryKey: qk.projects(workspace.id),
    queryFn: () => projectsApi.listProjects(workspace.id),
  });

  const invalidateMembers = () =>
    queryClient.invalidateQueries({ queryKey: qk.members(workspace.id) });

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: "admin" | "member" }) =>
      workspacesApi.inviteMember(workspace.id, email, role),
    onSuccess: invalidateMembers,
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: "admin" | "member" }) =>
      workspacesApi.updateMemberRole(workspace.id, memberId, role),
    onSuccess: invalidateMembers,
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => workspacesApi.removeMember(workspace.id, memberId),
    onSuccess: () => {
      invalidateMembers();
      setRemoveCandidate(null);
    },
  });

  const canManage = canManageMembers(myRole);
  const visibleMembers = (members ?? []).filter(
    (m) =>
      m.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      m.email.toLowerCase().includes(search.trim().toLowerCase()),
  );
  // Membership is workspace-wide, not per-project (there's no per-project ACL in this
  // app) - every member can see every project in the workspace, so this column is the
  // same real count for each row rather than a fabricated per-member breakdown.
  const projectCount = projects?.length ?? 0;

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <h1>Team Members</h1>
          <p>Manage who has access to this workspace.</p>
        </div>
        {canManage && (
          <div className="bl-head-actions">
            <button className="bl-button mint" onClick={() => setShowAddMember(true)}>+ Add Member</button>
          </div>
        )}
      </header>

      <div className="bl-toolbar wrap">
        <div className="bl-search" style={{ maxWidth: "340px" }}>
          <span className="bl-search-icon" aria-hidden="true"><SearchIcon /></span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email..."
            aria-label="Search members"
          />
        </div>
      </div>

      {isLoading && <LoadingScreen />}
      {membersError && (
        <p role="alert" className="bl-error">
          {membersError instanceof Error ? membersError.message : "Could not load members."}
        </p>
      )}

      {members && visibleMembers.length === 0 && (
        <div className="bl-empty">
          <h2>{search ? "No members match" : "No members yet"}</h2>
          <p>{search ? "Try another name or email." : "Invite a teammate to get started."}</p>
        </div>
      )}

      {members && visibleMembers.length > 0 && (
        <div className="bl-table-wrap">
          <table className="bl-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Projects</th>
                {canManage && <th aria-label="Actions"></th>}
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="bl-text-button">
                      <Avatar name={member.name} avatarUrl={member.avatar_url} size={29} />
                      <div>
                        <strong>{member.name}</strong>
                        <small>{member.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {canManage && member.role !== "owner" ? (
                      <select
                        className="bl-select"
                        value={member.role}
                        onChange={(event) =>
                          roleMutation.mutate({
                            memberId: member.id,
                            role: event.target.value as "admin" | "member",
                          })
                        }
                        aria-label={`Change role for ${member.name}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      <span style={{ textTransform: "capitalize", fontSize: "12px", padding: "0 6px" }}>{member.role}</span>
                    )}
                  </td>
                  <td>
                    <small>
                      {projectCount} Project{projectCount === 1 ? "" : "s"}
                    </small>
                  </td>
                  {canManage && (
                    <td style={{ textAlign: "right" }}>
                      {member.role !== "owner" && (
                        <button
                          className="bl-quiet"
                          style={{ color: "var(--bl-error)", borderColor: "transparent" }}
                          onClick={() => setRemoveCandidate(member)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: "12px 14px", fontSize: "10px", color: "var(--bl-muted)", borderTop: "1px solid var(--bl-line)" }}>
            {visibleMembers.length} users
          </div>
        </div>
      )}

      {showAddMember && (
        <AddMemberModal
          onInvite={async (email, role) => {
            await inviteMutation.mutateAsync({ email, role });
          }}
          onClose={() => setShowAddMember(false)}
        />
      )}

      {removeCandidate && (
        <ConfirmDialog
          title="Remove member?"
          message={<>Remove <strong>{removeCandidate.name}</strong> from this workspace? They'll lose access to every project here.</>}
          confirmLabel={removeMutation.isPending ? "Removing…" : "Remove member"}
          destructive
          pending={removeMutation.isPending}
          onCancel={() => setRemoveCandidate(null)}
          onConfirm={() => removeMutation.mutate(removeCandidate.id)}
        />
      )}
    </main>
  );
}
