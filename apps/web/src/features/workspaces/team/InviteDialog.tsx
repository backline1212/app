import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { Dialog } from "../../../components/Dialog";
import { useToast } from "../../../components/Toast";
import { qk } from "../../../lib/query-keys";
import { planLimitUpgrade, type PaidPlanId } from "../../billing/api";
import * as workspacesApi from "../api";
import type { WorkspaceMemberRole, WorkspaceOut } from "../api";
import { RoomCodePanel } from "./RoomCodePanel";

/** Two ways in: an email invite for one person, or the workspace room code for many. */
export function InviteDialog({
  workspace,
  initialTab = "email",
  onClose,
}: {
  workspace: WorkspaceOut;
  initialTab?: "email" | "code";
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"email" | "code">(initialTab);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceMemberRole>("member");
  const [upgradePlan, setUpgradePlan] = useState<PaidPlanId | null>(null);

  const invite = useMutation({
    mutationFn: () => workspacesApi.inviteMember(workspace.id, email.trim(), role),
    onSuccess: (member) => {
      void queryClient.invalidateQueries({ queryKey: qk.members(workspace.id) });
      void queryClient.invalidateQueries({ queryKey: qk.accessMatrix(workspace.id) });
      toast(`Invite sent to ${member.email}.`, "success");
      onClose();
    },
    onError: (error) => setUpgradePlan(planLimitUpgrade(error)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setUpgradePlan(null);
    if (email.trim() && !invite.isPending) invite.mutate();
  }

  return (
    <Dialog title="Invite people" onClose={onClose}>
      <div className="bl-tabs team-dialog-tabs" role="tablist" aria-label="How to invite">
        <button type="button" role="tab" aria-selected={tab === "email"} aria-pressed={tab === "email"} onClick={() => setTab("email")}>
          By email
        </button>
        <button type="button" role="tab" aria-selected={tab === "code"} aria-pressed={tab === "code"} onClick={() => setTab("code")}>
          With a room code
        </button>
      </div>
      {tab === "email" ? (
        <form className="bl-form" onSubmit={submit}>
          <p>They get an email and join {workspace.name} the first time they sign in with that address.</p>
          <label>
            Email
            <input
              required
              type="email"
              autoFocus
              className="bl-input"
              placeholder="teammate@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <fieldset className="team-role-pick">
            <legend>Workspace role</legend>
            <label className={role === "member" ? "is-on" : undefined}>
              <input type="radio" name="invite-role" value="member" checked={role === "member"} onChange={() => setRole("member")} />
              <span>
                <strong>Member</strong>
                <small>Works on the projects they're given. Can't manage people or billing.</small>
              </span>
            </label>
            <label className={role === "admin" ? "is-on" : undefined}>
              <input type="radio" name="invite-role" value="admin" checked={role === "admin"} onChange={() => setRole("admin")} />
              <span>
                <strong>Admin</strong>
                <small>Manages every project, people and integrations.</small>
              </span>
            </label>
          </fieldset>
          {invite.error && (
            <div className="bl-error" role="alert">
              {invite.error.message}
              {upgradePlan && (
                <>
                  {" "}
                  <Link to={`/w/${workspace.slug}/billing?upgrade=${upgradePlan}`} onClick={onClose}>See plans</Link>
                </>
              )}
            </div>
          )}
          <footer className="bl-form-actions">
            <button type="button" className="bl-quiet" onClick={onClose}>Cancel</button>
            <button type="submit" className="bl-button mint" disabled={invite.isPending || !email.trim()}>
              {invite.isPending ? "Sending…" : "Send invite"}
            </button>
          </footer>
        </form>
      ) : (
        <div className="team-dialog-body">
          <RoomCodePanel workspace={workspace} />
        </div>
      )}
    </Dialog>
  );
}
