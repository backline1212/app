import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Dialog } from "../../components/Dialog";
import { LoadingScreen } from "../../components/LoadingScreen";
import { EmptyArt } from "../../components/illustrations";
import { useToast } from "../../components/Toast";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useProject } from "../projects/use-project";
import * as shareLinksApi from "./api";
import type { ShareLinkOut } from "./api";

function reviewUrl(token: string): string {
  return `${window.location.origin}/review/${token}`;
}

// Full manager for every link a project has ever had (active and revoked), linked to
// from ShareProjectModal's "Manage all share links" and CollaboratorsModal. The modal
// only ever shows the single current active link; this page is where a team member
// creates a replacement, reviews history, or revokes access.
export function ShareLinksPage() {
  const { projectId, workspaceSlug } = useParams<{ projectId: string; workspaceSlug: string }>();
  const { data: project } = useProject(projectId);
  useDocumentTitle([project?.name, "Share Links"]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"snippet" | "proxy">("proxy");
  const [passcode, setPasscode] = useState("");
  const [askReviewerName, setAskReviewerName] = useState(true);
  const [domainRestrictionsStr, setDomainRestrictionsStr] = useState("");
  const [commentExportPermission, setCommentExportPermission] = useState(false);
  const [expiration, setExpiration] = useState<"never" | "7" | "30">("never");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  const [revokeCandidate, setRevokeCandidate] = useState<ShareLinkOut | null>(null);

  const linksQuery = useQuery({
    queryKey: qk.shareLinks(projectId ?? ""),
    queryFn: () => shareLinksApi.listShareLinks(projectId!),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      shareLinksApi.createShareLink(projectId!, {
        mode,
        passcode: passcode.trim() || undefined,
        askReviewerName,
        domainRestrictions: domainRestrictionsStr.split(",").map((domain) => domain.trim()).filter(Boolean),
        commentExportPermission,
        expiresAt: expiration === "never" ? undefined : new Date(Date.now() + Number(expiration) * 24 * 60 * 60 * 1000).toISOString(),
      }),
    onSuccess: async () => {
      setPasscode("");
      setDomainRestrictionsStr("");
      await queryClient.invalidateQueries({ queryKey: qk.shareLinks(projectId ?? "") });
      toast("Share link created.");
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Could not create share link.", "error");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (shareLinkId: string) => shareLinksApi.revokeShareLink(shareLinkId),
    onSuccess: async () => {
      setRevokeCandidate(null);
      await queryClient.invalidateQueries({ queryKey: qk.shareLinks(projectId ?? "") });
      toast("Share link revoked.");
    },
    onError: (err: unknown) => {
      toast(err instanceof Error ? err.message : "Could not revoke share link.", "error");
    },
  });

  async function copyLink(id: string, token: string) {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(reviewUrl(token));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopyError("Select the link and copy it manually.");
    }
  }

  const links = linksQuery.data ?? [];

  return (
    <main className="bl-wrap">
      <header className="bl-head">
        <div>
          <Link className="bl-quiet bl-back-link" to={`/w/${workspaceSlug}/p/${projectId}`}>
            ← Back to {project?.name || "project"}
          </Link>
          <h1>Share links</h1>
          <p>Every review link created for this project, active and revoked.</p>
        </div>
      </header>

      {linksQuery.isLoading && <LoadingScreen inline />}
      {linksQuery.isError && (
        <p role="alert" className="bl-error">
          {linksQuery.error instanceof Error ? linksQuery.error.message : "Share links could not load."}
        </p>
      )}

      {!linksQuery.isLoading && !linksQuery.isError && (
        links.length === 0 ? (
          <div className="bl-empty">
            <EmptyArt kind="links" />
            <h2>No share links yet</h2>
            <p>Create one below to let a client review this project without an account.</p>
          </div>
        ) : (
          <div className="bl-table-wrap">
            <table className="bl-table">
              <thead>
                <tr>
                  <th>Link</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {links.map((link) => {
                  const revoked = link.revoked_at !== null;
                  return (
                    <tr key={link.id}>
                      <td>
                        <span className="bl-mono">{link.token}</span>
                        {link.has_passcode && <small>Passcode required</small>}
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{link.mode}</td>
                      <td>
                        <span className={`bl-access-state${revoked ? "" : " is-on"}`}><i />{revoked ? "Revoked" : "Active"}</span>
                      </td>
                      <td>{link.expires_at ? new Date(link.expires_at).toLocaleDateString() : "Never"}</td>
                      <td>{new Date(link.created_at).toLocaleDateString()}</td>
                      <td style={{ textAlign: "right" }}>
                        {!revoked && (
                          <>
                            <button type="button" className="bl-quiet" onClick={() => copyLink(link.id, link.token)}>
                              {copiedId === link.id ? "Copied" : "Copy link"}
                            </button>{" "}
                            <button
                              type="button"
                              className="bl-quiet"
                              style={{ color: "var(--bl-error)", borderColor: "transparent" }}
                              onClick={() => setRevokeCandidate(link)}
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
      {copyError && <p role="alert" className="bl-error">{copyError}</p>}

      <section className="bl-attention bl-settings-section" style={{ marginTop: "25px" }}>
        <header>
          <h2>New share link</h2>
        </header>
        <form
          className="bl-create-link"
          style={{ flex: 1, margin: "20px" }}
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <label>
            Link type
            <select className="bl-input" value={mode} onChange={(event) => setMode(event.target.value as "snippet" | "proxy")}>
              <option value="proxy">Proxy (install-free)</option>
              <option value="snippet">Snippet (installed on the site)</option>
            </select>
          </label>
          <label>
            Link expires
            <select className="bl-input" value={expiration} onChange={(event) => setExpiration(event.target.value as "never" | "7" | "30")}>
              <option value="never">Never</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
          <label>
            Passcode <span className="bl-optional">Optional</span>
            <input className="bl-input" value={passcode} onChange={(event) => setPasscode(event.target.value)} autoComplete="new-password" />
          </label>
          <label>
            Allowed review domains <span className="bl-optional">Optional</span>
            <input
              className="bl-input"
              placeholder="client.com, agency.com"
              value={domainRestrictionsStr}
              onChange={(event) => setDomainRestrictionsStr(event.target.value)}
            />
            <small>Comma-separated. The server enforces the reviewer's request origin or referrer.</small>
          </label>
          <label className="bl-setting-row compact">
            <span className="bl-setting-copy"><strong>Ask reviewers for a name</strong><span>Required before their first comment.</span></span>
            <input className="bl-switch-input" type="checkbox" checked={askReviewerName} onChange={(event) => setAskReviewerName(event.target.checked)} />
            <span className="bl-switch" aria-hidden="true"><i /></span>
          </label>
          <label className="bl-setting-row compact">
            <span className="bl-setting-copy"><strong>Allow comment export</strong><span>Guests may download the project's client-visible comment export.</span></span>
            <input className="bl-switch-input" type="checkbox" checked={commentExportPermission} onChange={(event) => setCommentExportPermission(event.target.checked)} />
            <span className="bl-switch" aria-hidden="true"><i /></span>
          </label>
          {createMutation.isError && (
            <p role="alert" className="bl-error">
              {createMutation.error instanceof Error ? createMutation.error.message : "Could not create share link."}
            </p>
          )}
          <button className="bl-button mint" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create share link"}
          </button>
        </form>
      </section>

      {revokeCandidate && (
        <Dialog title="Revoke this share link?" onClose={() => setRevokeCandidate(null)}>
          <div className="bl-dialog-intro">
            <p>Anyone with this link immediately loses access to the review. This cannot be undone.</p>
          </div>
          {revokeMutation.isError && (
            <p role="alert" className="bl-error">
              {revokeMutation.error instanceof Error ? revokeMutation.error.message : "Could not revoke share link."}
            </p>
          )}
          <footer className="bl-dialog-actions bl-dialog-actions-bordered">
            <button type="button" className="bl-quiet" onClick={() => setRevokeCandidate(null)}>Cancel</button>
            <button
              type="button"
              className="bl-button danger"
              disabled={revokeMutation.isPending}
              onClick={() => revokeMutation.mutate(revokeCandidate.id)}
            >
              {revokeMutation.isPending ? "Revoking…" : "Revoke link"}
            </button>
          </footer>
        </Dialog>
      )}
    </main>
  );
}
