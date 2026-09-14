import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";

import { LoadingScreen } from "../components/LoadingScreen";
import { AuthCallbackPage } from "../features/auth/AuthCallbackPage";
import { useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { BoardPage } from "../features/board/BoardPage";
import { ExtensionSettingsPage } from "../features/extension-tokens/ExtensionSettingsPage";
import { AsanaOAuthCallbackPage } from "../features/integrations/AsanaOAuthCallbackPage";
import { ClickUpOAuthCallbackPage } from "../features/integrations/ClickUpOAuthCallbackPage";
import { IntegrationsPage } from "../features/integrations/IntegrationsPage";
import { JiraOAuthCallbackPage } from "../features/integrations/JiraOAuthCallbackPage";
import { ProjectOverviewPage } from "../features/projects/ProjectOverviewPage";
import { ReviewEntryPage } from "../features/review/ReviewEntryPage";
import { ShareLinksPage } from "../features/share-links/ShareLinksPage";
import { BillingPage } from "../features/workspaces/BillingPage";
import { McpServerPage } from "../features/workspaces/McpServerPage";
import { MembersPage } from "../features/workspaces/MembersPage";

import { SettingsPage } from "../features/workspaces/SettingsPage";
import { UsagePage } from "../features/workspaces/UsagePage";
import { ProjectsPage } from "../features/projects/ProjectsPage";
import { TicketsPage } from "../features/tickets/TicketsPage";
import { ClientsPage } from "../features/clients/ClientsPage";
import { ActivityPage } from "../features/activity/ActivityPage";
import { WorkspacePickerPage } from "../features/workspaces/WorkspacePickerPage";
import { ProjectLayout } from "./layout/ProjectLayout";
import { WorkspaceLayout } from "./layout/WorkspaceLayout";
import { NotFoundPage } from "../features/pages/NotFoundPage";

import { ScrollToTop } from "../lib/ScrollToTop";

function RootLayout() {
  return (
    <>
      <ScrollToTop />
      <Outlet />
    </>
  );
}

function RequireAuth() {
  const { status } = useAuth();

  if (status === "loading") {
    return <LoadingScreen />;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

// Full route tree (05-Frontend-Architecture.md §5.2) fills in as later milestones
// add the board/page-detail screens.
const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/auth/callback", element: <AuthCallbackPage /> },
      { path: "/integrations/clickup/callback", element: <ClickUpOAuthCallbackPage /> },
      { path: "/integrations/jira/callback", element: <JiraOAuthCallbackPage /> },
      { path: "/integrations/asana/callback", element: <AsanaOAuthCallbackPage /> },
      // Guest reviewer entry - no dashboard chrome, no member auth (05-Frontend-Architecture.md §5.2).
      { path: "/review/:shareToken", element: <ReviewEntryPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: "/", element: <WorkspacePickerPage /> },
          {
            path: "/w/:workspaceSlug",
            element: <WorkspaceLayout />,
            children: [
              { index: true, element: <ProjectsPage /> },
              { path: "tickets", element: <TicketsPage /> },
              { path: "clients", element: <ClientsPage /> },
              { path: "activity", element: <ActivityPage /> },

          { path: "usage", element: <UsagePage /> },
          { path: "mcp", element: <McpServerPage /> },
          { path: "members", element: <MembersPage /> },
          { path: "billing", element: <BillingPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "integrations", element: <IntegrationsPage /> },
          { path: "extension", element: <ExtensionSettingsPage /> },
        ],
      },
      {
        path: "/w/:workspaceSlug/p/:projectId",
        element: <ProjectLayout />,
        children: [
          { index: true, element: <ProjectOverviewPage /> },
          { path: "board", element: <BoardPage /> },
          { path: "share-links", element: <ShareLinksPage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  ]
  }
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
