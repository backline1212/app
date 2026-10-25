import { StatusBadge } from "@backline/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { LoadingScreen } from "../../components/LoadingScreen";
import { qk } from "../../lib/query-keys";
import { redactReviewUrl } from "../../lib/review-page-path";
import { ticketRef } from "../../lib/ticket-ref";
import { useDocumentTitle } from "../../lib/use-document-title";
import { isClosed } from "../../lib/workflow";
import { listAssets } from "../assets/api";
import { listClients } from "../clients/api";
import { listProjectComments, type CommentOut } from "../board/api";
import { listPages } from "../projects/api";
import { useProject } from "../projects/use-project";
import type { WorkspaceOut } from "../workspaces/api";

type StatusFilter = "all" | "open" | "closed";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A printable summary of a project's feedback - what an agency sends a client after a
 * review round. Filters live in the URL; "Print or save as PDF" uses the browser's own
 * print dialog. Client-visible threads only unless the team asks for team notes too.
 */
export function ReviewReportPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const status: StatusFilter = params.get("status") === "open" || params.get("status") === "closed" ? params.get("status") as StatusFilter : "all";
  const includeTeam = params.get("team") === "1";
  const showReplies = params.get("replies") !== "0";

  const project = useProject(projectId);
  const comments = useQuery({ queryKey: qk.projectComments(projectId), queryFn: () => listProjectComments(projectId), enabled: Boolean(projectId) });
  const website = (project.data?.project_type ?? "website") === "website";
  const pages = useQuery({ queryKey: qk.projectPages(projectId), queryFn: ({ signal }) => listPages(projectId, signal), enabled: Boolean(projectId) && website });
  const clients = useQuery({ queryKey: qk.clients(workspace.id), queryFn: () => listClients(workspace.id), enabled: Boolean(project.data?.client_id) });
  const clientName = clients.data?.find((client) => client.id === project.data?.client_id)?.name;
  const assets = useQuery({ queryKey: qk.assetsList(projectId, "member"), queryFn: () => listAssets(projectId), enabled: Boolean(project.data) && !website });
  useDocumentTitle([project.data?.name, "Review report"]);

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  }

  if (project.isLoading || comments.isLoading) return <LoadingScreen label="Preparing the report" />;
  if (project.error || comments.error || !project.data) {
    return <main className="bl-report"><p className="bl-error" role="alert">{(project.error ?? comments.error)?.message ?? "This project could not be loaded."}</p></main>;
  }

  const all = comments.data ?? [];
  const threads = all.filter((c) => !c.parent_id && (includeTeam || c.layer === "client"));
  const shown = threads.filter((c) => status === "all" || (status === "open" ? !isClosed(c.status) : isClosed(c.status)));
  const replies = (id: string) => all.filter((c) => c.parent_id === id && (includeTeam || c.layer === "client")).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pageName = (pageId: string): string => {
    const asset = assets.data?.find((a) => a.page_id === pageId);
    if (asset) return asset.version && asset.version > 1 ? `${asset.filename} (v${asset.version})` : asset.filename;
    const page = pages.data?.find((p) => p.id === pageId);
    if (page) return page.title?.trim() || redactReviewUrl(page.url_normalized);
    return "Other feedback";
  };
  const groups = new Map<string, CommentOut[]>();
  for (const thread of [...shown].sort((a, b) => (a.ticket_number ?? 0) - (b.ticket_number ?? 0))) {
    const key = thread.page_id ?? "";
    groups.set(key, [...(groups.get(key) ?? []), thread]);
  }
  const openCount = threads.filter((c) => !isClosed(c.status)).length;

  return (
    <main className="bl-report">
      <div className="bl-report-controls" aria-label="Report options">
        <Link className="bl-quiet" to={`/w/${workspace.slug}/p/${projectId}`}>← Back to review</Link>
        <label>Show
          <select value={status} onChange={(e) => update("status", e.target.value === "all" ? null : e.target.value)}>
            <option value="all">All feedback</option>
            <option value="open">Open only</option>
            <option value="closed">Resolved only</option>
          </select>
        </label>
        <label><input type="checkbox" checked={showReplies} onChange={(e) => update("replies", e.target.checked ? null : "0")} /> Replies</label>
        <label><input type="checkbox" checked={includeTeam} onChange={(e) => update("team", e.target.checked ? "1" : null)} /> Team-only notes</label>
        <button type="button" className="bl-button" onClick={() => window.print()}>Print or save as PDF</button>
        {includeTeam && <p className="bl-report-warn" role="status">Team-only notes are included. Don't send this version to the client.</p>}
      </div>

      <header className="bl-report-head">
        <p className="bl-report-eyebrow">{workspace.name} · Review report</p>
        <h1>{project.data.name}</h1>
        <p className="bl-report-meta">
          {clientName ? `${clientName} · ` : ""}{formatDate(new Date().toISOString())}
        </p>
        <dl className="bl-report-stats">
          <div><dt>Feedback</dt><dd>{threads.length}</dd></div>
          <div><dt>Open</dt><dd>{openCount}</dd></div>
          <div><dt>Resolved</dt><dd>{threads.length - openCount}</dd></div>
        </dl>
      </header>

      {shown.length === 0 ? (
        <p className="bl-report-empty">No feedback matches these options.</p>
      ) : [...groups.entries()].map(([pageId, items]) => (
        <section key={pageId} className="bl-report-page">
          <h2>{pageName(pageId)} <span>{items.length}</span></h2>
          {items.map((thread) => {
            const threadReplies = showReplies ? replies(thread.id) : [];
            return (
              <article key={thread.id} className="bl-report-item">
                <header>
                  <strong>{ticketRef(thread)}</strong>
                  <StatusBadge status={thread.status} />
                  {thread.layer === "team" && <span className="bl-chip">Team only</span>}
                  {(thread.tags ?? []).map((tag) => <span key={tag} className="bl-chip">{tag}</span>)}
                  <span className="bl-report-by">{thread.author_name} · {formatDate(thread.created_at)}</span>
                </header>
                <p className="bl-report-body">{thread.body}</p>
                {thread.screenshot_url && <img className="bl-report-shot" src={thread.screenshot_url} alt={`Screenshot for ${ticketRef(thread)}`}
                  onError={(event) => { event.currentTarget.hidden = true; }} />}
                {thread.attachments.length > 0 && (
                  <p className="bl-report-files">Attachments: {thread.attachments.map((a) => a.filename).join(", ")}</p>
                )}
                {threadReplies.length > 0 && (
                  <ol className="bl-report-replies">
                    {threadReplies.map((reply) => (
                      <li key={reply.id}><b>{reply.author_name}</b> · {formatDate(reply.created_at)}<p>{reply.body}</p></li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
        </section>
      ))}
    </main>
  );
}
