import { Avatar } from "@backline/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { useToast } from "../../../components/Toast";
import {
  PROJECT_ROLES,
  PROJECT_ROLE_META,
  ROLE_SOURCE_LABEL,
  type ProjectRole,
  type ProjectVisibility,
  roleLabel,
} from "../../../lib/project-roles";
import { qk } from "../../../lib/query-keys";
import * as projectsApi from "../api";
import type { ProjectAccessDetailOut, ProjectPersonOut } from "../api";

const ROLES_DESC = PROJECT_ROLES.slice().reverse();

/**
 * Who can open one project and what they can do there (TDR-0056) - the "General
 * access" choice plus everyone with a role. Managers change it; everyone else who can
 * open the project sees it read-only, so nobody has to guess who'll see a comment.
 */
export function ProjectAccessPanel({
  projectId,
  workspaceId,
  workspaceName,
}: {
  projectId: string;
  workspaceId: string;
  workspaceName: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<ProjectRole>("editor");
  const access = useQuery({ queryKey: qk.projectAccess(projectId), queryFn: () => projectsApi.getProjectAccess(projectId) });

  const settle = (detail?: ProjectAccessDetailOut) => {
    if (detail) queryClient.setQueryData(qk.projectAccess(projectId), detail);
    else void queryClient.invalidateQueries({ queryKey: qk.projectAccess(projectId) });
    void queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
    void queryClient.invalidateQueries({ queryKey: qk.projects(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.accessMatrix(workspaceId) });
  };
  const onError = (error: Error) => toast(error.message, "error");

  const general = useMutation({
    mutationFn: (changes: { visibility?: ProjectVisibility; default_role?: ProjectRole }) =>
      projectsApi.updateProjectAccess(projectId, changes),
    onSuccess: (detail) => settle(detail),
    onError,
  });
  const setRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) =>
      projectsApi.setProjectMemberRole(projectId, userId, role),
    onSuccess: (detail) => {
      setAddUserId("");
      settle(detail);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => projectsApi.removeProjectMember(projectId, userId),
    onSuccess: () => settle(),
    onError,
  });

  if (access.isLoading) {
    return (
      <div className="bl-member-skeleton" role="status" aria-label="Loading who has access">
        <i />
        <i />
      </div>
    );
  }
  if (access.isError || !access.data) {
    return (
      <div className="bl-inline-error" role="alert">
        <span>Access could not load.</span>
        <button type="button" onClick={() => access.refetch()}>Try again</button>
      </div>
    );
  }

  const detail = access.data;
  const canManage = detail.my_role === "manager";
  const busy = general.isPending || setRole.isPending || remove.isPending;
  const withAccess = detail.people.filter((p) => p.project_role);
  const addable = detail.people.filter((p) => p.workspace_role === "member" && p.source !== "explicit");

  function add(event: FormEvent) {
    event.preventDefault();
    if (addUserId && !busy) setRole.mutate({ userId: addUserId, role: addRole });
  }

  return (
    <div className="pa-panel">
      <section className="pa-general">
        <div className="bl-section-heading">
          <div>
            <h3>General access</h3>
            <p>{detail.visibility === "private" ? "Private project" : `Open to ${workspaceName}`}</p>
          </div>
          {!canManage && <span className="bl-scope-badge">Your role: {roleLabel(detail.my_role)}</span>}
        </div>
        <div className="pa-visibility" role="radiogroup" aria-label="Who can open this project">
          <button
            type="button"
            role="radio"
            aria-checked={detail.visibility === "workspace"}
            disabled={!canManage || busy}
            onClick={() => detail.visibility !== "workspace" && general.mutate({ visibility: "workspace" })}
          >
            <strong>Everyone at {workspaceName}</strong>
            <small>Every member can open it with the default role.</small>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={detail.visibility === "private"}
            disabled={!canManage || busy}
            onClick={() => detail.visibility !== "private" && general.mutate({ visibility: "private" })}
          >
            <strong>Only people added</strong>
            <small>Plus owners and admins, who manage every project.</small>
          </button>
        </div>
        {detail.visibility === "workspace" && (
          <label className="pa-default">
            <span>Everyone else gets</span>
            <select
              className="bl-select"
              value={detail.default_role}
              disabled={!canManage || busy}
              onChange={(event) => general.mutate({ default_role: event.target.value as ProjectRole })}
              aria-label="Default role for workspace members"
            >
              {ROLES_DESC.map((role) => (
                <option key={role} value={role}>{PROJECT_ROLE_META[role].label}</option>
              ))}
            </select>
            <small>{PROJECT_ROLE_META[detail.default_role as ProjectRole]?.summary}</small>
          </label>
        )}
      </section>

      <section className="pa-people">
        <div className="bl-section-heading">
          <div>
            <h3>People with access</h3>
            <p>{withAccess.length} of {detail.people.length} in the workspace</p>
          </div>
        </div>
        {canManage && addable.length > 0 && (
          <form className="pa-add" onSubmit={add}>
            <select className="bl-select" value={addUserId} onChange={(event) => setAddUserId(event.target.value)} aria-label="Person to add">
              <option value="">Add a person…</option>
              {addable.map((person) => (
                <option key={person.user_id} value={person.user_id}>
                  {person.name}
                  {person.project_role ? ` (now ${roleLabel(person.project_role).toLowerCase()})` : ""}
                </option>
              ))}
            </select>
            <select className="bl-select" value={addRole} onChange={(event) => setAddRole(event.target.value as ProjectRole)} aria-label="Their role">
              {ROLES_DESC.map((role) => (
                <option key={role} value={role}>{PROJECT_ROLE_META[role].label}</option>
              ))}
            </select>
            <button type="submit" className="bl-button" disabled={!addUserId || busy}>Add</button>
          </form>
        )}
        <ul className="pa-list">
          {withAccess.map((person) => (
            <PersonRow
              key={person.user_id}
              person={person}
              canManage={canManage}
              busy={busy}
              isPrivate={detail.visibility === "private"}
              defaultRole={detail.default_role as ProjectRole}
              onRole={(role) => setRole.mutate({ userId: person.user_id, role })}
              onRemove={() => remove.mutate(person.user_id)}
            />
          ))}
        </ul>
        {detail.visibility === "private" && detail.people.length > withAccess.length && (
          <p className="pa-hidden-note">
            {detail.people.length - withAccess.length} other {detail.people.length - withAccess.length === 1 ? "person" : "people"} in the
            workspace can't see this project.
          </p>
        )}
      </section>
    </div>
  );
}

