import { Avatar } from "@backline/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { planLimitUpgrade, type PaidPlanId } from "../billing/api";
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
import { EmptyArt } from "../../components/illustrations";
import { SearchIcon } from "../../components/icons";
import type { MemberOut } from "./api";

interface AddMemberModalProps {
  workspaceSlug: string;
  onInvite: (email: string, role: "admin" | "member") => Promise<void>;
  onClose: () => void;
}

function AddMemberModal({ workspaceSlug, onInvite, onClose }: AddMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);
  const [upgradePlan, setUpgradePlan] = useState<PaidPlanId | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setUpgradePlan(null);
    setIsSubmitting(true);
    try {
      await onInvite(email, role);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite.");
      setUpgradePlan(planLimitUpgrade(err));
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
        {error && (
          <div className="bl-error">
            {error}
            {upgradePlan && <> <Link to={`/w/${workspaceSlug}/billing?upgrade=${upgradePlan}`} onClick={onClose}>See plans</Link></>}
          </div>
        )}
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
  useDocumentTitle([workspace.name, 'Members']);
  const { role: myRole } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [removeCandidate, setRemoveCandidate] = useState<MemberOut | null>(null);
  const [activeTab, setActiveTab] = useState<"members" | "requests" | "org-chart">("members");

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

  const { data: joinRequests, refetch: refetchRequests } = useQuery({
    queryKey: ["join-requests", workspace.id],
    queryFn: () => workspacesApi.listJoinRequests(workspace.id),
    enabled: canManageMembers(myRole) && activeTab === "requests",
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => workspacesApi.approveJoinRequest(workspace.id, requestId),
    onSuccess: () => { refetchRequests(); invalidateMembers(); },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) => workspacesApi.rejectJoinRequest(workspace.id, requestId),
    onSuccess: () => { refetchRequests(); },
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

      <div className="bl-tabs" style={{ display: "flex", gap: "20px", borderBottom: "1px solid var(--bl-line)", marginBottom: "20px", padding: "0 24px" }}>
        <button className={`bl-tab ${activeTab === "members" ? "active" : ""}`} onClick={() => setActiveTab("members")} style={{ background: "none", border: "none", padding: "10px 0", borderBottom: activeTab === "members" ? "2px solid var(--bl-brand)" : "2px solid transparent", cursor: "pointer", fontWeight: activeTab === "members" ? 600 : 400 }}>List View</button>
        <button className={`bl-tab ${activeTab === "org-chart" ? "active" : ""}`} onClick={() => setActiveTab("org-chart")} style={{ background: "none", border: "none", padding: "10px 0", borderBottom: activeTab === "org-chart" ? "2px solid var(--bl-brand)" : "2px solid transparent", cursor: "pointer", fontWeight: activeTab === "org-chart" ? 600 : 400 }}>Org Chart</button>
        {canManage && (
          <button className={`bl-tab ${activeTab === "requests" ? "active" : ""}`} onClick={() => setActiveTab("requests")} style={{ background: "none", border: "none", padding: "10px 0", borderBottom: activeTab === "requests" ? "2px solid var(--bl-brand)" : "2px solid transparent", cursor: "pointer", fontWeight: activeTab === "requests" ? 600 : 400 }}>Pending Requests</button>
        )}
      </div>

      {activeTab === "members" && (
        <>
          <div className="bl-toolbar wrap" style={{ padding: "0 24px" }}>
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

          {isLoading && <LoadingScreen inline />}
          {roleMutation.error && (
            <p role="alert" className="bl-error">Couldn't change that role: {roleMutation.error.message}</p>
          )}
          {membersError && (
            <p role="alert" className="bl-error">
              {membersError instanceof Error ? membersError.message : "Could not load members."}
            </p>
          )}

          {members && visibleMembers.length === 0 && (
            <div className="bl-empty">
              <EmptyArt kind={search ? "search" : "people"} />
              <h2>{search ? "No members match" : "No members yet"}</h2>
              <p>{search ? "Try another name or email." : "Invite a teammate to get started."}</p>
            </div>
          )}

          {members && visibleMembers.length > 0 && (
            <div className="bl-table-wrap" style={{ margin: "0 24px" }}>
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
                            disabled={roleMutation.isPending}
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
        </>
      )}

      {activeTab === "requests" && canManage && (
        <div style={{ padding: "0 24px" }}>
          {!joinRequests ? <LoadingScreen inline /> : joinRequests.length === 0 ? (
            <div className="bl-empty">
              <h2>No pending requests</h2>
              <p>When users enter your room code, their requests will appear here.</p>
            </div>
          ) : (
            <div className="bl-table-wrap">
              <table className="bl-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Requested At</th>
                    <th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {joinRequests.map(req => (
                    <tr key={req.id}>
                      <td>
                        <div className="bl-text-button">
                          <div>
                            <strong>{req.user_name}</strong>
                            <small>{req.user_email}</small>
                          </div>
                        </div>
                      </td>
                      <td>{new Date(req.created_at).toLocaleDateString()}</td>
                      <td style={{ textAlign: "right", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button className="bl-quiet" onClick={() => rejectMutation.mutate(req.id)} disabled={rejectMutation.isPending || approveMutation.isPending}>Reject</button>
                        <button className="bl-button mint" onClick={() => approveMutation.mutate(req.id)} disabled={approveMutation.isPending || rejectMutation.isPending}>Approve</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "org-chart" && members && (
        <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "40px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <h3 style={{ fontSize: "14px", color: "var(--bl-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Owner</h3>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", justifyContent: "center" }}>
              {members.filter(m => m.role === "owner").map(m => (
                <div key={m.id} className="bl-attention" style={{ padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "160px", textAlign: "center" }}>
                  <Avatar name={m.name} avatarUrl={m.avatar_url} size={48} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--bl-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div style={{ width: "2px", height: "40px", backgroundColor: "var(--bl-line)" }} />
          
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <h3 style={{ fontSize: "14px", color: "var(--bl-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Admins</h3>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", justifyContent: "center" }}>
              {members.filter(m => m.role === "admin").map(m => (
                <div key={m.id} className="bl-attention" style={{ padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "160px", textAlign: "center" }}>
                  <Avatar name={m.name} avatarUrl={m.avatar_url} size={48} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--bl-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
                  </div>
                </div>
              ))}
              {members.filter(m => m.role === "admin").length === 0 && (
                <div style={{ padding: "16px", color: "var(--bl-muted)", fontSize: "12px", border: "1px dashed var(--bl-line)", borderRadius: "8px", width: "160px", textAlign: "center" }}>No Admins</div>
              )}
            </div>
          </div>
          
          <div style={{ width: "2px", height: "40px", backgroundColor: "var(--bl-line)" }} />
          
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
            <h3 style={{ fontSize: "14px", color: "var(--bl-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>Members</h3>
            <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", justifyContent: "center", maxWidth: "800px" }}>
              {members.filter(m => m.role === "member").map(m => (
                <div key={m.id} className="bl-attention" style={{ padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "160px", textAlign: "center" }}>
                  <Avatar name={m.name} avatarUrl={m.avatar_url} size={48} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                    <div style={{ fontSize: "11px", color: "var(--bl-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{m.email}</div>
                  </div>
                </div>
              ))}
              {members.filter(m => m.role === "member").length === 0 && (
                <div style={{ padding: "16px", color: "var(--bl-muted)", fontSize: "12px", border: "1px dashed var(--bl-line)", borderRadius: "8px", width: "160px", textAlign: "center" }}>No Members</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddMember && (
        <AddMemberModal
          workspaceSlug={workspace.slug}
          onInvite={async (email, role) => {
            await inviteMutation.mutateAsync({ email, role });
          }}
          onClose={() => setShowAddMember(false)}
        />
      )}

      {removeCandidate && (
        <ConfirmDialog
          title="Remove member?"
          message={<>
            <p>Remove <strong>{removeCandidate.name}</strong> from this workspace? They'll lose access to every project here.</p>
            {removeMutation.error && <p role="alert" className="bl-error">{removeMutation.error.message}</p>}
          </>}
          confirmLabel={removeMutation.isPending ? "Removing…" : "Remove member"}
          destructive
          pending={removeMutation.isPending}
          onCancel={() => { removeMutation.reset(); setRemoveCandidate(null); }}
          onConfirm={() => removeMutation.mutate(removeCandidate.id)}
        />
      )}
    </main>
  );
}
