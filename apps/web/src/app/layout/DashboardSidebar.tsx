import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TranslationKeys } from "../../lib/i18n";
import { getDashboard } from "../../features/tickets/api";
import { listMembers, type WorkspaceOut } from "../../features/workspaces/api";
import { WorkspaceSwitcherPopover } from "../../features/workspaces/WorkspaceSwitcherPopover";
import { qk } from "../../lib/query-keys";
import { STATUS_COLORS, STATUS_LABELS, WORKFLOW_STATUSES } from "../../lib/workflow";
import { ActivityClockIcon, AssignedToMeIcon, ClientsIcon, CloseIcon, ProjectsIcon, SwitchIcon, TicketsIcon } from "./sidebar-icons";

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
  const links: { to: string; label: string; icon: typeof ProjectsIcon; count?: number; hot?: boolean; active?: boolean }[] = [
    { to: base, label: t('sidebar.projects' as TranslationKeys), icon: ProjectsIcon, count: data?.projects, active: location.pathname === base && query.get("archived") !== "true" },
    { to: `${base}/tickets?view=mine`, label: "Assigned to me", icon: AssignedToMeIcon, count: data?.assigned_to_me, hot: true, active: location.pathname === `${base}/tickets` && query.get("view") === "mine" },
    { to: `${base}/tickets`, label: "All tickets", icon: TicketsIcon, count: data?.tickets, active: location.pathname === `${base}/tickets` && query.get("view") !== "mine" && !query.get("status") },
    { to: `${base}/activity`, label: t('sidebar.activity' as TranslationKeys), icon: ActivityClockIcon },
    { to: `${base}/clients`, label: t('sidebar.clients' as TranslationKeys), icon: ClientsIcon },
  ];
  function active(to: string) { return location.pathname + location.search === to; }

  const [showWsPop, setShowWsPop] = useState(false);

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
      {links.map((item) => <NavLink key={item.label} onClick={onNavigate} className={(item.active ?? active(item.to)) ? "is-on" : ""} to={item.to}><item.icon className="bl-nav-icon" /><span className="bl-nav-txt">{item.label}</span>{item.count !== undefined && <b className={`bl-ct${item.hot && item.count > 0 ? " hot" : ""}`}>{item.count}</b>}</NavLink>)}
      <p className="bl-nav-label">COMMENTS BY STATUS</p>
      <div className="bl-views">
        {WORKFLOW_STATUSES.filter((s) => s !== "wont_fix").map((s) => <NavLink key={s} onClick={onNavigate} className={location.pathname === `${base}/tickets` && query.get("status") === s ? "is-on" : ""} to={`${base}/tickets?status=${s}`}><i className="bl-dot" style={{ background: STATUS_COLORS[s] }} /><span className="bl-nav-txt">{STATUS_LABELS[s]}</span><b className="bl-ct">{data?.statuses[s] ?? 0}</b></NavLink>)}
      </div>
      <p className="bl-nav-label">PROJECTS</p>
      <div className="bl-views">
        <NavLink onClick={onNavigate} to={`${base}?archived=true`} className={location.pathname === base && query.get("archived") === "true" ? "is-on" : ""}><i className="bl-dot is-grey" /><span className="bl-nav-txt">Archived</span><b className="bl-ct">{data?.archived_projects ?? 0}</b></NavLink>
      </div>
    </nav>
    <footer className="bl-rail-foot">
      <div className="bl-plan-card">
        <div className="bl-plan-top"><span className="bl-plan-name">{workspace.plan.charAt(0).toUpperCase() + workspace.plan.slice(1)} plan</span><span className="bl-plan-count">{data?.projects ?? "—"} projects</span></div>
        <p>One place for your team's client reviews.</p>
        <NavLink onClick={onNavigate} className="bl-btn-plan" to={`${base}/billing`}>Compare plans</NavLink>
      </div>
    </footer>
  </aside>;
}
