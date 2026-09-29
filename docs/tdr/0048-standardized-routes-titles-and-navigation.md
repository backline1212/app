# TDR 0048: Standardized Routes, Contextual Page Titles, and Sub-Route Navigation

**Date**: 2026-09-29  
**Status**: Accepted  
**Scope**: Routing consistency, contextual tab titles (`document.title`), bidirectional project navigation, and E2E coverage.

---

## 1. Context & Motivation

The application's route architecture follows workspace and project-scoped hierarchies (`/w/:workspaceSlug/...` and `/w/:workspaceSlug/p/:projectId/...`). However, several views either:
1. Had static or missing browser tab titles (`document.title`), showing raw or empty titles instead of the workspace/project context.
2. Lacked clear breadcrumb back-links to navigate between project canvases (`/w/:workspaceSlug/p/:projectId`), Kanban boards (`/w/:workspaceSlug/p/:projectId/board`), and Share Link managers (`/w/:workspaceSlug/p/:projectId/share-links`).
3. Lacked quick action links in the project side panel (`DetailsTab`) and project dropdown menu (`ProjectMenu`) to navigate into related sub-routes.

---

## 2. Key Architecture Decisions

### 2.1 Rich Breadcrumb Support in `useDocumentTitle`
The `useDocumentTitle` hook (`apps/web/src/lib/use-document-title.ts`) was enhanced to accept string arrays in addition to single strings:
- Formats segments as `Segment 1 · Segment 2 — Backline`.
- Automatically removes blank/undefined values during asynchronous data loading without flickering.
- Examples:
  - `[workspace.name, "Tickets"]` → `Acme Studio · Tickets — Backline`
  - `[project.name, "Board"]` → `Client Store · Board — Backline`
  - `[project.name, "Review"]` → `Client Store · Review — Backline`

### 2.2 Standardized Workspace and Project Titles
- **Workspace Views**:
  - Projects: `[workspace.name, archived ? "Archived Projects" : "Projects"]`
  - Tickets: `[workspace.name, "Tickets"]`
  - Clients: `[workspace.name, "Clients"]`
  - Activity: `[workspace.name, "Activity"]`
  - Members: `[workspace.name, "Members"]`
  - Settings: `[workspace.name, "Settings"]`
  - Billing: `[workspace.name, "Billing"]`
  - Integrations: `[workspace.name, "Integrations"]`
  - MCP Server: `[workspace.name, "MCP Server"]`
  - Extension: `[workspace.name, "Browser Extension"]`
  - AI Usage: `[workspace.name, "AI Usage"]`
- **Project Sub-Routes**:
  - Review Canvas: `[project.name, "Review"]`
  - Board View: `[project.name, "Board"]`
  - Share Links: `[project.name, "Share Links"]`
  - Guest Review: `[resolved.project_name, "Review"]`
- **Auth & Error Handling**:
  - 404 Not Found: `Page Not Found — Backline`
  - Sign in: `Sign In — Backline` / `Signing in — Backline`
  - OAuth Integrations: `Connecting {Provider} — Backline`

### 2.3 Connected Sub-Route Navigation
1. **Board Header (`BoardHeader.tsx`)**:
   - Displays a clean `← Back to {projectName}` link at the top to return straight to the review canvas.
2. **Share Links (`ShareLinksPage.tsx`)**:
   - Uses the active project name in the back link (`← Back to {projectName}`).
3. **Project Dropdown Menu (`ProjectMenu.tsx`)**:
   - Added direct links to `Ticket board` and `Manage share links`.
4. **Project Side Panel Details (`DetailsTab.tsx`)**:
   - Added quick navigation buttons to `Open board →` and `Share links →`.

### 2.4 E2E Test Suite
Added `apps/e2e/tests/navigation-titles-routes.spec.ts` covering:
- Document title accuracy on all workspace views.
- Document title accuracy on project sub-routes.
- Bidirectional back-and-forth navigation between canvas, board, and share links.
- 404 page document title behavior.

---

## 3. Verification

- All modified files checked for TypeScript and JSX correctness.
- Git diff audited for precision with zero regressions to existing core APIs or components.
