import type { ComponentType } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router-dom";

import { LoadingScreen } from "../components/LoadingScreen";
import { useAuth } from "../features/auth/AuthContext";
import { ProjectLayout } from "./layout/ProjectLayout";
import { WorkspaceLayout } from "./layout/WorkspaceLayout";

import { rememberReturnPath } from "../lib/return-path";
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
  const location = useLocation();

  if (status === "loading") {
    return <LoadingScreen />;
  }
  if (status === "unauthenticated") {
    // A shared /join?code=… link should still be where they end up after signing in.
    rememberReturnPath(`${location.pathname}${location.search}`);
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

// Each page is its own chunk, fetched the first time its route is visited. Imported
// eagerly, every screen - the canvas, the ticket views and pdf.js with them - was one
// bundle a reviewer downloaded before even the sign-in page could render.
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return async () => ({ Component: (await load())[name] });
}

// Full route tree (05-Frontend-Architecture.md §5.2) fills in as later milestones
// add the board/page-detail screens.
const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/login", lazy: page(() => import("../features/auth/LoginPage"), "LoginPage") },
      {
        path: "/auth/callback",
        lazy: page(() => import("../features/auth/AuthCallbackPage"), "AuthCallbackPage"),
      },
      {
        path: "/integrations/clickup/callback",
        lazy: page(
          () => import("../features/integrations/ClickUpOAuthCallbackPage"),
          "ClickUpOAuthCallbackPage",
        ),
      },
      {
        path: "/integrations/jira/callback",
        lazy: page(
          () => import("../features/integrations/JiraOAuthCallbackPage"),
          "JiraOAuthCallbackPage",
        ),
      },
      {
        path: "/integrations/asana/callback",
        lazy: page(
          () => import("../features/integrations/AsanaOAuthCallbackPage"),
          "AsanaOAuthCallbackPage",
        ),
      },
      // Guest reviewer entry - no dashboard chrome, no member auth (05-Frontend-Architecture.md §5.2).
      {
        path: "/review/:shareToken",
        lazy: page(() => import("../features/review/ReviewEntryPage"), "ReviewEntryPage"),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: "/",
            lazy: page(
              () => import("../features/workspaces/WorkspacePickerPage"),
              "WorkspacePickerPage",
            ),
          },
          {
            path: "/join",
            lazy: page(
              () => import("../features/workspaces/JoinWorkspacePage"),
              "JoinWorkspacePage",
            ),
          },
          {
            path: "/w/:workspaceSlug",
            element: <WorkspaceLayout />,
            children: [
              { index: true, lazy: page(() => import("../features/projects/ProjectsPage"), "ProjectsPage") },
              { path: "tickets", lazy: page(() => import("../features/tickets/TicketsPage"), "TicketsPage") },
              { path: "clients", lazy: page(() => import("../features/clients/ClientsPage"), "ClientsPage") },
              { path: "activity", lazy: page(() => import("../features/activity/ActivityPage"), "ActivityPage") },
              { path: "usage", lazy: page(() => import("../features/workspaces/UsagePage"), "UsagePage") },
              { path: "mcp", lazy: page(() => import("../features/workspaces/McpServerPage"), "McpServerPage") },
              { path: "members", lazy: page(() => import("../features/workspaces/MembersPage"), "MembersPage") },
              { path: "billing", lazy: page(() => import("../features/workspaces/BillingPage"), "BillingPage") },
              { path: "settings", lazy: page(() => import("../features/workspaces/SettingsPage"), "SettingsPage") },
              {
                path: "integrations",
                lazy: page(() => import("../features/integrations/IntegrationsPage"), "IntegrationsPage"),
              },
              {
                path: "extensions",
                lazy: page(
                  () => import("../features/extension-tokens/ExtensionSettingsPage"),
                  "ExtensionSettingsPage",
                ),
              },
              {
                path: "ai",
                lazy: page(() => import("../features/ai/AiPage"), "AiPage"),
              },
              {
                path: "keys",
                lazy: page(() => import("../features/api-keys/ApiKeysPage"), "ApiKeysPage"),
              },
              // Legacy path - redirect to renamed route so existing bookmarks keep working
              { path: "extension", element: <Navigate to="../extensions" replace /> },
            ],
          },
          {
            path: "/w/:workspaceSlug/p/:projectId",
            element: <ProjectLayout />,
            children: [
              {
                index: true,
                lazy: page(() => import("../features/projects/ProjectOverviewPage"), "ProjectOverviewPage"),
              },
              { path: "board", lazy: page(() => import("../features/board/BoardPage"), "BoardPage") },
              {
                path: "share-links",
                lazy: page(() => import("../features/share-links/ShareLinksPage"), "ShareLinksPage"),
              },
            ],
          },
          { path: "*", lazy: page(() => import("../features/pages/NotFoundPage"), "NotFoundPage") },
        ],
      },
    ],
  },
]);

export function AppRouter() {
  // Shown while the first route's chunk loads; later navigations keep the current
  // page on screen until the next one is ready.
  return <RouterProvider router={router} fallbackElement={<LoadingScreen />} />;
}
