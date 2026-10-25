import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ComponentType, SVGProps } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { LoadingScreen } from "../../components/LoadingScreen";
import { EmptyArt } from "../../components/illustrations";
import { BoltIcon, BuildingIcon, CommentBubbleIcon, FolderIcon, LinkIcon, PersonIcon } from "../../components/icons";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
import { listProjects } from "../projects/api";
import { listMembers } from "../workspaces/api";
import type { WorkspaceOut } from "../workspaces/api";
import { listActivity } from "./api";
import type { Schemas } from "@backline/types";

// One badge colour per event category (same "small local colour map" convention
// PRIORITY_META/STATUS_META use in the comments panel), so the timeline reads at a
// glance instead of every row carrying an identical grey dot.
const EVENT_META: Record<string, { icon: ComponentType<SVGProps<SVGSVGElement>>; color: string }> = {
  comment: { icon: CommentBubbleIcon, color: "var(--badge-blue)" },
  project: { icon: FolderIcon, color: "var(--badge-green)" },
  client: { icon: BuildingIcon, color: "var(--badge-red)" },
  share_link: { icon: LinkIcon, color: "var(--badge-purple)" },
  member: { icon: PersonIcon, color: "var(--badge-yellow)" },
};

// What the actor did, as a phrase. Unlisted types fall back to the raw event name, so a
// new backend event still shows up rather than vanishing.
const EVENT_PHRASES: Record<string, string> = {
  "comment.created": "commented",
  "comment.updated": "updated",
  "comment.status_changed": "changed the status of",
  "comment.deleted": "deleted",
  "comment.layer_changed": "changed who can see",
  "comment.recovery_updated": "re-pinned",
  "anchor.manually_reassigned": "moved the pin of",
  "project.created": "created the project",
  "project.updated": "updated the project",
  "project.settings_updated": "changed the settings of",
  "project.archived": "archived the project",
  "project.restored": "restored the project",
  "project.duplicated": "duplicated the project",
  "client.created": "added the client",
  "client.updated": "updated the client",
  "client.restored": "restored the client",
  "share_link.created": "created a share link",
  "share_link.revoked": "revoked a share link",
  "member.invited": "invited",
  "member.removed": "removed",
  "member.role_changed": "changed the role of",
  "page.created": "added a page",
  "page.registered": "added a page",
  "page.updated": "updated a page",
  "page.deleted": "deleted a page",
  "pages.reordered": "reordered the pages",
  "integration.connected": "connected an integration",
  "integration.disconnected": "disconnected an integration",
  "integration.ticket_created": "filed a tracker issue for",
  "guest_session.created": "opened the review link",
  "revision.created": "captured a new page version",
  "asset.created": "uploaded a file",
  "asset.approved": "approved a file",
  "asset.approval_withdrawn": "withdrew approval of a file",
  "workspace.updated": "updated the workspace",
};

type ActivityItem = Schemas["ActivityListOut"]["items"][number];

function eventPhrase(event: ActivityItem) {
  if (event.is_reply && event.type === "comment.created") return "replied on";
  return EVENT_PHRASES[event.type] ?? event.type.replace(/\./g, " ").replace(/_/g, " ");
}

// Back-to-back repeats of the same thing by the same person on the same project
// (a client reopening a review link five times) read as one row with a count.
function collapseRepeats(events: ActivityItem[]): { event: ActivityItem; count: number }[] {
  const rows: { event: ActivityItem; count: number }[] = [];
  for (const event of events) {
    const last = rows[rows.length - 1];
    if (last && !event.comment_id && !event.name && last.event.type === event.type && last.event.actor_id === event.actor_id && last.event.project_id === event.project_id && !last.event.comment_id && !last.event.name) last.count += 1;
    else rows.push({ event, count: 1 });
  }
  return rows;
}

function eventMeta(type: string) {
  return EVENT_META[type.split(".")[0]] ?? { icon: BoltIcon, color: "var(--bl-muted)" };
}

const FILTERS = ["mine", "clients", "deploys"];

