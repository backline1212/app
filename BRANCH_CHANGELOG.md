# Branch Summary: `feature/standardize-routes-titles-navigation`

## Overview
This branch standardizes the routing architecture, document/tab titles, breadcrumbs, and inter-page navigation across the entire Backline web application.

---

## Key Changes Included

### 1. Document Title System Enhancement
- **File**: `apps/web/src/lib/use-document-title.ts`
- **Features**:
  - Accepts breadcrumb arrays (e.g. `[workspace.name, "Tickets"]` or `[project.name, "Board"]`).
  - Formats browser tab titles cleanly as `Segment 1 · Segment 2 — Backline`.
  - Automatically filters falsy/undefined values so titles render without flickering during async queries.

### 2. Contextual Page Titles for All Routes
- **Workspace Pages**:
  - `ProjectsPage.tsx`: `{Workspace} · Projects — Backline` / `{Workspace} · Archived Projects — Backline`
  - `TicketsPage.tsx`: `{Workspace} · Tickets — Backline`
  - `ClientsPage.tsx`: `{Workspace} · Clients — Backline`
  - `ActivityPage.tsx`: `{Workspace} · Activity — Backline`
  - `MembersPage.tsx`: `{Workspace} · Members — Backline`
  - `SettingsPage.tsx`: `{Workspace} · Settings — Backline`
  - `BillingPage.tsx`: `{Workspace} · Billing — Backline`
  - `IntegrationsPage.tsx`: `{Workspace} · Integrations — Backline`
  - `McpServerPage.tsx`: `{Workspace} · MCP Server — Backline`
  - `ExtensionSettingsPage.tsx`: `{Workspace} · Browser Extension — Backline`
  - `UsagePage.tsx`: `{Workspace} · AI Usage — Backline`
- **Project Sub-Routes**:
  - `ProjectOverviewPage.tsx`: `{Project Name} · Review — Backline`
  - `BoardPage.tsx`: `{Project Name} · Board — Backline`
  - `ShareLinksPage.tsx`: `{Project Name} · Share Links — Backline`
  - `ReviewEntryPage.tsx`: `{Project Name} · Review — Backline`
- **Auth & Error Views**:
  - `NotFoundPage.tsx`: `Page Not Found — Backline`
  - `AuthCallbackPage.tsx`: `Signing in — Backline`
  - `OAuthCallback.tsx`: `Connecting {Provider} — Backline`

### 3. Sub-Route Navigation & Breadcrumbs
- **Board Header (`BoardHeader.tsx`)**: Added `← Back to {projectName}` link returning directly to the review canvas.
- **Share Links Page (`ShareLinksPage.tsx`)**: Updated back-link to display the dynamic project name.
- **Project Menu (`ProjectMenu.tsx`)**: Added direct navigation items for `Ticket board` (`/w/:workspaceSlug/p/:projectId/board`) and `Manage share links` (`/w/:workspaceSlug/p/:projectId/share-links`).
- **Project Side Panel (`DetailsTab.tsx`)**: Added quick action navigation buttons `Open board →` and `Share links →`.

### 4. Playwright End-to-End Test Suite
- **File**: `apps/e2e/tests/navigation-titles-routes.spec.ts`
- **Coverage**:
  - Validates document titles across all workspace sub-routes.
  - Validates project review canvas, board, and share links tab titles.
  - Verifies bidirectional navigation links between review canvas, board, and share links.
  - Verifies 404 page title behavior.

### 5. Architectural Record
- **TDR**: `docs/tdr/0048-standardized-routes-titles-and-navigation.md`
