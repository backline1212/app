import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { nameInitials } from "../../lib/initials";
import { pastelColor } from "../../lib/pastel-color";
import { qk } from "../../lib/query-keys";
import { reviewTicketPath } from "../../lib/review-page-path";
import { ticketRef } from "../../lib/ticket-ref";
import { shortAgo } from "../../lib/time";
import { listTickets, type Ticket } from "../tickets/api";
import { projectPalette } from "./project-palette";

const SHOWN = 3;
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

// Highest priority first, newest first within a priority: the API's "urgent" order.
function byUrgency(a: Ticket, b: Ticket) {
  return PRIORITY_RANK[a.priority ?? "medium"] - PRIORITY_RANK[b.priority ?? "medium"] || b.created_at.localeCompare(a.created_at);
}

/**
 * design/index.html's .attention: the three most urgent threads owed a reply, together
 * with client feedback nobody has picked up (TDR-0208).
 */
export function WaitingOnYou({ workspaceId, workspaceSlug, openCount, emptyAction }: { workspaceId: string; workspaceSlug: string; openCount: number; emptyAction: ReactNode }) {
  const request = (view: "reply" | "new") => new URLSearchParams({ view, sort: "urgent", limit: String(SHOWN) });
  const attention = useQuery({ queryKey: qk.ticketsAttention(workspaceId), queryFn: () => listTickets(workspaceId, request("reply")) });
  const fresh = useQuery({ queryKey: qk.ticketsNewFromClients(workspaceId), queryFn: () => listTickets(workspaceId, request("new")) });
  const total = (attention.data?.total ?? 0) + (fresh.data?.total ?? 0);
  // One ticket can be in both lists; keep it once.
  const merged = new Map([...(attention.data?.items ?? []), ...(fresh.data?.items ?? [])].map((t) => [t.id, t]));
  const items = [...merged.values()].sort(byUrgency).slice(0, SHOWN);
  const base = `/w/${workspaceSlug}`;

  return (
    // Same footprint with threads or the empty state, so clearing the last one doesn't
    // shift the tabs and grid below it.
    <section className="bl-attention">
      <header>
        <h2>
          <svg className="bl-wait-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 01-9 8.4L3 21l1.1-8.9A8.4 8.4 0 1121 11.5z" /></svg>
          Waiting on you{total > 0 && <span className="bl-count bl-wait-count">{total}</span>}
        </h2>
        {openCount > 0 && <Link to={`${base}/tickets?open=1`}>See all {openCount} open thread{openCount === 1 ? "" : "s"} →</Link>}
      </header>
      {attention.isLoading || fresh.isLoading ? (
        <div className="bl-attention-empty" aria-hidden="true"><div className="bl-skeleton" style={{ height: 12, width: 240, borderRadius: 3 }} /></div>
      ) : attention.isError || fresh.isError ? (
        <p role="alert">Could not load items waiting on you. <button onClick={() => { void attention.refetch(); void fresh.refetch(); }}>Retry</button></p>
      ) : items.length > 0 ? (
        <ul className="bl-wait-list">
          {items.map((t) => {
            const author = t.author_name || "Someone";
            const pageName = reviewTicketPath(t.page_path) ?? t.page_title;
            return (
              <li key={t.id}>
                <span className="bl-wait-avatar" style={{ background: pastelColor(author) }} aria-hidden="true">{nameInitials(author)}</span>
                <div className="bl-wait-body">
                  <p className="bl-wait-meta"><b>{author}</b><time dateTime={t.created_at} title={new Date(t.created_at).toLocaleString()}>{shortAgo(t.created_at)}</time></p>
                  <p className="bl-wait-text">{t.body}</p>
                  <p className="bl-wait-where">
                    <i style={{ background: projectPalette({ id: t.project_id, name: t.project_name }).palette.accent }} aria-hidden="true" />
                    <Link to={`${base}/p/${t.project_id}`}>{t.project_name}</Link>
                    <span aria-hidden="true">·</span>
                    {t.is_standalone && !t.page_path
                      ? <span>Team ticket</span>
                      : <Link to={`${base}/p/${t.project_id}?page=${encodeURIComponent(t.page_id)}`}>{pageName}</Link>}
                    <span aria-hidden="true">·</span>
                    <Link to={`${base}/tickets?comment=${t.id}&project_id=${t.project_id}`} aria-label={`Open ticket ${ticketRef(t)}`}>{ticketRef(t)}</Link>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="bl-attention-empty">
          <p>Client feedback that needs an owner, and threads waiting on your reply, show up here.</p>
          {emptyAction}
        </div>
      )}
    </section>
  );
}
