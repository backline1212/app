import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

import { Dialog } from "../../components/Dialog";
import { GearIcon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import { useUnsavedChanges } from "../../lib/use-unsaved-changes";
import { useAuth } from "../auth/AuthContext";
import { projectCan, roleLabel } from "../../lib/project-roles";
import { ProjectAccessPanel } from "../projects/access/ProjectAccessPanel";
import type { ProjectOut } from "../projects/api";
import * as shareLinksApi from "../share-links/api";
import * as workspacesApi from "./api";

function reviewUrl(token: string): string {
  return `${window.location.origin}/review/${token}`;
}

interface ShareProjectModalProps {
  project: ProjectOut;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  onClose: () => void;
}

// Teammates: who can open this project and with what role (TDR-0056), plus - for owners
// and admins - inviting someone new to the workspace. Clients: the project's review
// link, which editors and managers create and copy.
export function ShareProjectModal({ project, workspaceId, workspaceSlug, workspaceName, onClose }: ShareProjectModalProps) {
  const { role: currentRole } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [askReviewerName, setAskReviewerName] = useState(true);
  const [commentExportPermission, setCommentExportPermission] = useState(false);
  const [domainRestrictionsStr, setDomainRestrictionsStr] = useState("");
  const [expiration, setExpiration] = useState<"never" | "7" | "30">("never");
  const canInvite = currentRole === "owner" || currentRole === "admin";
  const isDirty = email.trim().length > 0 || passcode.trim().length > 0 || domainRestrictionsStr.trim().length > 0;
  useUnsavedChanges(isDirty);

  const canShareLink = projectCan(project, "edit");
  const linksQuery = useQuery({
    queryKey: qk.shareLinks(project.id),
    queryFn: () => shareLinksApi.listShareLinks(project.id),
    enabled: canShareLink,
  });
  const activeLink = linksQuery.data?.find((link) => link.revoked_at === null);

  const inviteMutation = useMutation({
    mutationFn: () => workspacesApi.inviteMember(workspaceId, email.trim(), role),
    onSuccess: async () => {
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
      await queryClient.invalidateQueries({ queryKey: qk.projectAccess(project.id) });
      toast(
        project.access.visibility === "private"
          ? "Invitation sent. Add them to this project below once they're in the list."
          : "Workspace invitation sent.",
      );
    },
  });

  const createMutation = useMutation({
    mutationFn: () => shareLinksApi.createShareLink(project.id, {
      mode: "proxy",
      passcode: passcode.trim() || undefined,
      askReviewerName,
      commentExportPermission,
      domainRestrictions: domainRestrictionsStr.split(",").map((domain) => domain.trim()).filter(Boolean),
      expiresAt: expiration === "never" ? undefined : new Date(Date.now() + Number(expiration) * 24 * 60 * 60 * 1000).toISOString(),
    }),
    onSuccess: async () => {
      setPasscode("");
      setDomainRestrictionsStr("");
      await queryClient.invalidateQueries({ queryKey: qk.shareLinks(project.id) });
      toast("Client review link created.");
    },
  });

  async function copyLink() {
    if (!activeLink) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(reviewUrl(activeLink.token));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Select the link and copy it manually.");
    }
  }

  return (
    <Dialog title="Share project" onClose={onClose}>
      <div className="bl-dialog-intro"><p>{project.name}</p></div>
      <div className="bl-share-body">
        <section className="bl-share-section">
          <ProjectAccessPanel projectId={project.id} workspaceId={workspaceId} workspaceName={workspaceName} />
          {canInvite && (
            <details className="pa-invite">
              <summary>Invite someone new to {workspaceName}</summary>
              <form className="bl-invite-row" onSubmit={(event) => { event.preventDefault(); if (email.trim()) inviteMutation.mutate(); }}>
                <input className="bl-input" type="email" required placeholder="name@youragency.com" aria-label="Teammate email" value={email} onChange={(event) => setEmail(event.target.value)} />
                <select className="bl-input" aria-label="Workspace role" value={role} onChange={(event) => setRole(event.target.value as "member" | "admin")}><option value="member">Member</option><option value="admin">Admin</option></select>
                <button className="bl-button" disabled={inviteMutation.isPending || !email.trim()}>{inviteMutation.isPending ? "Sending…" : "Invite"}</button>
              </form>
              <p className="bl-share-disclosure">This adds them to <strong>{workspaceName}</strong>. Client reviewers should use the project link below instead.</p>
              {inviteMutation.isError && <p role="alert" className="bl-error">{inviteMutation.error.message}</p>}
            </details>
          )}
        </section>

        <section className="bl-share-section bl-share-link-section">
          <div className="bl-section-heading"><div><h3>Anyone with the link</h3><p>Project-scoped guest access</p></div><span className={`bl-access-state${activeLink ? " is-on" : ""}`}><i />{activeLink ? "On" : "Off"}</span></div>
          <p>Reviewers can open this project and leave comments without creating an account.</p>

          {!canShareLink ? <p className="bl-inline-note">Editors and managers of this project create and copy its review link. Your role is {roleLabel(project.my_role).toLowerCase()}.</p> : linksQuery.isLoading ? <div className="bl-link-skeleton" role="status">Loading review link…</div> : linksQuery.isError ? <div className="bl-inline-error" role="alert"><span>Review links could not load.</span><button type="button" onClick={() => linksQuery.refetch()}>Try again</button></div> : activeLink ? <>
            <div className="bl-link-row">
              <input className="bl-input bl-mono" aria-label="Client review link" readOnly value={reviewUrl(activeLink.token)} onFocus={(event) => event.target.select()} />
              <button type="button" className="bl-quiet" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
              <button type="button" className="bl-icon-button" aria-expanded={showSettings} aria-label="Review link settings" onClick={() => setShowSettings((value) => !value)}>
                <GearIcon />
              </button>
            </div>
            {copyError && <p role="alert" className="bl-error">{copyError}</p>}
            <p className="bl-guest-hint">Each project gets its own link. Opening it signs nobody in; guest access follows the safeguards shown below.</p>
            {showSettings && <div className="bl-link-settings-panel">
              <header><span className="bl-link-settings-icon" aria-hidden="true">↗</span><strong>Current link settings</strong><button type="button" onClick={() => setShowSettings(false)}>Done</button></header>
              <dl>
                <div><dt>Expires</dt><dd>{activeLink.expires_at ? new Date(activeLink.expires_at).toLocaleDateString() : "Never"}</dd></div>
                <div><dt>Passcode</dt><dd>{activeLink.has_passcode ? "Required" : "Not required"}</dd></div>
                <div><dt>Reviewer name</dt><dd>{activeLink.ask_reviewer_name ? "Required" : "Optional"}</dd></div>
                <div><dt>Domains</dt><dd>{activeLink.domain_restrictions?.length ? activeLink.domain_restrictions.join(", ") : "Any domain"}</dd></div>
                <div><dt>Guest export</dt><dd>{activeLink.comment_export_permission ? "Allowed" : "Not allowed"}</dd></div>
              </dl>
              <div className="bl-link-danger"><span><strong>Change or revoke this link</strong><small>Link safeguards are immutable. Create a replacement or revoke this address from the full manager.</small></span><Link to={`/w/${workspaceSlug}/p/${project.id}/share-links`} onClick={onClose}>Manage links</Link></div>
            </div>}
          </> : (
            <form className="bl-create-link" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
              <div className="bl-link-settings-header"><strong>Create a review link</strong><span>Install-free proxy mode</span></div>
              <label>Link expires<select className="bl-input" value={expiration} onChange={(event) => setExpiration(event.target.value as "never" | "7" | "30")}><option value="never">Never</option><option value="7">7 days</option><option value="30">30 days</option></select></label>
              <label>Passcode <span className="bl-optional">Optional</span><input className="bl-input" value={passcode} onChange={(event) => setPasscode(event.target.value)} autoComplete="new-password" /></label>
              <label>Allowed review domains <span className="bl-optional">Optional</span><input className="bl-input" placeholder="client.com, agency.com" value={domainRestrictionsStr} onChange={(event) => setDomainRestrictionsStr(event.target.value)} /><small>Comma-separated. The server enforces the reviewer’s request origin or referrer.</small></label>
              <label className="bl-setting-row compact"><span className="bl-setting-copy"><strong>Ask reviewers for a name</strong><span>Required before their first comment.</span></span><input className="bl-switch-input" type="checkbox" checked={askReviewerName} onChange={(event) => setAskReviewerName(event.target.checked)} /><span className="bl-switch" aria-hidden="true"><i /></span></label>
              <label className="bl-setting-row compact"><span className="bl-setting-copy"><strong>Allow comment export</strong><span>Guests may download the project’s client-visible comment export.</span></span><input className="bl-switch-input" type="checkbox" checked={commentExportPermission} onChange={(event) => setCommentExportPermission(event.target.checked)} /><span className="bl-switch" aria-hidden="true"><i /></span></label>
              {createMutation.isError && <p role="alert" className="bl-error">{createMutation.error.message}</p>}
              <button className="bl-button mint" disabled={createMutation.isPending}>{createMutation.isPending ? "Creating…" : "Create review link"}</button>
            </form>
          )}
        </section>
      </div>
      <footer className="bl-dialog-actions bl-dialog-actions-bordered"><button type="button" className="bl-quiet" onClick={onClose}>Done</button></footer>
    </Dialog>
  );
}
