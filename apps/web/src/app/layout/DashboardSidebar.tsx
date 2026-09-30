import { type ComponentType, type ReactNode, type SVGProps, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TranslationKeys } from "../../lib/i18n";
import { getDashboard } from "../../features/tickets/api";
import { listMembers, type WorkspaceOut } from "../../features/workspaces/api";
import { WorkspaceSwitcherPopover } from "../../features/workspaces/WorkspaceSwitcherPopover";
import { qk } from "../../lib/query-keys";
import { STATUS_COLORS, STATUS_LABELS, WORKFLOW_STATUSES } from "../../lib/workflow";
import {
  ActivityClockIcon, AssignedToMeIcon, BillingIcon, ChevronDownIcon, ClientsIcon, CloseIcon,
  ExtensionsIcon, IntegrationsIcon, KeyIcon, McpIcon, MembersIcon, ProjectsIcon,
  SettingsIcon, SparklesIcon, SwitchIcon, TicketsIcon, UsageIcon,
} from "./sidebar-icons";
import { type RailSection, useRailSections } from "./use-rail-sections";

type RailItem = {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  active: boolean;
  count?: number;
  hot?: boolean;
};

// A plain Link, not NavLink: NavLink matches on pathname only, so every
// /tickets?... link (Assigned to me, All tickets, each status) and the Projects link
// (every route under /w/:slug) all announced aria-current="page" at once. Here the
// highlight and aria-current come from the same, query-aware `active` flag.
function RailLink({ to, active, onNavigate, lead, label, trail }: {
  to: string;
  active: boolean;
  onNavigate?: () => void;
  lead: ReactNode;
  label: string;
  trail?: ReactNode;
}) {
  return (
    <Link to={to} onClick={onNavigate} className={active ? "is-on" : undefined} aria-current={active ? "page" : undefined}>
      {lead}
      <span className="bl-nav-txt">{label}</span>
      {trail}
    </Link>
  );
}

