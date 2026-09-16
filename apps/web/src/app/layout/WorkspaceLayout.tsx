import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@backline/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useWSEvent } from "../WSProvider";

import { invalidateTicketsAndDashboard, qk } from "../../lib/query-keys";
import { LoadingScreen } from "../../components/LoadingScreen";
import { useWorkspaceContext } from "./useWorkspaceContext";
import { DashboardSidebar } from "./DashboardSidebar";
import { AccountModal } from "../../features/auth/AccountModal";
import { useAuth } from "../../features/auth/AuthContext";
import { GlobalSearch } from "../../features/dashboard/GlobalSearch";
import { NotificationBell } from "../../features/notifications/NotificationBell";
import { useConnectionStore } from "../../stores/connectionStore";
import { BrandMark } from "../../components/BrandMark";
import { PlusIcon } from "../../components/icons";
import { CloseIcon, MenuIcon } from "./sidebar-icons";
import { ProjectForm } from "../../features/projects/ProjectForm";
import { ThemeToggle } from "../../components/ThemeToggle";

// Account entry point - top-right of the persistent topbar, next to search and
// notifications, rather than a text button buried at the bottom of the sidebar
// (where the eye has to travel past the whole nav to find it every time).
import { useOnClickOutside } from "../../lib/use-click-outside";

function AccountButton() {
  const { user, logout } = useAuth();
  const [popOpen, setPopOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  
  useOnClickOutside(popRef, () => setPopOpen(false));

  return (
    <div style={{ position: "relative" }} ref={popRef}>
      <button 
        type="button" 
        className="bl-account-btn" 
        aria-label="Your account" 
        aria-haspopup="menu"
        aria-expanded={popOpen}
        onClick={() => setPopOpen(p => !p)}
      >
        <Avatar name={user?.name ?? "?"} avatarUrl={user?.avatar_url} size={32} />
      </button>
      
      {popOpen && (
        <div className="bl-dropdown-pop" role="menu" aria-label="Account menu">
          <button
            className="bl-dropdown-item"
            role="menuitem"
            onClick={() => { setPopOpen(false); setSettingsOpen(true); }}
          >
            Profile &amp; Settings
          </button>
          <button
            className="bl-dropdown-item danger"
            role="menuitem"
            onClick={() => { setPopOpen(false); void logout(); }}
          >
            Log out
          </button>
        </div>
      )}
      
      {settingsOpen && <AccountModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// The dashboard chrome (sidebar + everything under it: project grid, members, billing,
// settings, usage, mcp) - deliberately NOT used for an open project's own routes
// (ProjectLayout), which need the full viewport for the canvas and have their own,
// much lighter header instead (see ProjectLayout.tsx's docblock for why).
export function WorkspaceLayout() {
  const result = useWorkspaceContext();
  const location = useLocation();
  const cache = useQueryClient();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  // Every top-level comment is a "ticket" candidate regardless of which page created it
  // (dashboard/repository.py's root_pipeline has no is_standalone filter - an asset or
  // project review comment shows up in the Tickets list and dashboard counts the same
  // as an explicitly-created ticket). There is no dedicated ticket.* WS event, so this
  // has to listen on the same comment.* channel BoardPage/ProjectOverviewPage use for
  // their own local cache merges - this invalidation is for a different, workspace-wide
  // surface (Tickets/Dashboard/Activity), not a duplicate of that per-page merge logic.
  const workspaceId = "workspace" in result ? result.workspace.id : undefined;
  const refreshTicketSurfaces = useCallback(() => {
    if (!workspaceId) return;
    void invalidateTicketsAndDashboard(cache, workspaceId);
    void cache.invalidateQueries({ queryKey: qk.activity(workspaceId) });
  }, [cache, workspaceId]);
  useWSEvent("comment.created", refreshTicketSurfaces);
  useWSEvent("comment.updated", refreshTicketSurfaces);
  useWSEvent("comment.deleted", refreshTicketSurfaces);

  const connStatus = useConnectionStore((s) => s.status);
  const [showConnBanner, setShowConnBanner] = useState(false);

  useEffect(() => {
    if (connStatus === "connected") {
      setShowConnBanner(false);
      return;
    }
    // Debounced on purpose: on every login, page refresh, and workspace switch,
    // connStatus starts at "disconnected" and briefly passes through "connecting"
    // before the socket actually opens (usually well under a second). Without this
    // delay the red banner below flashed on screen for that one frame every single
    // time, even on a normal, fast connection - it should only appear once a
    // connection attempt has genuinely been stuck for a moment.
    const timer = setTimeout(() => setShowConnBanner(true), 500);
    return () => clearTimeout(timer);
  }, [connStatus]);

  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavigationOpen]);

  if (result.status === "loading") {
    return <LoadingScreen />;
  }
  if (result.status === "not-found") {
    return <Navigate to="/" replace />;
  }
  if (result.status === "error") {
    return <main className="bl-review-gate"><h1>Could not open workspace</h1><p role="alert">{result.message}</p><button onClick={() => window.location.reload()}>Retry</button><Link to="/">Choose another workspace</Link></main>;
  }
  if (result.status === "switching") {
    return <LoadingScreen label={`Opening ${result.workspace.name}`} />;
  }

  const { workspace } = result;

  return (
    <div className="bl-app">
      <a className="bl-skip-link" href="#workspace-content">Skip to content</a>
      <DashboardSidebar
        workspace={workspace}
        mobileOpen={mobileNavigationOpen}
        onClose={() => setMobileNavigationOpen(false)}
        onNavigate={() => setMobileNavigationOpen(false)}
      />
      {mobileNavigationOpen && (
        <button
          type="button"
          className="bl-nav-scrim"
          aria-label="Close workspace navigation"
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}
      <div className="bl-main">
        <header className="bl-topbar">
          <button
            type="button"
            className="bl-mobile-menu-button"
            aria-label={mobileNavigationOpen ? "Close workspace navigation" : "Open workspace navigation"}
            aria-controls="workspace-navigation"
            aria-expanded={mobileNavigationOpen}
            onClick={() => setMobileNavigationOpen((open) => !open)}
          >
            {mobileNavigationOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
          <span className="bl-mobile-brand"><BrandMark compact /></span>
          <GlobalSearch key={workspace.id} workspaceId={workspace.id} workspaceSlug={workspace.slug} />
          <div className="bl-topbar-actions">
            <button type="button" className="bl-button bl-topbar-create" onClick={() => setCreateProjectOpen(true)}>
              <PlusIcon /> <span>New project</span>
            </button>
            <ThemeToggle />
            <NotificationBell />
            <AccountButton />
          </div>
        </header>
        {showConnBanner && connStatus !== "connected" && (
          <div
            className={`bl-conn-banner ${connStatus === "reconnecting" ? "reconnecting" : "offline"}`}
            aria-live="polite"
            role="status"
          >
            {connStatus === "reconnecting"
              ? "Reconnecting to Backline…"
              : "You are offline. Changes may not be saved."}
          </div>
        )}
        <div id="workspace-content" className="bl-route-content" tabIndex={-1}>
          <Outlet context={{ workspace }} />
        </div>
      </div>
      {createProjectOpen && <ProjectForm workspace={workspace} onClose={() => setCreateProjectOpen(false)} />}
    </div>
  );
}