function PersonRow({
  person,
  canManage,
  busy,
  isPrivate,
  defaultRole,
  onRole,
  onRemove,
}: {
  person: ProjectPersonOut;
  canManage: boolean;
  busy: boolean;
  isPrivate: boolean;
  defaultRole: ProjectRole;
  onRole: (role: ProjectRole) => void;
  onRemove: () => void;
}) {
  const locked = person.source === "workspace_admin";
  const explicit = person.source === "explicit" || person.source === "creator";
  return (
    <li className="pa-person">
      <Avatar name={person.name} avatarUrl={person.avatar_url} size={30} />
      <span className="pa-person-copy">
        <strong>{person.name}</strong>
        <small>{locked ? `Workspace ${person.workspace_role}` : ROLE_SOURCE_LABEL[person.source]}{person.title ? ` · ${person.title}` : ""}</small>
      </span>
      {canManage && !locked ? (
        <span className="pa-person-controls">
          <select
            className="bl-select"
            value={person.project_role ?? ""}
            disabled={busy}
            onChange={(event) => onRole(event.target.value as ProjectRole)}
            aria-label={`${person.name}'s role`}
          >
            {ROLES_DESC.map((role) => (
              <option key={role} value={role}>{PROJECT_ROLE_META[role].label}</option>
            ))}
          </select>
          {explicit && (
            <button
              type="button"
              className="bl-icon-button"
              disabled={busy}
              onClick={onRemove}
              aria-label={isPrivate ? `Remove ${person.name} from the project` : `Reset ${person.name} to the default (${roleLabel(defaultRole)})`}
              title={isPrivate ? "Remove" : `Reset to ${roleLabel(defaultRole)}`}
            >
              ×
            </button>
          )}
        </span>
      ) : (
        <em className={`pa-role lens-${person.project_role}`}>{roleLabel(person.project_role)}</em>
      )}
    </li>
  );
}
