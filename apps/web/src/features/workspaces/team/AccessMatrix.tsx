import { Avatar } from "@backline/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyArt } from "../../../components/illustrations";
import { LockIcon, SearchIcon } from "../../../components/icons";
import { useToast } from "../../../components/Toast";
import { PROJECT_ROLES, PROJECT_ROLE_META, ROLE_SOURCE_LABEL, type ProjectRole, roleLabel } from "../../../lib/project-roles";
import { qk } from "../../../lib/query-keys";
import { useOnClickOutside } from "../../../lib/use-click-outside";
import * as projectsApi from "../../projects/api";
import type { AccessMatrixOut, AccessMatrixProjectOut, MemberOut, WorkspaceOut } from "../api";
import { WORKSPACE_ROLE_LABEL, byRoleThenName } from "./team-utils";

interface OpenCell {
  projectId: string;
  userId: string;
}

/**
 * Who can open what (TDR-0056): every member down the side, every project you can see
 * across the top. A project's managers - and every owner and admin - change a person's
 * role from the cell; the rest of the grid is read-only for them.
 */
export function AccessMatrix({
  workspace,
  members,
  matrix,
  myUserId,
  query,
  onQuery,
  onManageProject,
}: {
  workspace: WorkspaceOut;
  members: MemberOut[];
  matrix: AccessMatrixOut;
  myUserId: string | undefined;
  query: string;
  onQuery: (value: string) => void;
  onManageProject: (projectId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState<OpenCell | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(popRef, useCallback(() => setOpen(null), []));

  const projects = useMemo(() => matrix.projects.filter((p) => !p.archived), [matrix]);
  const q = query.trim().toLowerCase();
  const people = members
    .filter((m) => !q || [m.name, m.email, m.title ?? "", m.team ?? ""].some((v) => v.toLowerCase().includes(q)))
    .sort(byRoleThenName);

  const refresh = (projectId: string) => {
    void queryClient.invalidateQueries({ queryKey: qk.accessMatrix(workspace.id) });
    void queryClient.invalidateQueries({ queryKey: qk.projectAccess(projectId) });
    void queryClient.invalidateQueries({ queryKey: qk.projects(workspace.id) });
  };
  const setRole = useMutation({
    mutationFn: ({ projectId, userId, role }: OpenCell & { role: ProjectRole }) =>
      projectsApi.setProjectMemberRole(projectId, userId, role),
    onSuccess: (_, { projectId }) => {
      setOpen(null);
      refresh(projectId);
    },
    onError: (error) => toast(error.message, "error"),
  });
  const remove = useMutation({
    mutationFn: ({ projectId, userId }: OpenCell) => projectsApi.removeProjectMember(projectId, userId),
    onSuccess: (_, { projectId }) => {
      setOpen(null);
      refresh(projectId);
    },
    onError: (error) => toast(error.message, "error"),
  });

  if (projects.length === 0) {
    return (
      <div className="bl-empty">
        <EmptyArt kind="projects" />
        <h2>No projects yet</h2>
        <p>Once there are projects, this grid shows who can open each one and with what role.</p>
      </div>
    );
  }

  const canManage = (project: AccessMatrixProjectOut) => myUserId !== undefined && project.roles[myUserId] === "manager";
  const busy = setRole.isPending || remove.isPending;

  return (
    <>
      <div className="bl-toolbar wrap team-toolbar">
        <div className="bl-search team-search">
          <span className="bl-search-icon" aria-hidden="true"><SearchIcon /></span>
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search people" aria-label="Search people in the access grid" />
        </div>
        <div className="team-matrix-legend" aria-label="Legend">
          {PROJECT_ROLES.slice().reverse().map((role) => (
            <span key={role}><i className={`lens-${role}`} />{PROJECT_ROLE_META[role].label}</span>
          ))}
          <span><i className="is-default" />From the workspace default</span>
        </div>
      </div>
      <div className="team-matrix-wrap">
        <table className="team-matrix">
          <thead>
            <tr>
              <th scope="col" className="team-matrix-corner">
                {people.length} {people.length === 1 ? "person" : "people"} · {projects.length} project{projects.length === 1 ? "" : "s"}
              </th>
              {projects.map((project) => (
                <th key={project.id} scope="col">
                  <div className="team-matrix-project">
                    <Link to={`/w/${workspace.slug}/p/${project.id}`} title={project.name}>
                      {project.visibility === "private" && <LockIcon className="team-lock" aria-label="Private" role="img" />}
                      <span>{project.name}</span>
                    </Link>
                    <small>{project.visibility === "private" ? "Private" : `Everyone: ${roleLabel(project.default_role)}`}</small>
                    {canManage(project) && (
                      <button type="button" className="bl-text-link" onClick={() => onManageProject(project.id)}>
                        Manage
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((member) => (
              <tr key={member.user_id}>
                <th scope="row">
                  <span className="team-matrix-person">
                    <Avatar name={member.name} avatarUrl={member.avatar_url} size={26} />
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.title || WORKSPACE_ROLE_LABEL[member.role]}</small>
                    </span>
                  </span>
                </th>
                {projects.map((project) => {
                  const role = project.roles[member.user_id];
                  const source = project.sources[member.user_id] ?? "none";
                  const locked = source === "workspace_admin";
                  const editable = canManage(project) && !locked;
                  const isOpen = open?.projectId === project.id && open.userId === member.user_id;
                  const label = `${member.name} on ${project.name}: ${roleLabel(role)}${role ? ` (${ROLE_SOURCE_LABEL[source]})` : ""}`;
                  return (
                    <td key={project.id} className={isOpen ? "is-open" : undefined}>
                      {editable ? (
                        <button
                          type="button"
                          className={`team-cell${role ? ` lens-${role}` : " is-none"}${source === "default" ? " is-default" : ""}`}
                          aria-label={`${label}. Change`}
                          aria-haspopup="menu"
                          aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? null : { projectId: project.id, userId: member.user_id })}
                        >
                          {role ? roleLabel(role) : "—"}
                        </button>
                      ) : (
                        <span
                          className={`team-cell is-static${role ? ` lens-${role}` : " is-none"}${source === "default" ? " is-default" : ""}${locked ? " is-locked" : ""}`}
                          title={label}
                          aria-label={label}
                        >
                          {role ? roleLabel(role) : "—"}
                        </span>
                      )}
                      {isOpen && (
                        <div ref={popRef} className="team-cell-pop" role="menu" aria-label={`Role for ${member.name} on ${project.name}`}>
                          <p>{member.name} · {project.name}</p>
                          {PROJECT_ROLES.slice().reverse().map((option) => (
                            <button
                              key={option}
                              type="button"
                              role="menuitemradio"
                              aria-checked={role === option && source === "explicit"}
                              disabled={busy}
                              onClick={() => setRole.mutate({ projectId: project.id, userId: member.user_id, role: option })}
                            >
                              <strong>{PROJECT_ROLE_META[option].label}</strong>
                              <small>{PROJECT_ROLE_META[option].summary}</small>
                            </button>
                          ))}
                          {(source === "explicit" || source === "creator") && (
                            <button
                              type="button"
                              role="menuitem"
                              className="danger"
                              disabled={busy}
                              onClick={() => remove.mutate({ projectId: project.id, userId: member.user_id })}
                            >
                              <strong>{project.visibility === "private" ? "Remove from project" : `Use the workspace default (${roleLabel(project.default_role)})`}</strong>
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="team-matrix-note">
        Owners and admins manage every project. On a project open to the whole workspace, everyone gets its default role
        unless they're given another; a private project is only open to the people on it.
      </p>
    </>
  );
}
