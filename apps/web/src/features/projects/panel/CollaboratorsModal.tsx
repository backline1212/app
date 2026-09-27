import { Avatar } from "@backline/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Dialog } from "../../../components/Dialog";
import { GearIcon } from "../../../components/icons";
import { qk } from "../../../lib/query-keys";
import { useAuth } from "../../auth/AuthContext";
import * as shareLinksApi from "../../share-links/api";
import * as workspacesApi from "../../workspaces/api";
import type { ProjectOut } from "../api";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

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

// Visually modeled on a reference design with per-link "View"/"Comment" viewer roles
// and a settings checklist (page versions, device sizes, all pages) - this app has
// neither concept (a project's share link is a single all-or-nothing "can this guest
// see and comment on client-visible threads" toggle, and inviting someone always
// grants full workspace membership, not a scoped viewer role), so those are mapped to
// what's actually real here instead of faked: the invite role dropdown offers this
// app's real Member/Admin workspace roles, and the settings gear links to the full
// Share Links page (passcode/expiry/mode) rather than a fake checklist. Shares its
// vocabulary with ShareProjectModal.tsx, which covers the same two capabilities in a
// slightly wider "project sharing" context.
export function CollaboratorsModal({
  project,
  workspaceId,
  workspaceSlug,
  workspaceName,
  onClose,
}: CollaboratorsModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [copied, setCopied] = useState(false);

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => workspacesApi.listMembers(workspaceId),
  });

  const shareLinksQuery = useQuery({
    queryKey: qk.shareLinks(project.id),
    queryFn: () => shareLinksApi.listShareLinks(project.id),
  });
  const activeLink = (shareLinksQuery.data ?? []).find((link) => link.revoked_at === null);

  const inviteMutation = useMutation({
    mutationFn: () => workspacesApi.inviteMember(workspaceId, email.trim(), role),
    onSuccess: () => {
      setEmail("");
      queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
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
          <div className="bl-section-heading">
            <div>
              <h3>Invite a collaborator</h3>
              <p>Workspace access · every project</p>
            </div>
            <span className="bl-scope-badge">Workspace</span>
          </div>
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
              aria-label="Role"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button className="bl-button" disabled={inviteMutation.isPending || !email.trim()}>
              {inviteMutation.isPending ? "Sending…" : "Invite"}
            </button>
          </form>
          {inviteMutation.isError && <p className="bl-error">Could not send that invite.</p>}

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
          ) : (
            <div className="bl-share-people">
              {membersQuery.data?.map((member) => (
                <div key={member.id} className="bl-share-person">
                  <Avatar name={member.name} avatarUrl={member.avatar_url} size={32} />
                  <span>
                    <strong>
                      {member.name}
                      {member.user_id === user?.id ? " (You)" : ""}
                    </strong>
                    <small>{member.email}</small>
                  </span>
                  <em>{ROLE_LABELS[member.role] ?? member.role}</em>
                </div>
              ))}
            </div>
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

          {shareLinksQuery.isLoading ? (
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
