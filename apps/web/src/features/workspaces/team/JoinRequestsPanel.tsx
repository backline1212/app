import { Avatar } from "@backline/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { EmptyArt } from "../../../components/illustrations";
import { useToast } from "../../../components/Toast";
import { qk } from "../../../lib/query-keys";
import { timeAgo } from "../../../lib/time";
import { planLimitUpgrade } from "../../billing/api";
import * as workspacesApi from "../api";
import type { JoinRequestOut, WorkspaceMemberRole, WorkspaceOut } from "../api";

/** People who entered the room code and are waiting for an owner or admin. */
export function JoinRequestsPanel({
  workspace,
  requests,
  isLoading,
  error,
  onRetry,
  onOpenInvite,
}: {
  workspace: WorkspaceOut;
  requests: JoinRequestOut[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onOpenInvite: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [roles, setRoles] = useState<Record<string, WorkspaceMemberRole>>({});

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.joinRequests(workspace.id) });
    void queryClient.invalidateQueries({ queryKey: qk.members(workspace.id) });
    void queryClient.invalidateQueries({ queryKey: qk.accessMatrix(workspace.id) });
  };
  const approve = useMutation({
    mutationFn: (request: JoinRequestOut) =>
      workspacesApi.approveJoinRequest(workspace.id, request.id, roles[request.id] ?? "member"),
    onSuccess: (member) => {
      refresh();
      toast(`${member.name} joined ${workspace.name}.`, "success");
    },
    onError: (error) => {
      const plan = planLimitUpgrade(error);
      toast(plan ? `${error.message} Upgrade your plan to add more people.` : error.message, "error");
      refresh();
    },
  });
  const reject = useMutation({
    mutationFn: (request: JoinRequestOut) => workspacesApi.rejectJoinRequest(workspace.id, request.id),
    onSuccess: (_, request) => {
      refresh();
      toast(`Declined ${request.user_name}'s request.`);
    },
    onError: (error) => {
      toast(error.message, "error");
      refresh();
    },
  });

  if (isLoading) {
    return (
      <div className="team-requests" role="status" aria-label="Loading requests">
        <div className="team-request is-skeleton" />
        <div className="team-request is-skeleton" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bl-inline-error" role="alert">
        <span>Requests could not load: {error.message}</span>
        <button type="button" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (!requests?.length) {
    return (
      <div className="bl-empty">
        <EmptyArt kind="people" />
        <h2>No one is waiting</h2>
        <p>
          {workspace.room_code_enabled
            ? "When someone enters your room code, their request appears here for you to approve."
            : "Turn on the room code to let people ask to join without an email invite."}
        </p>
        <button type="button" className="bl-quiet" onClick={onOpenInvite}>
          {workspace.room_code_enabled ? "Show the room code" : "Set up a room code"}
        </button>
      </div>
    );
  }

  const busyId = approve.isPending ? approve.variables?.id : reject.isPending ? reject.variables?.id : null;
  return (
    <div className="team-requests">
      {requests.map((request) => (
        <article key={request.id} className="team-request">
          <Avatar name={request.user_name} avatarUrl={request.user_avatar_url} size={40} />
          <div className="team-request-copy">
            <strong>{request.user_name}</strong>
            <small>{request.user_email} · asked {timeAgo(request.created_at)}</small>
            {request.message && <blockquote>{request.message}</blockquote>}
          </div>
          <div className="team-request-actions">
            <select
              className="bl-select"
              value={roles[request.id] ?? "member"}
              onChange={(event) => setRoles((current) => ({ ...current, [request.id]: event.target.value as WorkspaceMemberRole }))}
              aria-label={`Role for ${request.user_name}`}
              disabled={busyId === request.id}
            >
              <option value="member">as Member</option>
              <option value="admin">as Admin</option>
            </select>
            <button type="button" className="bl-quiet" disabled={busyId === request.id} onClick={() => reject.mutate(request)}>
              Decline
            </button>
            <button type="button" className="bl-button mint" disabled={busyId === request.id} onClick={() => approve.mutate(request)}>
              {approve.isPending && busyId === request.id ? "Approving…" : "Approve"}
            </button>
          </div>
        </article>
      ))}
      <p className="team-requests-note">
        Approved people see every project open to the whole workspace. Add them to private projects from
        the <Link to={`/w/${workspace.slug}/members?view=access`}>Access</Link> tab.
      </p>
    </div>
  );
}
