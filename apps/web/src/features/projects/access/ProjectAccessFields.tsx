import { Avatar } from "@backline/ui";

import { PROJECT_ROLES, PROJECT_ROLE_META, type ProjectRole, type ProjectVisibility, roleLabel } from "../../../lib/project-roles";
import type { MemberOut } from "../../workspaces/api";

const ROLES_DESC = PROJECT_ROLES.slice().reverse();

/**
 * The "Who can open it" step of creating a project (TDR-0056). The creator always
 * manages the new project and owners/admins manage every project, so only members are
 * listed for a role. Picking nothing for someone means the default (or no access when
 * the project is private).
 */
export function ProjectAccessFields({
  workspaceName,
  members,
  membersLoading,
  membersError,
  onRetry,
  myUserId,
  visibility,
  onVisibility,
  defaultRole,
  onDefaultRole,
  grants,
  onGrants,
  query,
  onQuery,
  disabled,
}: {
  workspaceName: string;
  members: MemberOut[] | undefined;
  membersLoading: boolean;
  membersError: boolean;
  onRetry: () => void;
  myUserId: string | undefined;
  visibility: ProjectVisibility;
  onVisibility: (value: ProjectVisibility) => void;
  defaultRole: ProjectRole;
  onDefaultRole: (role: ProjectRole) => void;
  grants: Record<string, ProjectRole>;
  onGrants: (next: Record<string, ProjectRole>) => void;
  query: string;
  onQuery: (value: string) => void;
  disabled: boolean;
}) {
  const others = (members ?? []).filter((m) => m.user_id !== myUserId);
  const assignable = others.filter((m) => m.role === "member");
  const managers = others.filter((m) => m.role !== "member");
  const q = query.trim().toLowerCase();
  const shown = assignable.filter((m) => !q || `${m.name} ${m.email} ${m.title ?? ""}`.toLowerCase().includes(q));
  const granted = Object.keys(grants).length;

  function grant(userId: string, role: ProjectRole | "") {
    const next = { ...grants };
    if (role) next[userId] = role;
    else delete next[userId];
    onGrants(next);
  }

  const summary =
    visibility === "private"
      ? `Only you${granted ? `, ${granted} ${granted === 1 ? "person" : "people"} you added` : ""} and the workspace's owners and admins can open it.`
      : `Everyone at ${workspaceName} can open it as ${roleLabel(defaultRole).toLowerCase()}${granted ? `; ${granted} ${granted === 1 ? "person has" : "people have"} a different role` : ""}.`;

  return (
    <fieldset className="pf-access" disabled={disabled}>
      <legend>Who can open it</legend>
      <div className="pa-visibility" role="radiogroup" aria-label="Who can open this project">
        <button type="button" role="radio" aria-checked={visibility === "workspace"} onClick={() => onVisibility("workspace")}>
          <strong>Everyone at {workspaceName}</strong>
          <small>Members open it with the default role.</small>
        </button>
        <button type="button" role="radio" aria-checked={visibility === "private"} onClick={() => onVisibility("private")}>
          <strong>Only people I add</strong>
          <small>A private project the rest of the team won't see.</small>
        </button>
      </div>
      {visibility === "workspace" && (
        <label className="pa-default">
          <span>Everyone gets</span>
          <select className="bl-select" value={defaultRole} onChange={(event) => onDefaultRole(event.target.value as ProjectRole)} aria-label="Default role">
            {ROLES_DESC.map((role) => <option key={role} value={role}>{PROJECT_ROLE_META[role].label}</option>)}
          </select>
          <small>{PROJECT_ROLE_META[defaultRole].summary}</small>
        </label>
      )}

      {membersLoading ? (
        <div className="bl-input bl-input-loading" role="status">Loading people…</div>
      ) : membersError ? (
        <div className="bl-inline-error" role="alert">
          <span>People could not load.</span>
          <button type="button" onClick={onRetry}>Try again</button>
        </div>
      ) : assignable.length > 0 ? (
        <div className="pf-people">
          <div className="pf-people-head">
            <span>{visibility === "private" ? "Add people" : "Give someone a different role"}</span>
            {assignable.length > 6 && (
              <input className="bl-input" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Find someone" aria-label="Find a person" />
            )}
          </div>
          <ul>
            {shown.map((member) => (
              <li key={member.user_id} className={grants[member.user_id] ? "is-granted" : undefined}>
                <Avatar name={member.name} avatarUrl={member.avatar_url} size={26} />
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.title || member.email}</small>
                </span>
                <select
                  className="bl-select"
                  value={grants[member.user_id] ?? ""}
                  onChange={(event) => grant(member.user_id, event.target.value as ProjectRole | "")}
                  aria-label={`${member.name}'s role on this project`}
                >
                  <option value="">{visibility === "private" ? "No access" : `${roleLabel(defaultRole)} (default)`}</option>
                  {ROLES_DESC.map((role) => <option key={role} value={role}>{PROJECT_ROLE_META[role].label}</option>)}
                </select>
              </li>
            ))}
            {shown.length === 0 && <li className="pf-people-empty">No one matches “{query.trim()}”.</li>}
          </ul>
        </div>
      ) : null}
      <small className="pf-access-note">
        {summary}
        {managers.length > 0 &&
          ` ${managers.length === 1 ? "1 owner or admin manages" : `${managers.length} owners and admins manage`} every project.`}
      </small>
    </fieldset>
  );
}
