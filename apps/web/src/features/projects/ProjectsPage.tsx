import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "../../lib/use-document-title";
import { useAuth } from "../auth/AuthContext";
import { qk } from "../../lib/query-keys";
import { timeAgo } from "../../lib/time";
import { useOnClickOutside } from "../../lib/use-click-outside";
import { STATUS_COLORS, STATUS_LABELS } from "../../lib/workflow";
import { listClients } from "../clients/api";
import { getDashboard, listTickets } from "../tickets/api";
import { NewTicket } from "../tickets/components/NewTicket";
import { listMembers } from "../workspaces/api";
import { ShareProjectModal } from "../workspaces/ShareProjectModal";
import type { WorkspaceOut } from "../workspaces/api";
import * as api from "./api";
import { ProjectForm } from "./ProjectForm";
import { ProjectMenu } from "./ProjectMenu";
import { ProjectPagesModal } from "./ProjectPagesModal";
import { ComingSoonModal } from "../workspaces/ComingSoonModal";
import { PlusIcon, SearchIcon } from "../../components/icons";

const TYPE_LABELS: Record<string, string> = { website: "Website", image: "Images", pdf: "PDF" };

const BAR_STATUSES = ["todo", "in_progress", "in_review", "blocked", "wont_fix"] as const;

interface PickerOption { id: string; label: string; sub: string }

