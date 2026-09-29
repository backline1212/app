import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { ComponentType, SVGProps } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { LoadingScreen } from "../../components/LoadingScreen";
import { EmptyArt } from "../../components/illustrations";
import { BoltIcon, BuildingIcon, CommentBubbleIcon, FolderIcon, LinkIcon, PersonIcon } from "../../components/icons";
import { qk } from "../../lib/query-keys";
import { useDocumentTitle } from "../../lib/use-document-title";
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
  "page.updated": "updated a page",
  "page.deleted": "deleted a page",
  "pages.reordered": "reordered the pages",
  "integration.connected": "connected an integration",
  "integration.disconnected": "disconnected an integration",
  "integration.ticket_created": "filed a tracker issue for",
  "guest_session.created": "opened a review link",
  "revision.created": "captured a new page version",
  "asset.created": "uploaded a file",
  "workspace.updated": "updated the workspace",
};

function eventPhrase(type: string) {
  return EVENT_PHRASES[type] ?? type.replace(/\./g, " ").replace(/_/g, " ");
}

function eventMeta(type: string) {
  return EVENT_META[type.split(".")[0]] ?? { icon: BoltIcon, color: "var(--bl-muted)" };
}

const FILTERS = ["mine", "clients", "deploys"];

export function ActivityPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle('Activity');
  const [params, setParams] = useSearchParams();
  const offset = Math.max(0, Number(params.get("offset")) || 0), filter = params.get("type") ?? "";
  const query = useQuery({ queryKey: qk.activityList(workspace.id, offset, filter), queryFn: () => listActivity(workspace.id, offset, filter) });
  const members = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => listMembers(workspace.id) });
  function page(value: number) { setParams({ type: filter, offset: String(value) }); }

  const groups = useMemo(() => {
    const result = new Map<string, Schemas["ActivityListOut"]["items"]>();
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
    return [...result.entries()];
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
        <button key={t} aria-pressed={filter === t} onClick={() => setParams({ type: t, offset: "0" })}>
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
            {events.map((event) => {
              const meta = eventMeta(event.type);
              const EventIcon = meta.icon;
              return (
                <article key={event.id}>
                  <span className="bl-avatar" style={{ background: meta.color }}>
                    <EventIcon width="14" height="14" style={{ color: 'var(--bl-invert-fg)' }} />
                  </span>
                  <div>
                    <p style={{ margin: 0 }}>
                      <strong>{members.data?.find((m) => m.user_id === event.actor_id)?.name ?? (event.actor_type === "system" ? "Backline" : event.actor_type === "guest" ? "Reviewer" : "Team member")}</strong>
                      {" " + eventPhrase(event.type)}
                      {event.name && <> <span className="bl-activity-obj">{event.name}</span></>}
                      {event.ticket_number != null && <> <span className="bl-tid">#{event.ticket_number}</span></>}
                      {event.comment_excerpt && <span className="bl-activity-excerpt"> “{event.comment_excerpt}”</span>}
                    </p>
                    {event.project_id &&
                      <Link className="bl-chip" to={`/w/${workspace.slug}/p/${event.project_id}/board${event.comment_id ? `?comment=${event.comment_id}` : ''}`}>
                        {event.comment_id ? "Open comment →" : "View project →"}
                      </Link>
                    }
                  </div>
                  <time dateTime={event.created_at}>
                    {new Date(event.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </time>
                </article>
              );
            })}
          </div>
        </section>
      )) : (
        <div className="bl-empty">
          <EmptyArt kind="activity" />
          <h2>No activity yet</h2>
          <p>Changes will appear here as your team works.</p>
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
