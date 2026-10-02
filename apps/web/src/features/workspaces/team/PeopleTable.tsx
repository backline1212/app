import { Avatar } from "@backline/ui";
import { useMemo } from "react";

import { EmptyArt } from "../../../components/illustrations";
import { SearchIcon } from "../../../components/icons";
import { downloadCsv } from "../../../lib/csv";
import { formatDate } from "../../../lib/date-format";
import type { AccessMatrixOut, MemberOut, WorkspaceMemberRole } from "../api";
import { WORKSPACE_ROLE_LABEL, buildOrgTree, byRoleThenName, canManageTeam, projectCounts, teamsOf } from "./team-utils";

export interface PeopleFilters {
  q: string;
  role: string;
  team: string;
}

/** Everyone in the workspace as a sortable, filterable list. Row click opens the
 * person's profile; owners and admins change roles inline. */
export function PeopleTable({
  members,
  matrix,
  myRole,
  myUserId,
  filters,
  onFilters,
  onOpen,
  onRoleChange,
  roleChangePending,
  workspaceName,
}: {
  members: MemberOut[];
  matrix: AccessMatrixOut | undefined;
  myRole: string | null;
  myUserId: string | undefined;
  filters: PeopleFilters;
  onFilters: (next: Partial<PeopleFilters>) => void;
  onOpen: (member: MemberOut) => void;
  onRoleChange: (member: MemberOut, role: WorkspaceMemberRole) => void;
  roleChangePending: boolean;
  workspaceName: string;
}) {
  const isAdmin = canManageTeam(myRole);
  const tree = useMemo(() => buildOrgTree(members), [members]);
  const counts = useMemo(() => projectCounts(matrix), [matrix]);
  const teams = useMemo(() => teamsOf(members), [members]);
  const q = filters.q.trim().toLowerCase();
  const visible = members
    .filter((m) => !q || [m.name, m.email, m.title ?? "", m.team ?? ""].some((v) => v.toLowerCase().includes(q)))
    .filter((m) => !filters.role || m.role === filters.role)
    .filter((m) => !filters.team || m.team === filters.team)
    .sort(byRoleThenName);

  function exportCsv() {
    downloadCsv(
      [
        ["Name", "Email", "Role", "Title", "Team", "Reports to", "Projects", "Joined"],
        ...[...members].sort(byRoleThenName).map((m) => {
          const person = tree.byUser.get(m.user_id);
          const manager = person && !person.inferred && person.parentId ? tree.byUser.get(person.parentId)?.member.name : "";
          return [
            m.name,
            m.email,
            WORKSPACE_ROLE_LABEL[m.role] ?? m.role,
            m.title ?? "",
            m.team ?? "",
            manager ?? "",
            counts.get(m.user_id) ?? 0,
            m.created_at.slice(0, 10),
          ];
        }),
      ],
      `${workspaceName.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase()}-team.csv`,
    );
  }

  return (
    <>
      <div className="bl-toolbar wrap team-toolbar">
        <div className="bl-search team-search">
          <span className="bl-search-icon" aria-hidden="true"><SearchIcon /></span>
          <input
            value={filters.q}
            onChange={(event) => onFilters({ q: event.target.value })}
            placeholder="Search name, email, title or team"
            aria-label="Search people"
          />
        </div>
        <select className="bl-select" value={filters.role} onChange={(event) => onFilters({ role: event.target.value })} aria-label="Filter by role">
          <option value="">All roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Admins</option>
          <option value="member">Members</option>
        </select>
        {teams.length > 0 && (
          <select className="bl-select" value={filters.team} onChange={(event) => onFilters({ team: event.target.value })} aria-label="Filter by team">
            <option value="">All teams</option>
            {teams.map((team) => <option key={team} value={team}>{team}</option>)}
          </select>
        )}
        <div className="bl-tool-right">
          <button type="button" className="bl-quiet" onClick={exportCsv}>Export CSV</button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bl-empty">
          <EmptyArt kind="search" />
          <h2>No one matches</h2>
          <p>Try another name, or clear the filters.</p>
        </div>
      ) : (
        <div className="bl-table-wrap">
          <table className="bl-table team-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Title &amp; team</th>
                <th>Reports to</th>
                <th>Role</th>
                <th className="team-num">Projects</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((member) => {
                const person = tree.byUser.get(member.user_id);
                const manager = person?.parentId ? tree.byUser.get(person.parentId)?.member : undefined;
                const canChangeRole = isAdmin && member.role !== "owner" && member.user_id !== myUserId;
                return (
                  <tr key={member.id} className="team-row" onClick={() => onOpen(member)}>
                    <td>
                      <button type="button" className="bl-text-button team-person" onClick={(event) => { event.stopPropagation(); onOpen(member); }}>
                        <Avatar name={member.name} avatarUrl={member.avatar_url} size={32} />
                        <span>
                          <strong>
                            {member.name}
                            {member.user_id === myUserId && <em className="team-chip is-you">You</em>}
                            {member.invite_pending && <em className="team-chip is-pending">Invited</em>}
                          </strong>
                          <small>{member.email}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={member.title ? "team-cell-strong" : "team-cell-muted"}>{member.title || "No title"}</span>
                      {member.team && <small>{member.team}</small>}
                    </td>
                    <td>
                      {manager ? (
                        <span className={person?.inferred ? "team-cell-muted" : undefined} title={person?.inferred ? "No manager set" : undefined}>
                          {person?.inferred ? "—" : manager.name}
                        </span>
                      ) : (
                        <span className="team-cell-muted">—</span>
                      )}
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      {canChangeRole ? (
                        <select
                          className="bl-select team-role-select"
                          value={member.role}
                          disabled={roleChangePending}
                          onChange={(event) => onRoleChange(member, event.target.value as WorkspaceMemberRole)}
                          aria-label={`Change role for ${member.name}`}
                        >
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      ) : (
                        <span className={`team-role-badge role-${member.role}`}>{WORKSPACE_ROLE_LABEL[member.role] ?? member.role}</span>
                      )}
                    </td>
                    <td className="team-num">{matrix ? counts.get(member.user_id) ?? 0 : "…"}</td>
                    <td><span className="bl-mono">{formatDate(member.created_at)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="team-table-foot">
            {visible.length} of {members.length} {members.length === 1 ? "person" : "people"}
          </div>
        </div>
      )}
    </>
  );
}
