import { Avatar } from "@backline/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";

import { Dialog } from "../../../components/Dialog";
import { useToast } from "../../../components/Toast";
import { qk } from "../../../lib/query-keys";
import * as workspacesApi from "../api";
import type { MemberOut, MemberProfileUpdate, WorkspaceMemberRole, WorkspaceOut } from "../api";
import { WORKSPACE_ROLE_LABEL, buildOrgTree, canManageTeam, descendantsOf, teamsOf } from "./team-utils";

/**
 * Someone's place on the org chart. Members edit their own title and team; owners and
 * admins edit anyone's, and are the only ones who set reporting lines and roles (the
 * API enforces the same split).
 */
export function ProfileDialog({
  workspace,
  member,
  members,
  myRole,
  myUserId,
  onClose,
}: {
  workspace: WorkspaceOut;
  member: MemberOut;
  members: MemberOut[];
  myRole: string | null;
  myUserId: string | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isAdmin = canManageTeam(myRole);
  const isSelf = member.user_id === myUserId;
  const [title, setTitle] = useState(member.title ?? "");
  const [team, setTeam] = useState(member.team ?? "");
  const [managerId, setManagerId] = useState(member.manager_user_id ?? "");
  const [role, setRole] = useState(member.role);

  const tree = useMemo(() => buildOrgTree(members), [members]);
  const blocked = useMemo(() => new Set([member.user_id, ...descendantsOf(tree, member.user_id)]), [tree, member.user_id]);
  const managerOptions = members
    .filter((m) => !blocked.has(m.user_id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const teams = teamsOf(members);
  const owner = members.find((m) => m.role === "owner");
  const canEditRole = isAdmin && member.role !== "owner" && !isSelf;

  const save = useMutation({
    mutationFn: async () => {
      const changes: MemberProfileUpdate = {};
      if (title.trim() !== (member.title ?? "")) changes.title = title.trim() || null;
      if (team.trim() !== (member.team ?? "")) changes.team = team.trim() || null;
      if (isAdmin && managerId !== (member.manager_user_id ?? "")) changes.manager_user_id = managerId || null;
      if (Object.keys(changes).length) await workspacesApi.updateMemberProfile(workspace.id, member.id, changes);
      if (canEditRole && role !== member.role) {
        await workspacesApi.updateMemberRole(workspace.id, member.id, role as WorkspaceMemberRole);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.members(workspace.id) });
      void queryClient.invalidateQueries({ queryKey: qk.accessMatrix(workspace.id) });
      toast(isSelf ? "Your profile is updated." : `${member.name}'s profile is updated.`, "success");
      onClose();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!save.isPending) save.mutate();
  }

  return (
    <Dialog title={isSelf ? "Your profile" : `Edit ${member.name}`} onClose={onClose}>
      <form className="bl-form" onSubmit={submit}>
        <div className="team-profile-head">
          <Avatar name={member.name} avatarUrl={member.avatar_url} size={44} />
          <div>
            <strong>{member.name}</strong>
            <small>{member.email}</small>
          </div>
          <span className={`team-role-badge role-${member.role}`}>{WORKSPACE_ROLE_LABEL[member.role] ?? member.role}</span>
        </div>
        <div className="team-form-grid">
          <label>
            Title
            <input className="bl-input" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="Product designer" />
          </label>
          <label>
            Team
            <input
              className="bl-input"
              value={team}
              maxLength={60}
              list="team-names"
              onChange={(event) => setTeam(event.target.value)}
              placeholder="Design"
            />
            <datalist id="team-names">
              {teams.map((name) => <option key={name} value={name} />)}
            </datalist>
          </label>
        </div>
        {isAdmin ? (
          <label>
            Reports to
            <select className="bl-select team-wide-select" value={managerId} onChange={(event) => setManagerId(event.target.value)}>
              <option value="">No one{owner && owner.user_id !== member.user_id ? ` (shown under ${owner.name})` : ""}</option>
              {managerOptions.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                  {m.title ? ` - ${m.title}` : ""}
                </option>
              ))}
            </select>
            <small>People who report to {isSelf ? "you" : member.name.split(" ")[0]} aren't listed - that would make a loop.</small>
          </label>
        ) : (
          <p className="team-note">Owners and admins set who reports to whom.</p>
        )}
        {canEditRole && (
          <label>
            Workspace role
            <select className="bl-select team-wide-select" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="member">Member - works on the projects they're given</option>
              <option value="admin">Admin - manages every project, people and integrations</option>
            </select>
          </label>
        )}
        {save.error && <p className="bl-error" role="alert">{save.error.message}</p>}
        <footer className="bl-form-actions">
          <button type="button" className="bl-quiet" onClick={onClose}>Cancel</button>
          <button type="submit" className="bl-button mint" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}
