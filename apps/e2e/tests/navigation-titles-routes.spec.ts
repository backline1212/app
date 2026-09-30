import { expect, test } from "@playwright/test";

import { createProject, createWorkspace, loginViaOtp } from "../helpers/login";

test.describe("Navigation, Routing and Standardized Document Titles", () => {
  test("verifies standard document titles and sub-route navigation across all pages", async ({
    page,
  }) => {
    const email = `nav-test-${Date.now()}@example.com`;
    await loginViaOtp(page, email);

    const wsName = `Acme Agency ${Date.now()}`;
    const workspaceSlug = await createWorkspace(page, wsName);
    const projectName = `Client Store ${Date.now()}`;
    const projectId = await createProject(page, projectName, "https://example.com");

    // 1. Project Review Canvas Title
    await page.goto(`/w/${workspaceSlug}/p/${projectId}`);
    await expect(page).toHaveTitle(new RegExp(`${projectName} · Review — Backline`));

    // 2. Project Board Page Title & Back Link
    await page.goto(`/w/${workspaceSlug}/p/${projectId}/board`);
    await expect(page).toHaveTitle(new RegExp(`${projectName} · Board — Backline`));
    const backToProjectLink = page.getByRole("link", { name: new RegExp(`Back to ${projectName}|Back to project`, "i") });
    await expect(backToProjectLink).toBeVisible();
    await backToProjectLink.click();
    await expect(page).toHaveURL(new RegExp(`/w/${workspaceSlug}/p/${projectId}$`));

    // 3. Project Share Links Page Title & Back Link
    await page.goto(`/w/${workspaceSlug}/p/${projectId}/share-links`);
    await expect(page).toHaveTitle(new RegExp(`${projectName} · Share Links — Backline`));
    const shareBackLink = page.getByRole("link", { name: new RegExp(`Back to ${projectName}|Back to project`, "i") });
    await expect(shareBackLink).toBeVisible();
    await shareBackLink.click();
    await expect(page).toHaveURL(new RegExp(`/w/${workspaceSlug}/p/${projectId}$`));

    // 4. Workspace Projects List
    await page.goto(`/w/${workspaceSlug}`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Projects — Backline`));

    // 5. Workspace Tickets Page
    await page.goto(`/w/${workspaceSlug}/tickets`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Tickets — Backline`));

    // 6. Workspace Clients Page
    await page.goto(`/w/${workspaceSlug}/clients`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Clients — Backline`));

    // 7. Workspace Activity Page
    await page.goto(`/w/${workspaceSlug}/activity`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Activity — Backline`));

    // 8. Workspace Members Page
    await page.goto(`/w/${workspaceSlug}/members`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Members — Backline`));

    // 9. Workspace Settings Page
    await page.goto(`/w/${workspaceSlug}/settings`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Settings — Backline`));

    // 10. Workspace Billing Page
    await page.goto(`/w/${workspaceSlug}/billing`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Billing — Backline`));

    // 11. Workspace Integrations Page
    await page.goto(`/w/${workspaceSlug}/integrations`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Integrations — Backline`));

    // 12. Workspace MCP Server Page
    await page.goto(`/w/${workspaceSlug}/mcp`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · MCP Server — Backline`));

    // 13. Workspace Browser Extension Page (renamed from /extension to /extensions)
    await page.goto(`/w/${workspaceSlug}/extensions`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Browser Extension — Backline`));

    // 13b. Legacy /extension path redirects to /extensions
    await page.goto(`/w/${workspaceSlug}/extension`);
    await expect(page).toHaveURL(new RegExp(`/w/${workspaceSlug}/extensions$`));
    await expect(page).toHaveTitle(new RegExp(`${wsName} · Browser Extension — Backline`));

    // 14. Workspace AI Page
    await page.goto(`/w/${workspaceSlug}/ai`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · AI — Backline`));

    // 15. Workspace API Keys Page
    await page.goto(`/w/${workspaceSlug}/keys`);
    await expect(page).toHaveTitle(new RegExp(`${wsName} · API Keys — Backline`));

    // 16. 404 Not Found Page Title
    await page.goto(`/w/${workspaceSlug}/non-existent-page-route-12345`);
    await expect(page).toHaveTitle(/Page Not Found — Backline/);
  });
});
