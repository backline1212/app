import { Avatar } from "@backline/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import * as boardApi from "../../board/api";
import * as pagesApi from "../../pages/api";
import { qk } from "../../../lib/query-keys";
import * as workspacesApi from "../../workspaces/api";
import type { ProjectOut } from "../api";
import { CollaboratorsModal } from "./CollaboratorsModal";

interface DetailsTabProps {
  project: ProjectOut;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function formatAddedOn(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// "Page Overview" + "Collaborators" - real data throughout (no per-link view/comment
// roles or granular link settings shown here, since this app doesn't have that model;
// see CollaboratorsModal's own note on where it simplifies the reference design).
export function DetailsTab({
  project,
  workspaceId,
  workspaceSlug,
  workspaceName,
}: DetailsTabProps) {
  const [showCollaborators, setShowCollaborators] = useState(false);

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => workspacesApi.listMembers(workspaceId),
  });
  const commentsQuery = useQuery({
    queryKey: qk.projectComments(project.id),
    queryFn: () => boardApi.listProjectComments(project.id),
  });
  const pagesQuery = useQuery({
    queryKey: qk.projectPages(project.id),
    queryFn: () => pagesApi.listProjectPages(project.id),
  });

  const members = membersQuery.data ?? [];
  const creator = members.find((member) => member.user_id === project.created_by);
  const statsLoading = commentsQuery.isLoading || pagesQuery.isLoading;
  const statsError = commentsQuery.isError || pagesQuery.isError;
  const totalComments = commentsQuery.data?.length ?? 0;
  const resolvedComments = (commentsQuery.data ?? []).filter((c) => c.status === "resolved").length;

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold">Page overview</h3>
        <div className="bl-link-settings-panel">
          {creator && (
            <header>
              <Avatar name={creator.name} avatarUrl={creator.avatar_url} size={24} />
              <strong>{creator.name}</strong>
              <span style={{ marginLeft: "auto", color: "var(--ink-4)", font: "9px var(--mono)" }}>
                Added {formatAddedOn(project.created_at)}
              </span>
            </header>
          )}
          {statsError ? (
            <div className="bl-inline-error" role="alert" style={{ marginTop: 10 }}>
              <span>Some project stats could not load.</span>
              <button type="button" onClick={() => { commentsQuery.refetch(); pagesQuery.refetch(); }}>
                Try again
              </button>
            </div>
          ) : (
            <dl>
              <div>
                <dt>Total comments</dt>
                <dd>{statsLoading ? "…" : totalComments}</dd>
              </div>
              <div>
                <dt>Resolved</dt>
                <dd>{statsLoading ? "…" : resolvedComments}</dd>
              </div>
              <div>
                <dt>Versions</dt>
                <dd>{statsLoading ? "…" : (pagesQuery.data?.length ?? 0)}</dd>
              </div>
              <div>
                <dt>URL</dt>
                <dd>
                  <a href={project.target_origin} target="_blank" rel="noreferrer" className="bl-text-link">
                    Open ↗
                  </a>
                </dd>
              </div>
            </dl>
          )}
          <div className="mt-3 flex gap-2">
            <Link to={`/w/${workspaceSlug}/p/${project.id}/board`} className="bl-quiet flex-1 text-center">
              Open board →
            </Link>
            <Link to={`/w/${workspaceSlug}/p/${project.id}/share-links`} className="bl-quiet flex-1 text-center">
              Share links →
            </Link>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Collaborators ({members.length})</h3>
        </div>
        <button
          type="button"
          onClick={() => setShowCollaborators(true)}
          className="bl-quiet"
          style={{ width: "100%", marginBottom: 8 }}
        >
          + Add new
        </button>
        {membersQuery.isLoading ? (
          <div className="bl-member-skeleton" role="status" aria-label="Loading collaborators">
            <i />
            <i />
          </div>
        ) : membersQuery.isError ? (
          <div className="bl-inline-error" role="alert">
            <span>Collaborators could not load.</span>
            <button type="button" onClick={() => membersQuery.refetch()}>
              Try again
            </button>
          </div>
        ) : members.length === 0 ? (
          <p className="bl-inline-note">No collaborators yet.</p>
        ) : (
          <div className="bl-share-people">
            {members.map((member) => (
              <div key={member.id} className="bl-share-person">
                <Avatar name={member.name} avatarUrl={member.avatar_url} size={32} />
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </span>
                <em>{ROLE_LABELS[member.role] ?? member.role}</em>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCollaborators && (
        <CollaboratorsModal
          project={project}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          workspaceName={workspaceName}
          onClose={() => setShowCollaborators(false)}
        />
      )}
    </div>
  );
}