// Shared popover for both Sort and Layout: a labeled trigger + a panel of
// options, each with a one-line "what this means" caption and a checkmark on the
// active one - replaces the plain native <select>s the mockup's own richer pickers
// were modeled on.
function Picker({ label, icon, options, value, onChange }: { label: string; icon: React.ReactNode; options: readonly PickerOption[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false));
  const active = options.find((o) => o.id === value);
  return (
    <div className="bl-dropdown" ref={ref} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <button type="button" className="bl-dropdown-trigger labeled" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {icon}{active?.label ?? label}
      </button>
      {open && (
        <div role="menu" className="bl-dropdown-pop" aria-label={label}>
          <p className="bl-dropdown-label">{label}</p>
          {options.map((o) => (
            <button key={o.id} type="button" role="menuitemradio" aria-checked={o.id === value} className="bl-dropdown-item" onClick={() => { onChange(o.id); setOpen(false); }}>
              <span className="stack">{o.label}<small>{o.sub}</small></span>
              <span className="tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5" /></svg></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SORT_ICON = <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18M7 12h10M11 18h2" /></svg>;
const VIEW_ICONS: Record<string, React.ReactNode> = {
  cards: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
  compact: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="3" y="3" width="4.5" height="4.5" rx="1" /><rect x="10" y="3" width="4.5" height="4.5" rx="1" /><rect x="17" y="3" width="4.5" height="4.5" rx="1" /><rect x="3" y="10" width="4.5" height="4.5" rx="1" /><rect x="10" y="10" width="4.5" height="4.5" rx="1" /><rect x="17" y="10" width="4.5" height="4.5" rx="1" /></svg>,
  list: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>,
  table: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 10h18M3 15h18M10 4v16" /></svg>,
};

const PREVIEW_PALETTES = [
  { accent: "#69DEB2", accentSoft: "#CFF4E5", ink: "#17342A", paper: "#F5FAF7" },
  { accent: "#E8B833", accentSoft: "#F7E8B8", ink: "#302A18", paper: "#FCFAF2" },
  { accent: "#7C6BE8", accentSoft: "#DED9FF", ink: "#25233A", paper: "#F8F7FF" },
  { accent: "#5B7FA6", accentSoft: "#DCE8F1", ink: "#162B3D", paper: "#F5F9FC" },
] as const;

function paletteFor(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return PREVIEW_PALETTES[hash % PREVIEW_PALETTES.length]!;
}

function ProjectArtwork({ project }: { project: api.ProjectOut }) {
  const palette = paletteFor(project.id || project.name);
  const type = project.project_type ?? "website";
  const initial = project.name.trim()[0]?.toUpperCase() ?? "?";
  // target_origin gives every website project one real, project-specific asset for
  // free: its own favicon. No per-project screenshot capture exists yet (that's a
  // real headless-browser render, see browser_render/ - too heavy to fire for every
  // card in a grid), so rather than fake a live preview this hero shows the site's
  // actual icon on a palette-tinted ground, falling back to the project's initial if
  // the origin can't be parsed or the site has no favicon / blocks hotlinking.
  const [faviconFailed, setFaviconFailed] = useState(false);
  let hostname: string | null = null;
  try { hostname = new URL(project.target_origin).hostname; } catch { hostname = null; }
  const faviconUrl = hostname ? `https://${hostname}/favicon.ico` : null;

  return (
    <div className={`bl-project-art bl-project-art-${type}`} aria-hidden="true">
      {project.hero_url ? (
        <img src={project.hero_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : type === "website" ? (
        <div className="bl-project-hero" style={{ background: `radial-gradient(circle at 30% 22%, ${palette.accentSoft}, ${palette.paper} 70%)` }}>
          {faviconUrl && !faviconFailed ? (
            <img key={faviconUrl} src={faviconUrl} alt="" className="bl-project-hero-favicon" onError={() => setFaviconFailed(true)} />
          ) : (
            <span className="bl-project-hero-initial" style={{ background: palette.accent, color: palette.ink }}>{initial}</span>
          )}
        </div>
      ) : null}
      {type === "image" && (
        <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
          <rect width="320" height="180" fill={palette.paper} />
          <rect x="18" y="18" width="136" height="70" rx="3" fill={palette.accent} />
          <path d="M18 72 53 44l31 23 24-18 46 34v5H18Z" fill={palette.ink} opacity=".22" />
          <circle cx="125" cy="38" r="9" fill="var(--bl-art-panel)" opacity=".65" />
          <rect x="166" y="18" width="136" height="70" rx="3" fill={palette.ink} />
          <rect x="184" y="37" width="75" height="7" rx="3" fill="var(--bl-art-panel)" opacity=".38" />
          <rect x="184" y="52" width="51" height="7" rx="3" fill="var(--bl-art-panel)" opacity=".24" />
          <rect x="184" y="68" width="42" height="11" rx="2" fill={palette.accent} />
          <rect x="18" y="100" width="86" height="62" rx="3" fill={palette.accentSoft} />
          <rect x="116" y="100" width="86" height="62" rx="3" fill="var(--bl-art-line-light)" />
          <rect x="214" y="100" width="88" height="62" rx="3" fill="var(--bl-art-panel)" />
          <circle cx="159" cy="131" r="16" fill={palette.ink} opacity=".2" />
        </svg>
      )}
      {type === "pdf" && (
        <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
          <rect width="320" height="180" fill="var(--bl-art-bg)" />
          <rect x="40" y="12" width="108" height="156" rx="2" fill="var(--bl-art-panel)" stroke="var(--bl-art-stroke)" />
          <rect x="54" y="29" width="58" height="8" rx="2" fill={palette.ink} />
          <rect x="54" y="47" width="79" height="4" rx="2" fill="var(--bl-art-ink-dark)" />
          <rect x="54" y="57" width="65" height="4" rx="2" fill="var(--bl-art-ink-dark)" />
          <rect x="54" y="75" width="80" height="40" rx="2" fill={palette.accentSoft} />
          <rect x="54" y="127" width="70" height="4" rx="2" fill="var(--bl-art-ink-dark)" />
          <rect x="172" y="12" width="108" height="156" rx="2" fill="var(--bl-art-panel)" stroke="var(--bl-art-stroke)" />
          <rect x="186" y="29" width="66" height="7" rx="2" fill={palette.ink} />
          <rect x="186" y="51" width="80" height="65" rx="2" fill={palette.paper} />
          <rect x="197" y="86" width="12" height="21" fill={palette.accent} opacity=".55" />
          <rect x="216" y="72" width="12" height="35" fill={palette.accent} opacity=".75" />
          <rect x="235" y="59" width="12" height="48" fill={palette.accent} />
          <rect x="186" y="130" width="67" height="4" rx="2" fill="var(--bl-art-ink-dark)" />
        </svg>
      )}

    </div>
  );
}

export function ProjectsPage() {
  const { workspace } = useOutletContext<{ workspace: WorkspaceOut }>();
  useDocumentTitle(`${workspace.name} — Projects`);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [createType, setCreateType] = useState<"website" | "image" | "pdf" | null>(null);
  const [share, setShare] = useState<api.ProjectOut | null>(null);
  const [edit, setEdit] = useState<api.ProjectOut | null>(null);
  const [managePages, setManagePages] = useState<api.ProjectOut | null>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [comingSoonFeature, setComingSoonFeature] = useState<string | null>(null);
  const archived = params.get("archived") === "true", search = params.get("search") ?? "", type = params.get("type") ?? "all", view = params.get("display") ?? "cards", sort = params.get("sort") ?? "activity";
  // Live clock (ticks every minute) so the greeting's time-of-day and the head's
  // date/time readout are never more than a minute stale - always the viewer's own
  // local time, so it already reads correctly for whatever timezone they're in.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  function filter(key: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next); }
  const projects = useQuery({ queryKey: qk.projects(workspace.id), queryFn: () => api.listProjects(workspace.id, true) });
  const clients = useQuery({ queryKey: qk.clients(workspace.id), queryFn: () => listClients(workspace.id) });
  const members = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => listMembers(workspace.id) });
  const summary = useQuery({ queryKey: qk.dashboard(workspace.id), queryFn: () => getDashboard(workspace.id) });
  const attention = useQuery({ queryKey: qk.ticketsAttention(workspace.id), queryFn: () => listTickets(workspace.id, new URLSearchParams({ view: "reply", limit: "3" })) });
  const stats = useMemo(() => new Map(summary.data?.project_stats.map((s) => [s.project_id, s]) ?? []), [summary.data]);
  const visible = useMemo(() => (projects.data ?? []).filter((p) => Boolean(p.archived_at) === archived && (type === "all" || (p.project_type ?? "website") === type) && (!params.get("client") || p.client_id === params.get("client")) && `${p.name} ${p.target_origin}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "open" ? (stats.get(b.id)?.open ?? 0) - (stats.get(a.id)?.open ?? 0) : sort === "added" ? b.created_at.localeCompare(a.created_at) : (stats.get(b.id)?.last_activity_at ?? b.updated_at).localeCompare(stats.get(a.id)?.last_activity_at ?? a.updated_at)), [projects.data, archived, type, params, search, sort, stats]);

  // The landing state only (no search/type/archived filter active) gets the live
  // greeting; once someone is filtering or searching, a plain, functional heading
  // ("Results for …", "Archived projects") is more useful than "Good morning" again.
  const firstName = user?.name.trim().split(/\s+/)[0];
  const hour = now.getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const headline = archived ? "Archived projects" : search ? `Results for "${search}"` : type !== "all" ? `${TYPE_LABELS[type] ?? "Projects"} projects` : firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;
  const needsReply = summary.data?.needs_reply ?? 0;
  const fullyResolved = (projects.data ?? []).filter((p) => !p.archived_at && (stats.get(p.id)?.total ?? 0) > 0 && stats.get(p.id)?.resolved === stats.get(p.id)?.total).map((p) => p.name);

  function projectCard(p: api.ProjectOut) {
    const s = stats.get(p.id);
    const total = s?.total ?? 0, open = s?.open ?? 0, resolved = s?.resolved ?? 0;
    const isWebsite = (p.project_type ?? "website") === "website";
    const destination = `/w/${workspace.slug}/p/${p.id}`;
    const displayUrl = isWebsite ? p.target_origin.replace(/^https?:\/\//, "") : p.project_type === "pdf" ? "PDF document" : "Image set";
    return <article key={p.id} className={`bl-project ${p.archived_at ? "archived" : ""}`}>
      <div className="bl-project-preview">
        <ProjectArtwork project={p} />
        <div className="bl-browser"><span aria-hidden="true"><i /><i /><i /></span><span>{displayUrl}</span></div>
        <span className="bl-preview-type">{p.project_type ?? "website"} · illustration</span>
        {!p.archived_at && <Link className="bl-project-preview-link" to={destination} aria-label={`Open ${p.name}`} />}
        {!p.archived_at && view === "cards" && (
          <div className="bl-project-overlay">
            <div className="bl-project-overlay-actions">
              <button type="button" aria-label={`Share ${p.name}`} onClick={() => setShare(p)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="3.5"/><path d="M19 8v6M22 11h-6"/></svg></button>
              <button type="button" aria-label={`Open ${p.name} settings`} onClick={() => setEdit(p)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/></svg></button>
            </div>
            <Link className="bl-project-overlay-open" to={destination}>Open project <span>↗</span></Link>
            <span className="bl-project-overlay-url">{displayUrl}</span>
          </div>
        )}
      </div>
      <div className="bl-project-body">
        <div className="bl-project-title">{p.archived_at ? <h2>{p.name}</h2> : <Link to={destination}><h2>{p.name}</h2></Link>}<span className={`bl-chip ${p.archived_at ? "" : (p.environment ?? "live")}`}>{!p.archived_at && (p.environment ?? "live") === "live" && <i className="bl-live-dot" aria-hidden="true" />}{p.archived_at ? "Archived" : p.environment ?? "live"}</span></div>
        <p className="bl-project-url">{displayUrl}</p>
        {total > 0 && (
          <div className="bl-project-bar" role="img" aria-label={`${resolved} of ${total} comments resolved`}>
            {BAR_STATUSES.map((k) => (s?.status_counts?.[k] ?? 0) > 0 && <i key={k} style={{ flex: s?.status_counts?.[k] ?? 0, background: STATUS_COLORS[k] }} />)}
            {resolved > 0 && <i style={{ flex: resolved, background: STATUS_COLORS.resolved }} />}
          </div>
        )}
        <div className="bl-project-stats"><Link to={`/w/${workspace.slug}/tickets?project_id=${p.id}`}><strong>{open}</strong> open</Link><span><strong>{resolved}</strong> resolved</span><small>{timeAgo(s?.last_activity_at ?? p.updated_at)}</small></div>
      </div>
      <footer className="bl-project-actions">
        <span className="bl-project-client">{clients.data?.find((c) => c.id === p.client_id)?.name ?? "Internal project"}</span>
        <ProjectMenu project={p} workspaceSlug={workspace.slug} onShare={() => setShare(p)} onSettings={() => setEdit(p)} onManagePages={isWebsite ? () => setManagePages(p) : undefined} />
      </footer>
    </article>;
  }

  return <>
    <main className="bl-wrap">
      <header className="bl-head">
        <div><h1>{headline}</h1><p>{archived ? "Finished for now. Restore a project to review it again." : search ? `${visible.length} result${visible.length === 1 ? "" : "s"} for "${search}".` : type !== "all" ? `Every ${(TYPE_LABELS[type] ?? "project").toLowerCase()} review, all in one place.` : <>{needsReply > 0 ? <><b>{needsReply} comment{needsReply === 1 ? "" : "s"}</b> {needsReply === 1 ? "is" : "are"} waiting on a reply from you</> : <><b>Nothing</b> is waiting on a reply from you</>}{fullyResolved.length > 0 ? `, and ${fullyResolved.join(" and ")} ${fullyResolved.length === 1 ? "has" : "have"} been fully resolved.` : "."}</>}</p></div>
        <div className="bl-head-actions">
          <time className="bl-mono bl-head-clock">{now.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }).toUpperCase()}<br />{now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time>
        </div>
      </header>

      {/* Same footprint whether it's holding real threads or the empty state, so
          clearing your last reply-owed comment doesn't shift the tabs/grid below it. */}
      {!archived && (
        <section className="bl-attention">
          <header>
            <h2>Waiting on you{(attention.data?.total ?? 0) > 0 && <span className="bl-count">{attention.data?.total}</span>}</h2>
            {(attention.data?.total ?? 0) > 0 && <Link to={`/w/${workspace.slug}/tickets?view=reply`}>View all →</Link>}
          </header>
          {attention.isLoading ? (
            <div className="bl-attention-empty" aria-hidden="true"><div className="bl-skeleton" style={{ height: 12, width: 240, borderRadius: 3 }} /></div>
          ) : attention.isError ? (<p role="alert">Could not load items waiting on you. <button onClick={() => void attention.refetch()}>Retry</button></p>) : (attention.data?.items.length ?? 0) > 0 ? (
            <div>{attention.data?.items.map((t) => <Link key={t.id} to={`/w/${workspace.slug}/tickets?ticket=${t.id}&project_id=${t.project_id}`}><small>{t.project_name} · {t.page_title}</small><strong>{t.body}</strong><span>{t.author_name} · {timeAgo(t.created_at)}</span></Link>)}</div>
          ) : (
            <div className="bl-attention-empty">
              <p>Tickets and comments waiting on your reply will show up here.</p>
              <button type="button" className="bl-quiet" onClick={() => setShowNewTicket(true)}><PlusIcon /> New ticket</button>
            </div>
          )}
        </section>
      )}

      <div className="bl-tabs" aria-label="Project types">{[['all', 'All projects'], ['website', 'Website'], ['image', 'Images'], ['pdf', 'PDF']].map(([key, label]) => <button key={key} aria-pressed={type === key} onClick={() => filter("type", key)}>{label}<span className="bl-count">{(projects.data ?? []).filter((p) => Boolean(p.archived_at) === archived && (key === "all" || (p.project_type ?? "website") === key)).length}</span></button>)}<button type="button" onClick={() => setComingSoonFeature("Web App projects")}>Web App <small>Soon</small></button><button type="button" onClick={() => setComingSoonFeature("Mobile projects")}>Mobile <small>Soon</small></button></div>

      {/* One search-styled control on this screen, not two: this is the "filter the
          visible grid" input; the omnisearch in the persistent topbar (⌘K) is the
          different, more powerful "find anything in this workspace" one. */}
      <div className="bl-toolbar wrap">
        <span className="bl-mono">{visible.length} PROJECTS</span>{(search || type !== "all" || params.get("client")) && <button className="bl-quiet" onClick={() => { const next = new URLSearchParams(params); ["search", "type", "client"].forEach((key) => next.delete(key)); setParams(next); }}>Clear filters</button>}
        <label className="bl-search"><span className="bl-search-icon" aria-hidden="true"><SearchIcon /></span><input aria-label="Filter projects" placeholder="Filter by name or URL…" value={search} onChange={(e) => filter("search", e.target.value)} /></label>
        <select aria-label="Filter by client" className="bl-select" value={params.get("client") ?? ""} onChange={(e) => filter("client", e.target.value)}><option value="">All clients</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="bl-tool-right">
          <Picker label="Sort by" icon={SORT_ICON} value={sort} onChange={(v) => filter("sort", v)} options={[
            { id: "activity", label: "Last activity", sub: "Most recently commented first" },
            { id: "added", label: "Recently added", sub: "Newest projects first" },
            { id: "open", label: "Most open comments", sub: "Busiest projects first" },
            { id: "name", label: "Name A–Z", sub: "Alphabetical" },
          ]} />
          <Picker label="Layout" icon={VIEW_ICONS[view]} value={view} onChange={(v) => filter("display", v)} options={[
            { id: "cards", label: "Cards", sub: "Big previews, quick glance" },
            { id: "compact", label: "Compact", sub: "Smaller previews, more per row" },
            { id: "list", label: "List", sub: "One row per project" },
            { id: "table", label: "Table", sub: "Dense, spreadsheet-style" },
          ]} />
        </div>
      </div>

      {!archived && visible.length > 0 && (
        <div className="bl-legend" aria-hidden="true">
          {([...BAR_STATUSES, "resolved"] as const).map((k) => <span key={k}><i style={{ background: STATUS_COLORS[k] }} />{STATUS_LABELS[k]}</span>)}
        </div>
      )}

      {projects.isLoading ? <>
        <p role="status" className="sr-only">Loading projects…</p>
        <div className="bl-projects cards" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="bl-project"><div className="bl-project-preview bl-skeleton" /><div className="bl-project-body"><div className="bl-skeleton" style={{ height: 14, width: "55%", marginBottom: 10 }} /><div className="bl-skeleton" style={{ height: 11, width: "35%" }} /></div></div>)}</div>
      </> : <>
        {projects.error && <p className="bl-error" role="alert">{projects.error.message}</p>}
        {summary.error && <p className="bl-error" role="alert">Project counts could not load: {summary.error.message}</p>}
        {/* Keyed on the active filters so switching tabs/sort/search replays the fade-in
            (UX-AUD-005: motion is decorative only - prefers-reduced-motion already
            flattens every animation/transition duration to ~0 globally, see backline.css). */}
        <div className={`bl-projects ${view}`} key={`${type}-${archived}-${sort}-${search}-${params.get("client") ?? ""}`}>
          {visible.map(projectCard)}
          {!archived && !search && <button className="bl-new-card" onClick={() => setCreateType(type === "image" || type === "pdf" ? type : "website")}><span className="bl-new-card-plus"><PlusIcon /></span><strong>{type === "image" ? "Upload images to review" : type === "pdf" ? "Upload a PDF to review" : "Add a website to review"}</strong><small>{type === "image" ? "Pin feedback directly to campaign and product artwork." : type === "pdf" ? "Collect precise comments across every page of a document." : "Paste a URL and send your client a review link."}</small></button>}
        </div>
        {!projects.error && visible.length === 0 && <div className="bl-empty"><h2>{archived ? "No archived projects" : "No projects here yet"}</h2><p>{search || type !== "all" ? "Try a different search or project type." : "Create a project to get a shareable review link."}</p></div>}
      </>}
    </main>
    {createType && <ProjectForm workspace={workspace} initialType={createType} onClose={() => setCreateType(null)} />}{edit && <ProjectForm workspace={workspace} project={edit} onClose={() => setEdit(null)} />}
    {share && <ShareProjectModal project={share} workspaceId={workspace.id} workspaceSlug={workspace.slug} workspaceName={workspace.name} onClose={() => setShare(null)} />}
    {managePages && <ProjectPagesModal project={managePages} activePageId={null} onOpenPage={(pageId) => navigate(`/w/${workspace.slug}/p/${managePages.id}${pageId ? `?page=${encodeURIComponent(pageId)}` : ""}`)} onClose={() => setManagePages(null)} />}
    {comingSoonFeature && <ComingSoonModal feature={comingSoonFeature} onClose={() => setComingSoonFeature(null)} />}
    {showNewTicket && <NewTicket workspace={workspace} members={members.data ?? []} onClose={() => setShowNewTicket(false)} />}
  </>;
}
