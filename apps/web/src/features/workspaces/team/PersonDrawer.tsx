import { Avatar } from "@backline/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { LockIcon } from "../../../components/icons";
import { formatDate } from "../../../lib/date-format";
import { ROLE_SOURCE_LABEL, roleLabel } from "../../../lib/project-roles";
import type { AccessMatrixOut, MemberOut, WorkspaceOut } from "../api";
import { WORKSPACE_ROLE_LABEL, buildOrgTree, canManageTeam } from "./team-utils";

const JOINED_VIA: Record<string, string> = {
  created: "Created the workspace",
  invite: "Joined by email invite",
  room_code: "Joined with the room code",
  join_request: "Joined with the room code (approved)",
};

export interface PersonActions {
  onEdit: (member: MemberOut) => void;
  onRemove: (member: MemberOut) => void;
  onTransfer: (member: MemberOut) => void;
  onLeave: () => void;
}

/** One person, in a panel that slides over the page: who they are, where they sit in
 * the org, and every project they can open with their role on it. */
export function PersonDrawer({
  workspace,
  member,
  members,
  matrix,
  myRole,
  myUserId,
  onClose,
  onSelect,
  actions,
}: {
  workspace: WorkspaceOut;
  member: MemberOut;
  members: MemberOut[];
  matrix: AccessMatrixOut | undefined;
  myRole: string | null;
  myUserId: string | undefined;
  onClose: () => void;
  onSelect: (userId: string) => void;
  actions: PersonActions;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const tree = useMemo(() => buildOrgTree(members), [members]);
  const node = tree.byUser.get(member.user_id);
  const manager = node?.parentId ? tree.byUser.get(node.parentId)?.member : undefined;
  const reports = node?.children.map((child) => child.member) ?? [];
  const isSelf = member.user_id === myUserId;
  const isAdmin = canManageTeam(myRole);
  const projects = (matrix?.projects ?? [])
    .filter((project) => project.roles[member.user_id] && !project.archived)
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    panelRef.current?.focus();
  }, [member.user_id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(member.email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the address is selectable as plain text */
    }
  }

  return (
    <aside ref={panelRef} className="team-drawer" aria-label={`${member.name}'s profile`} tabIndex={-1}>
      <header className="team-drawer-head">
        <button type="button" className="bl-icon" aria-label="Close profile" onClick={onClose}>×</button>
      </header>
      <div className="team-drawer-hero">
        <span className={`team-drawer-avatar role-${member.role}`}>
          <Avatar name={member.name} avatarUrl={member.avatar_url} size={64} />
        </span>
        <h2>{member.name}</h2>
        <p>{member.title || <span className="is-placeholder">No title yet</span>}</p>
        <div className="team-drawer-badges">
          <span className={`team-role-badge role-${member.role}`}>{WORKSPACE_ROLE_LABEL[member.role] ?? member.role}</span>
          {member.team && <span className="team-chip">{member.team}</span>}
          {isSelf && <span className="team-chip is-you">You</span>}
          {member.invite_pending && <span className="team-chip is-pending">Invite pending</span>}
        </div>
      </div>

      <div className="team-drawer-body">
        <section>
          <h3>Contact</h3>
          <div className="team-drawer-row">
            <span className="bl-mono team-drawer-email">{member.email}</span>
            <button type="button" className="bl-text-link" onClick={() => void copyEmail()}>{copied ? "Copied" : "Copy"}</button>
          </div>
        </section>

        <section>
          <h3>Reports to</h3>
          {manager ? (
            <button type="button" className="team-person-link" onClick={() => onSelect(manager.user_id)}>
              <Avatar name={manager.name} avatarUrl={manager.avatar_url} size={26} />
              <span>
                <strong>{manager.name}</strong>
                <small>{node?.inferred ? "No manager set - shown under the owner" : manager.title || WORKSPACE_ROLE_LABEL[manager.role]}</small>
              </span>
            </button>
          ) : (
            <p className="team-drawer-empty">{member.role === "owner" ? "Heads the workspace." : "No manager set."}</p>
          )}
        </section>

        <section>
          <h3>
            Direct reports <span className="bl-count">{reports.length}</span>
          </h3>
          {reports.length === 0 ? (
            <p className="team-drawer-empty">No one reports to {isSelf ? "you" : member.name.split(" ")[0]}.</p>
          ) : (
            <div className="team-drawer-list">
              {reports.map((report) => (
                <button key={report.user_id} type="button" className="team-person-link" onClick={() => onSelect(report.user_id)}>
                  <Avatar name={report.name} avatarUrl={report.avatar_url} size={26} />
                  <span>
                    <strong>{report.name}</strong>
                    <small>{report.title || WORKSPACE_ROLE_LABEL[report.role]}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3>
            Projects <span className="bl-count">{projects.length}</span>
          </h3>
          {matrix === undefined ? (
            <p className="team-drawer-empty">Loading projects…</p>
          ) : projects.length === 0 ? (
            <p className="team-drawer-empty">Not on any project you can see.</p>
          ) : (
            <ul className="team-drawer-projects">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link to={`/w/${workspace.slug}/p/${project.id}`} className="team-drawer-project">
                    <span>
                      <strong>
                        {project.visibility === "private" && <LockIcon className="team-lock" aria-label="Private" role="img" />}
                        {project.name}
                      </strong>
                      <small>{ROLE_SOURCE_LABEL[project.sources[member.user_id]] ?? ""}</small>
                    </span>
                    <span className={`team-project-role lens-${project.roles[member.user_id]}`}>{roleLabel(project.roles[member.user_id])}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>In this workspace</h3>
          <p className="team-drawer-meta">
            {JOINED_VIA[member.joined_via ?? ""] ?? "Member"} · {formatDate(member.created_at)}
          </p>
        </section>
      </div>

      <footer className="team-drawer-actions">
        {(isSelf || isAdmin) && (
          <button type="button" className="bl-button" onClick={() => actions.onEdit(member)}>
            {isSelf ? "Edit your profile" : "Edit profile"}
          </button>
        )}
        {myRole === "owner" && !isSelf && !member.invite_pending && (
          <button type="button" className="bl-quiet" onClick={() => actions.onTransfer(member)}>Make owner</button>
        )}
        {isAdmin && !isSelf && member.role !== "owner" && (
          <button type="button" className="bl-quiet danger" onClick={() => actions.onRemove(member)}>Remove</button>
        )}
        {isSelf && member.role !== "owner" && (
          <button type="button" className="bl-quiet danger" onClick={actions.onLeave}>Leave workspace</button>
        )}
      </footer>
    </aside>
  );
}
