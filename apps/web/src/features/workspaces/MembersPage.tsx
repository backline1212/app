import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";

import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Dialog } from "../../components/Dialog";
import { LoadingScreen } from "../../components/LoadingScreen";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useSearchParamsUpdater } from "../../lib/use-search-params-updater";
import { useAuth } from "../auth/AuthContext";
import { ProjectAccessPanel } from "../projects/access/ProjectAccessPanel";
import * as workspacesApi from "./api";
import type { MemberOut, WorkspaceMemberRole, WorkspaceOut } from "./api";
import { AccessMatrix } from "./team/AccessMatrix";
import { InviteDialog } from "./team/InviteDialog";
import { JoinRequestsPanel } from "./team/JoinRequestsPanel";
import { OrgChart } from "./team/org-chart/OrgChart";
import { PeopleTable } from "./team/PeopleTable";
import { PersonDrawer } from "./team/PersonDrawer";
import { ProfileDialog } from "./team/ProfileDialog";
import { canManageTeam, teamsOf } from "./team/team-utils";

type View = "people" | "org" | "access" | "requests";
const VIEWS: View[] = ["people", "org", "access", "requests"];

export function MembersPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, "Team"]);
  const { role: myRole, user } = useAuth();
  const myUserId = user?.id;
  const isAdmin = canManageTeam(myRole);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const update = useSearchParamsUpdater();

  const requested = params.get("view") as View | null;
  const view: View = requested && VIEWS.includes(requested) && (requested !== "requests" || isAdmin) ? requested : "people";
  const selectedUserId = params.get("person");

  const [invite, setInvite] = useState<"email" | "code" | null>(null);
  const [editing, setEditing] = useState<MemberOut | null>(null);
  const [removing, setRemoving] = useState<MemberOut | null>(null);
  const [transferring, setTransferring] = useState<MemberOut | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [manageProjectId, setManageProjectId] = useState<string | null>(null);

  const members = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => workspacesApi.listMembers(workspace.id) });
  const matrix = useQuery({ queryKey: qk.accessMatrix(workspace.id), queryFn: () => workspacesApi.getAccessMatrix(workspace.id) });
  const requests = useQuery({
    queryKey: qk.joinRequests(workspace.id),
    queryFn: () => workspacesApi.listJoinRequests(workspace.id),
    enabled: isAdmin,
  });

  const list = useMemo(() => members.data ?? [], [members.data]);
  const selected = list.find((m) => m.user_id === selectedUserId) ?? null;
  const me = list.find((m) => m.user_id === myUserId);

  const setParam = useCallback(
    (changes: Record<string, string | null>) =>
      update((next) => {
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
      }),
    [update],
  );
  const select = useCallback((userId: string | null) => setParam({ person: userId }), [setParam]);

  const invalidateTeam = () => {
    void queryClient.invalidateQueries({ queryKey: qk.members(workspace.id) });
    void queryClient.invalidateQueries({ queryKey: qk.accessMatrix(workspace.id) });
  };

  const roleChange = useMutation({
    mutationFn: ({ member, role }: { member: MemberOut; role: WorkspaceMemberRole }) =>
      workspacesApi.updateMemberRole(workspace.id, member.id, role),
    onSuccess: (_, { member, role }) => {
      invalidateTeam();
      toast(`${member.name} is now ${role === "admin" ? "an admin" : "a member"}.`, "success");
    },
    onError: (error) => toast(error.message, "error"),
  });

  const reassign = useMutation({
    mutationFn: ({ member, managerUserId }: { member: MemberOut; managerUserId: string | null; previous: string | null }) =>
      workspacesApi.updateMemberProfile(workspace.id, member.id, { manager_user_id: managerUserId }),
    onMutate: async ({ member, managerUserId }) => {
      // Move the card straight away; the server's answer (or an error) settles it.
      await queryClient.cancelQueries({ queryKey: qk.members(workspace.id) });
      queryClient.setQueryData<MemberOut[]>(qk.members(workspace.id), (current) =>
        current?.map((m) => (m.user_id === member.user_id ? { ...m, manager_user_id: managerUserId } : m)),
      );
    },
    onError: (error) => {
      toast(error.message, "error");
      invalidateTeam();
    },
    onSuccess: (_, { member, managerUserId, previous }) => {
      invalidateTeam();
      const manager = list.find((m) => m.user_id === managerUserId);
      toast(
        manager ? `${member.name} now reports to ${manager.name}.` : `${member.name}'s reporting line is cleared.`,
        "success",
        {
          action: {
            label: "Undo",
            onClick: () => reassign.mutate({ member, managerUserId: previous, previous: managerUserId }),
          },
        },
      );
    },
  });

  const remove = useMutation({
    mutationFn: (member: MemberOut) => workspacesApi.removeMember(workspace.id, member.id),
    onSuccess: (_, member) => {
      setRemoving(null);
      if (selectedUserId === member.user_id) select(null);
      invalidateTeam();
      toast(`${member.name} was removed from ${workspace.name}.`);
    },
  });
  const transfer = useMutation({
    mutationFn: (member: MemberOut) => workspacesApi.transferOwnership(workspace.id, member.id),
    onSuccess: async (_, member) => {
      setTransferring(null);
      await queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      invalidateTeam();
      toast(`${member.name} now owns ${workspace.name}. You're an admin.`, "success");
    },
  });
  const leave = useMutation({
    mutationFn: () => workspacesApi.leaveWorkspace(workspace.id),
    onSuccess: async () => {
      setLeaving(false);
      await queryClient.invalidateQueries({ queryKey: qk.workspaces() });
      navigate("/", { replace: true });
    },
  });

  const onReassign = useCallback(
    (userId: string, managerUserId: string | null) => {
      const member = list.find((m) => m.user_id === userId);
      if (member) reassign.mutate({ member, managerUserId, previous: member.manager_user_id ?? null });
    },
    [list, reassign],
  );

  const pendingCount = requests.data?.length ?? 0;
  const admins = list.filter((m) => m.role !== "member").length;
  const teams = teamsOf(list).length;
  const lines = list.filter((m) => m.manager_user_id).length;
  const manageProject = matrix.data?.projects.find((p) => p.id === manageProjectId);

  return (
    <main className={`bl-wrap team-page view-${view}`}>
      <header className="bl-head team-head">
        <div>
          <p className="bl-eyebrow">{workspace.name}</p>
          <h1>Team</h1>
          <p>
            Who's here, who they report to, and what each person can open.
            {isAdmin ? " Invite people, approve room-code requests and set project roles." : ""}
          </p>
        </div>
        <div className="team-head-actions">
          {me && (
            <button type="button" className="bl-quiet" onClick={() => setEditing(me)}>
              Your profile
            </button>
          )}
          {isAdmin && (
            <>
              <button type="button" className="bl-quiet" onClick={() => setInvite("code")}>
                Room code{workspace.room_code_enabled ? <i className="team-live-dot" aria-label="on" /> : null}
              </button>
              <button type="button" className="bl-button mint" onClick={() => setInvite("email")}>
                Invite people
              </button>
            </>
          )}
        </div>
      </header>

      {members.data && (
        <dl className="team-stats">
          <div><dt>People</dt><dd>{list.length}</dd></div>
          <div><dt>Owners &amp; admins</dt><dd>{admins}</dd></div>
          <div><dt>Teams</dt><dd>{teams}</dd></div>
          <div><dt>Reporting lines</dt><dd>{lines}</dd></div>
          {isAdmin && (
            <div className={pendingCount ? "is-alert" : undefined}>
              <dt>Waiting to join</dt>
              <dd>{requests.isLoading ? "…" : pendingCount}</dd>
            </div>
          )}
        </dl>
      )}

      <nav className="bl-tabs team-tabs" aria-label="Team views">
        {(
          [
            ["people", "People", list.length],
            ["org", "Org chart", null],
            ["access", "Access", matrix.data ? matrix.data.projects.filter((p) => !p.archived).length : null],
            ...(isAdmin ? ([["requests", "Requests", pendingCount || null]] as const) : []),
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            aria-current={view === key ? "page" : undefined}
            onClick={() => setParam({ view: key === "people" ? null : key })}
          >
            {label}
            {count !== null && count !== undefined && <span className={`bl-count${key === "requests" ? " is-alert" : ""}`}>{count}</span>}
          </button>
        ))}
      </nav>

      {members.isLoading && <LoadingScreen inline />}
      {members.error && (
        <div className="bl-inline-error" role="alert">
          <span>Members could not load: {members.error.message}</span>
          <button type="button" onClick={() => members.refetch()}>Try again</button>
        </div>
      )}

      {members.data && view === "people" && (
        <PeopleTable
          members={list}
          matrix={matrix.data}
          myRole={myRole}
          myUserId={myUserId}
          filters={{ q: params.get("q") ?? "", role: params.get("role") ?? "", team: params.get("team") ?? "" }}
          onFilters={(next) => setParam(next)}
          onOpen={(member) => select(member.user_id)}
          onRoleChange={(member, role) => roleChange.mutate({ member, role })}
          roleChangePending={roleChange.isPending}
          workspaceName={workspace.name}
        />
      )}

      {members.data && view === "org" && (
        <OrgChart
          workspace={workspace}
          members={list}
          matrix={matrix.data}
          myUserId={myUserId}
          canEditLines={isAdmin}
          selectedUserId={selectedUserId}
          onSelect={select}
          onReassign={onReassign}
          lensProjectId={params.get("lens")}
          onLensChange={(projectId) => setParam({ lens: projectId })}
          team={params.get("team")}
          onTeamChange={(team) => setParam({ team })}
        />
      )}

      {members.data && view === "access" && (
        matrix.isLoading ? (
          <LoadingScreen inline />
        ) : matrix.error || !matrix.data ? (
          <div className="bl-inline-error" role="alert">
            <span>Project access could not load.</span>
            <button type="button" onClick={() => matrix.refetch()}>Try again</button>
          </div>
        ) : (
          <AccessMatrix
            workspace={workspace}
            members={list}
            matrix={matrix.data}
            myUserId={myUserId}
            query={params.get("q") ?? ""}
            onQuery={(q) => setParam({ q })}
            onManageProject={setManageProjectId}
          />
        )
      )}

      {view === "requests" && isAdmin && (
        <JoinRequestsPanel
          workspace={workspace}
          requests={requests.data}
          isLoading={requests.isLoading}
          error={requests.error}
          onRetry={() => void requests.refetch()}
          onOpenInvite={() => setInvite("code")}
        />
      )}

      {selected && (
        <PersonDrawer
          workspace={workspace}
          member={selected}
          members={list}
          matrix={matrix.data}
          myRole={myRole}
          myUserId={myUserId}
          onClose={() => select(null)}
          onSelect={select}
          actions={{
            onEdit: setEditing,
            onRemove: setRemoving,
            onTransfer: setTransferring,
            onLeave: () => setLeaving(true),
          }}
        />
      )}

      {invite && <InviteDialog workspace={workspace} initialTab={invite} onClose={() => setInvite(null)} />}
      {editing && (
        <ProfileDialog
          workspace={workspace}
          member={editing}
          members={list}
          myRole={myRole}
          myUserId={myUserId}
          onClose={() => setEditing(null)}
        />
      )}
      {manageProjectId && (
        <Dialog title={manageProject ? `Access to ${manageProject.name}` : "Project access"} onClose={() => setManageProjectId(null)}>
          <div className="team-dialog-body">
            <ProjectAccessPanel projectId={manageProjectId} workspaceId={workspace.id} workspaceName={workspace.name} />
          </div>
        </Dialog>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          message={
            <>
              <p>They lose access to {workspace.name} and every project in it straight away.</p>
              <p className="team-note">Anyone who reports to them moves up to their manager. Their comments stay.</p>
              {remove.error && <p className="bl-error" role="alert">{remove.error.message}</p>}
            </>
          }
          confirmLabel={remove.isPending ? "Removing…" : "Remove"}
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
      {transferring && (
        <ConfirmDialog
          title={`Make ${transferring.name} the owner?`}
          message={
            <>
              <p>
                {transferring.name} takes over {workspace.name}, including billing. You stay on as an admin, and
                only the new owner can undo this.
              </p>
              {transfer.error && <p className="bl-error" role="alert">{transfer.error.message}</p>}
            </>
          }
          confirmLabel={transfer.isPending ? "Transferring…" : "Transfer ownership"}
          destructive
          pending={transfer.isPending}
          onConfirm={() => transfer.mutate(transferring)}
          onCancel={() => setTransferring(null)}
        />
      )}
      {leaving && (
        <ConfirmDialog
          title={`Leave ${workspace.name}?`}
          message={
            <>
              <p>You lose access to its projects. To come back you'll need a new invite or the room code.</p>
              {leave.error && <p className="bl-error" role="alert">{leave.error.message}</p>}
            </>
          }
          confirmLabel={leave.isPending ? "Leaving…" : "Leave workspace"}
          destructive
          pending={leave.isPending}
          onConfirm={() => leave.mutate()}
          onCancel={() => setLeaving(false)}
        />
      )}
    </main>
  );
}