function RailGroup({ id, label, open, onToggle, children }: {
  id: RailSection;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const regionId = `bl-rail-${id}`;
  return (
    <>
      <button type="button" className="bl-nav-label bl-nav-toggle" aria-expanded={open} aria-controls={regionId} onClick={onToggle}>
        <span>{label}</span>
        <ChevronDownIcon className="bl-nav-chevron" />
      </button>
      {/* Kept mounted so the collapse can animate; visibility:hidden on the closed
          state (backline.css .bl-nav-group) takes its links out of the tab order. */}
      <div id={regionId} className="bl-nav-group" data-open={open}>
        <div className="bl-views">{children}</div>
      </div>
    </>
  );
}

// Account/sign-out no longer lives here: it's the AccountButton in the topbar
// (WorkspaceLayout) now, top-right next to search/notifications instead of a text
// button at the bottom of this nav.
export function DashboardSidebar({ workspace, mobileOpen = false, onClose, onNavigate }: { workspace: WorkspaceOut; mobileOpen?: boolean; onClose?: () => void; onNavigate?: () => void }) {
  const base = `/w/${workspace.slug}`;
  const location = useLocation();
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: qk.dashboard(workspace.id), queryFn: () => getDashboard(workspace.id) });
  const query = new URLSearchParams(location.search);
  const people = useQuery({ queryKey: qk.members(workspace.id), queryFn: () => listMembers(workspace.id) });
  const { pathname } = location;
  const onTickets = pathname === `${base}/tickets`;
  const onPage = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  const primaryLinks: RailItem[] = [
    { to: base, label: t('sidebar.projects' as TranslationKeys), icon: ProjectsIcon, count: data?.projects, active: pathname === base && query.get("archived") !== "true" },
    { to: `${base}/tickets?view=mine`, label: "Assigned to me", icon: AssignedToMeIcon, count: data?.assigned_to_me, hot: true, active: onTickets && query.get("view") === "mine" },
    { to: `${base}/tickets`, label: "All tickets", icon: TicketsIcon, count: data?.tickets, active: onTickets && query.get("view") !== "mine" && !query.get("status") },
    { to: `${base}/activity`, label: t('sidebar.activity' as TranslationKeys), icon: ActivityClockIcon, active: onPage(`${base}/activity`) },
    { to: `${base}/clients`, label: t('sidebar.clients' as TranslationKeys), icon: ClientsIcon, active: onPage(`${base}/clients`) },
  ];

  const toolLinks: RailItem[] = [
    { to: `${base}/integrations`, label: "Integrations", icon: IntegrationsIcon },
    { to: `${base}/extensions`, label: "Extensions", icon: ExtensionsIcon },
    { to: `${base}/mcp`, label: "MCP server", icon: McpIcon },
    { to: `${base}/ai`, label: "AI", icon: SparklesIcon },
    { to: `${base}/keys`, label: "API keys", icon: KeyIcon },
  ].map((item) => ({ ...item, active: onPage(item.to) }));

  const workspaceLinks: RailItem[] = [
    { to: `${base}/members`, label: "Members", icon: MembersIcon },
    { to: `${base}/usage`, label: "AI usage", icon: UsageIcon },
    { to: `${base}/billing`, label: "Billing", icon: BillingIcon },
    { to: `${base}/settings`, label: "Settings", icon: SettingsIcon },
  ].map((item) => ({ ...item, active: onPage(item.to) }));

  const [showWsPop, setShowWsPop] = useState(false);
  const sections = useRailSections();
  const { reveal } = sections;

  // Landing on a page inside a collapsed group (a bookmark, search, a link from
  // another page) opens that group, so the highlighted link is never hidden.
  const statusActive = onTickets && query.get("status") !== null;
  const toolActive = toolLinks.some((item) => item.active);
  const workspaceActive = workspaceLinks.some((item) => item.active);
  useEffect(() => { if (statusActive) reveal("statuses"); }, [statusActive, reveal]);
  useEffect(() => { if (toolActive) reveal("tools"); }, [toolActive, reveal]);
  useEffect(() => { if (workspaceActive) reveal("workspace"); }, [workspaceActive, reveal]);

  const iconLink = (item: RailItem) => (
    <RailLink
      key={item.to}
      to={item.to}
      active={item.active}
      onNavigate={onNavigate}
      lead={<item.icon className="bl-nav-icon" />}
      label={item.label}
      trail={item.count !== undefined && <b className={`bl-ct${item.hot && item.count > 0 ? " hot" : ""}`}>{item.count}</b>}
    />
  );

  return <aside id="workspace-navigation" className={`bl-rail${mobileOpen ? " is-open" : ""}`} aria-label="Workspace sidebar">
    {/* design/index.html .rail: the workspace switcher is the top of the rail; the
        close button only shows when the rail is a mobile drawer. */}
    <button type="button" className="bl-rail-close" aria-label="Close navigation" onClick={onClose}><CloseIcon /></button>
    <div className="bl-ws-wrap">
      <button
        type="button"
        className="bl-ws"
        aria-label={`Switch workspace, current: ${workspace.name}`}
        aria-haspopup="dialog"
        aria-expanded={showWsPop}
        onClick={() => setShowWsPop((v) => !v)}
      >
        <span className="bl-ws-mark">{workspace.name.slice(0, 1).toUpperCase()}</span>
        <span className="bl-ws-name">
          {workspace.name}
          <span className="bl-ws-sub">{data?.projects ?? "—"} projects · {people.data?.length ?? "—"} people</span>
        </span>
        <span className="bl-ws-switch"><SwitchIcon /></span>
      </button>
      {showWsPop && (
        <WorkspaceSwitcherPopover
          currentWorkspace={workspace}
          onClose={() => setShowWsPop(false)}
        />
      )}
    </div>

    <nav aria-label="Workspace navigation" className="bl-nav">
      {primaryLinks.map(iconLink)}

      <RailGroup id="statuses" label="Comments by status" open={sections.open.statuses} onToggle={() => sections.toggle("statuses")}>
        {WORKFLOW_STATUSES.filter((s) => s !== "wont_fix").map((s) => (
          <RailLink
            key={s}
            to={`${base}/tickets?status=${s}`}
            active={onTickets && query.get("status") === s}
            onNavigate={onNavigate}
            lead={<i className="bl-dot" style={{ background: STATUS_COLORS[s] }} />}
            label={STATUS_LABELS[s]}
            trail={<b className="bl-ct">{data?.statuses[s] ?? 0}</b>}
          />
        ))}
      </RailGroup>

      <p className="bl-nav-label">PROJECTS</p>
      <div className="bl-views">
        <RailLink
          to={`${base}?archived=true`}
          active={pathname === base && query.get("archived") === "true"}
          onNavigate={onNavigate}
          lead={<i className="bl-dot is-grey" />}
          label="Archived"
          trail={<b className="bl-ct">{data?.archived_projects ?? 0}</b>}
        />
      </div>

      <RailGroup id="tools" label="Tools" open={sections.open.tools} onToggle={() => sections.toggle("tools")}>
        {toolLinks.map(iconLink)}
      </RailGroup>

      <RailGroup id="workspace" label="Workspace" open={sections.open.workspace} onToggle={() => sections.toggle("workspace")}>
        {workspaceLinks.map(iconLink)}
      </RailGroup>
    </nav>
    <footer className="bl-rail-foot">
      <div className="bl-plan-card">
        <div className="bl-plan-top"><span className="bl-plan-name">{workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1)} plan</span><span className="bl-plan-count">{data?.projects ?? "—"} projects</span></div>
        <p>One place for your team's client reviews.</p>
        <Link onClick={onNavigate} className="bl-btn-plan" to={`${base}/billing`}>Compare plans</Link>
      </div>
    </footer>
  </aside>;
}
