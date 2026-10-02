import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Dialog } from "../../../components/Dialog";
import { GearIcon } from "../../../components/icons";
import { qk } from "../../../lib/query-keys";
import { projectCan, roleLabel } from "../../../lib/project-roles";
import { useAuth } from "../../auth/AuthContext";
import { ProjectAccessPanel } from "../access/ProjectAccessPanel";
import * as shareLinksApi from "../../share-links/api";
import * as workspacesApi from "../../workspaces/api";
import type { ProjectOut } from "../api";

function reviewUrl(token: string): string {
  return `${window.location.origin}/review/${token}`;
}

interface CollaboratorsModalProps {
  project: ProjectOut;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  onClose: () => void;
}

// Visually modeled on a reference design with per-person roles and a link toggle.
// Teammates' roles are the real project roles (TDR-0056, ProjectAccessPanel); inviting
// someone new adds them to the workspace and is offered to owners and admins only;
// the settings gear links to the full Share Links page (passcode/expiry/mode). Shares
// its vocabulary with ShareProjectModal.tsx.
export function CollaboratorsModal({
  project,
  workspaceId,
  workspaceSlug,
  workspaceName,
  onClose,
}: CollaboratorsModalProps) {
  const { role: workspaceRole } = useAuth();
  const queryClient = useQueryClient();
  const canInvite = workspaceRole === "owner" || workspaceRole === "admin";
  const canShareLink = projectCan(project, "edit");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [copied, setCopied] = useState(false);

  const shareLinksQuery = useQuery({
    queryKey: qk.shareLinks(project.id),
    queryFn: () => shareLinksApi.listShareLinks(project.id),
    enabled: canShareLink,
  });
  const activeLink = (shareLinksQuery.data ?? []).find((link) => link.revoked_at === null);

  const inviteMutation = useMutation({
    mutationFn: () => workspacesApi.inviteMember(workspaceId, email.trim(), role),
    onSuccess: () => {
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: qk.projectAccess(project.id) });
    },
  });

  const createLinkMutation = useMutation({
    mutationFn: () => shareLinksApi.createShareLink(project.id, { mode: "proxy" }),
    onSuccess: () => shareLinksQuery.refetch(),
  });
  const revokeLinkMutation = useMutation({
    mutationFn: (shareLinkId: string) => shareLinksApi.revokeShareLink(shareLinkId),
    onSuccess: () => shareLinksQuery.refetch(),
  });

  function toggleGeneralAccess() {
    if (activeLink) revokeLinkMutation.mutate(activeLink.id);
    else createLinkMutation.mutate();
  }

  async function copyLink() {
    if (!activeLink) return;
    await navigator.clipboard.writeText(reviewUrl(activeLink.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    inviteMutation.mutate();
  }

  return (
    <Dialog title={`Share "${project.name}"`} onClose={onClose}>
      <div className="bl-share-body">
        <section className="bl-share-section">
          <ProjectAccessPanel projectId={project.id} workspaceId={workspaceId} workspaceName={workspaceName} />
          {canInvite && (
            <details className="pa-invite">
              <summary>Invite someone new to {workspaceName}</summary>
              <form className="bl-invite-row" onSubmit={handleInvite}>
                <input
                  className="bl-input"
                  type="email"
                  required
                  placeholder={`someone@${workspaceName.toLowerCase().replace(/\s+/g, "")}.com`}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-label="Collaborator email"
                />
                <select
                  className="bl-input"
                  value={role}
                  onChange={(event) => setRole(event.target.value as "member" | "admin")}
                  aria-label="Workspace role"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button className="bl-button" disabled={inviteMutation.isPending || !email.trim()}>
                  {inviteMutation.isPending ? "Sending…" : "Invite"}
                </button>
              </form>
              {inviteMutation.isError && <p className="bl-error">{inviteMutation.error.message}</p>}
            </details>
          )}
        </section>

        <section className="bl-share-section bl-share-link-section">
          <div className="bl-section-heading">
            <div>
              <h3>Anyone with the link</h3>
              <p>Project-scoped guest access</p>
            </div>
            <span className={`bl-access-state${activeLink ? " is-on" : ""}`}>
              <i />
              {activeLink ? "On" : "Off"}
            </span>
          </div>
          <p>Reviewers can open this project and leave comments without creating an account.</p>

          {!canShareLink ? (
            <p className="bl-inline-note">
              Editors and managers of this project turn the review link on and copy it. Your role is{" "}
              {roleLabel(project.my_role).toLowerCase()}.
            </p>
          ) : shareLinksQuery.isLoading ? (
            <div className="bl-link-skeleton" role="status">
              Loading review link…
            </div>
          ) : shareLinksQuery.isError ? (
            <div className="bl-inline-error" role="alert">
              <span>Review link could not load.</span>
              <button type="button" onClick={() => shareLinksQuery.refetch()}>
                Try again
              </button>
            </div>
          ) : (
            <>
              <label className="bl-setting-row compact" style={{ marginTop: 4 }}>
                <span className="bl-setting-copy">
                  <strong>Anyone with the link</strong>
                  <span>{activeLink ? "On — reviewers can open and comment." : "Off — link access is disabled."}</span>
                </span>
                <input
                  type="checkbox"
                  className="bl-switch-input"
                  checked={!!activeLink}
                  disabled={createLinkMutation.isPending || revokeLinkMutation.isPending}
                  onChange={toggleGeneralAccess}
                  aria-label="Anyone with the link can access this project"
                />
                <span className="bl-switch" aria-hidden="true">
                  <i />
                </span>
              </label>
              {activeLink && (
                <div className="bl-link-row" style={{ marginTop: 10 }}>
                  <input
                    readOnly
                    value={reviewUrl(activeLink.token)}
                    aria-label="Client review link"
                    onFocus={(event) => event.target.select()}
                    className="bl-input bl-mono"
                  />
                  <button type="button" className="bl-quiet" onClick={copyLink}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <Link
                    to={`/w/${workspaceSlug}/p/${project.id}/share-links`}
                    aria-label="Manage share link settings (passcode, expiry, mode)"
                    onClick={onClose}
                    className="bl-icon-button"
                  >
                    <GearIcon />
                  </Link>
                </div>
              )}
              <p className="bl-guest-hint">
                {activeLink
                  ? "Each project gets its own link. Passcode, expiry and domain restrictions live on the full share-links manager."
                  : "No one can open this project via link right now."}
              </p>
            </>
          )}
        </section>
      </div>
      <footer className="bl-dialog-actions bl-dialog-actions-bordered">
        <button type="button" className="bl-quiet" onClick={onClose}>
          Done
        </button>
      </footer>
    </Dialog>
  );
}