export function ActivityPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle([workspace.name, 'Activity']);
  const [params, setParams] = useSearchParams();
  const offset = Math.max(0, Number(params.get("offset")) || 0), filter = params.get("type") ?? "";
  const query = useQuery({ queryKey: qk.activityList(workspace.id, offset, filter), queryFn: () => listActivity(workspace.id, offset, filter) });
  const members = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => listMembers(workspace.id) });
  const projects = useQuery({ queryKey: qk.projects(workspace.id), queryFn: () => listProjects(workspace.id, true) });
  function page(value: number) { setParams({ type: filter, offset: String(value) }); }

  const groups = useMemo(() => {
    const result = new Map<string, ActivityItem[]>();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;

    for (const event of query.data?.items ?? []) {
      const ts = new Date(event.created_at).getTime();
      let label = "Earlier";
      if (ts >= today) label = "Today";
      else if (ts >= yesterday) label = "Yesterday";
      result.set(label, [...(result.get(label) ?? []), event]);
    }
    return [...result.entries()].map(([label, events]) => [label, collapseRepeats(events)] as const);
  }, [query.data?.items]);

  return <main className="bl-wrap">
    <header className="bl-head">
      <div>
        <h1>Activity</h1>
        <p>What changed across your workspace.</p>
      </div>
    </header>

    <div className="bl-tabs">
      <button aria-pressed={filter === ""} onClick={() => setParams({ type: "", offset: "0" })}>Everything</button>
      {FILTERS.map((t) =>
        <button key={t} aria-pressed={filter === t} title={t === "clients" ? "What clients did on review links, and changes to client records" : undefined} onClick={() => setParams({ type: t, offset: "0" })}>
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      )}
    </div>

    {query.isLoading && <LoadingScreen inline />}
    {query.error && <p role="alert" className="bl-error">{query.error.message}</p>}

    {!query.isLoading && !query.error && (
      groups.length > 0 ? groups.map(([date, events]) => (
        <section key={date}>
          <h2 className="bl-group-title">{date}</h2>
          <div className="bl-activity" style={{ marginBottom: '20px' }}>
            {events.map(({ event, count }) => {
              const meta = eventMeta(event.type);
              const project = projects.data?.find((p) => p.id === event.project_id);
              const EventIcon = meta.icon;
              return (
                <article key={event.id}>
                  <span className="bl-avatar" style={{ background: meta.color }}>
                    <EventIcon width="14" height="14" style={{ color: 'var(--bl-invert-fg)' }} />
                  </span>
                  <div>
                    <p style={{ margin: 0 }}>
                      <strong>{members.data?.find((m) => m.user_id === event.actor_id)?.name ?? (event.actor_type === "system" ? "Backline" : event.actor_type === "guest" ? event.actor_name ?? "A client" : "Team member")}</strong>
                      {event.actor_type === "guest" && <span className="bl-activity-role">Client</span>}
                      {" " + eventPhrase(event)}
                      {event.name && <> <span className="bl-activity-obj">{event.name}</span></>}
                      {event.ticket_number != null && <> <span className="bl-tid">#{event.ticket_number}</span></>}
                      {event.comment_excerpt && <span className="bl-activity-excerpt"> “{event.comment_excerpt}”</span>}
                      {project && !event.type.startsWith("project.") && <span className="bl-activity-in"> in {project.name}</span>}
                      {count > 1 && <span className="bl-activity-count"> ×{count}</span>}
                    </p>
                    {event.project_id && (() => {
                      // An archived project can't be opened (its card has no link either),
                      // so point at the Archived list, where it can be restored; a deleted
                      // one has nowhere to go. Until projects load, keep the normal link.
                      if (projects.data && !project) return <span className="bl-chip">Project deleted</span>;
                      if (project?.archived_at) return <Link className="bl-chip" to={`/w/${workspace.slug}?archived=true`}>Project archived →</Link>;
                      return (
                        <Link className="bl-chip" to={`/w/${workspace.slug}/p/${event.project_id}/board${event.comment_id ? `?comment=${event.comment_id}` : ''}`}>
                          {event.comment_id ? "Open ticket →" : "View project →"}
                        </Link>
                      );
                    })()}
                  </div>
                  <time dateTime={event.created_at} title={new Date(event.created_at).toLocaleString()}>
                    {/* "Earlier" spans every older day, so its rows need the date as well. */}
                    {date === "Earlier"
                      ? new Date(event.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                      : new Date(event.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </time>
                </article>
              );
            })}
          </div>
        </section>
      )) : (
        <div className="bl-empty">
          <EmptyArt kind={filter ? "search" : "activity"} />
          <h2>{filter ? "Nothing here" : "No activity yet"}</h2>
          <p>{filter ? "Nothing in this workspace matches this filter yet." : "Changes will appear here as your team works."}</p>
          {filter && <button type="button" className="bl-quiet" onClick={() => setParams({ type: "", offset: "0" })}>Show everything</button>}
        </div>
      )
    )}

    {query.data && query.data.total > 50 &&
      <div className="bl-pagination">
        <button disabled={offset === 0} onClick={() => page(Math.max(0, offset - 50))}>Previous</button>
        <span>{offset + 1}–{Math.min(offset + 50, query.data.total)} of {query.data.total}</span>
        <button disabled={offset + 50 >= query.data.total} onClick={() => page(offset + 50)}>Next</button>
      </div>
    }
  </main>;
}
