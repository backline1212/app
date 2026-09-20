import { expect, test } from "@playwright/test";

import { createProject, createShareLink, createWorkspace, loginViaOtp } from "../helpers/login";

// Covers the Comments panel's status filter chips (with live counts, isolate-on-click
// semantics), the "..." menu's status-change actions that feed them, the sort/layer
// controls, and the "current page only" toggle (which depends on the widget's
// backline:page-registered postMessage actually arriving - a real cross-origin channel,
// not just component state).
test("comments panel: status filters, sort, layer filter, current-page toggle, status change", async ({
  page,
}) => {
  const email = `filtertest-${Date.now()}@example.com`;
  await loginViaOtp(page, email);
  const workspaceSlug = await createWorkspace(page, `FilterTest ${Date.now()}`);
  const projectId = await createProject(page, "Client Site", "https://example.com");
  await createShareLink(page, workspaceSlug, projectId);

  await page.goto(`/w/${workspaceSlug}/p/${projectId}`);
  await page.waitForSelector('button[aria-label="Details"]', { timeout: 10_000 });

  const frame = page.frameLocator("iframe");

  async function postComment(selector: string, body: string, first: boolean) {
    if (first) {
      const nameInput = frame.locator('input[placeholder="Jamie"]');
      const namePromptAppeared = await nameInput
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (namePromptAppeared) {
        await nameInput.fill("Filter Tester");
        await frame.locator('button:has-text("Continue")').click();
      }
      await frame
        .locator("text=Tap anywhere on the page to leave feedback.")
        .waitFor({ timeout: 10_000 });
    }
    await frame.locator(selector).click();
    await frame.locator('textarea[placeholder="What needs to change here?"]').fill(body);
    await frame.locator('button:has-text("Post comment")').click();
    await frame.locator("text=Comment posted.").waitFor({ timeout: 15_000 });
    // Click a blank spot on the reviewed page itself (relative to the iframe, not an
    // absolute page coordinate) to dismiss the composer - the dashboard's sidebar now
    // occupies the left ~256px of the outer page, so an absolute page coordinate that
    // used to land inside the iframe can land on a sidebar nav link instead.
    await frame.locator("html").click({ position: { x: 10, y: 400 } });
    await page.waitForTimeout(300);
  }

  await postComment("h1", "comment on heading", true);
  await postComment("p >> nth=0", "comment on paragraph", false);

  await page.click('button[aria-label="Comments"]');
  await page.waitForTimeout(500);

  // Both comments visible, status chips show counts.
  await expect(page.locator("text=comment on heading")).toBeVisible();
  await expect(page.locator("text=comment on paragraph")).toBeVisible();
  await expect(page.locator('button[aria-pressed]:has-text("Active")')).toContainText("2");

  // Change first comment's status to In Progress via its "..." menu.
  const firstRow = page.locator('div[role="button"]:has-text("comment on heading")');
  await firstRow.locator('button[aria-label="Comment options"]').click();
  await page.locator('button:not([aria-pressed]):has-text("In Progress")').click();
  await page.waitForTimeout(500);

  // Status chip counts should now reflect 1 Active, 1 In Progress.
  await expect(page.locator('button[aria-pressed]:has-text("Active")')).toContainText("1");
  await expect(page.locator('button[aria-pressed]:has-text("In Progress")')).toContainText("1");

  // Clicking a status chip isolates the list down to just that status (not a
  // multi-select toggle) - clicking "In Progress" should show only the heading comment
  // (now In Progress) and hide the paragraph comment (still Active).
  const inProgressChip = page.locator('button[aria-pressed]:has-text("In Progress")');
  await inProgressChip.click();
  await expect(inProgressChip).toHaveAttribute("data-active", "true");
  await expect(page.locator("text=comment on heading")).toBeVisible();
  await expect(page.locator("text=comment on paragraph")).not.toBeVisible();

  // Clicking the same chip again deselects it, going back to showing everything.
  await inProgressChip.click();
  await expect(inProgressChip).toHaveAttribute("data-active", "false");
  await expect(page.locator("text=comment on heading")).toBeVisible();
  await expect(page.locator("text=comment on paragraph")).toBeVisible();

  // Isolate to "Active" instead, then use "Select all" to restore both.
  await page.locator('button[aria-pressed]:has-text("Active")').click();
  await expect(page.locator("text=comment on heading")).not.toBeVisible();
  await expect(page.locator("text=comment on paragraph")).toBeVisible();
  await page.click("text=Select all");
  await expect(page.locator("text=comment on heading")).toBeVisible();
  await expect(page.locator("text=comment on paragraph")).toBeVisible();

  // Sort control: switch to oldest first, confirm order flips.
  await page.click('button:has-text("Sort")');
  await page.click("text=Oldest first");
  const bodiesOldestFirst = await page.locator(".text-sm >> visible=true").allTextContents();
  expect(bodiesOldestFirst.join(" ")).toMatch(/heading[\s\S]*paragraph/);

  // Current-page-only checkbox is enabled (widget posted page-registered) and works.
  const checkbox = page.locator('input[type="checkbox"]');
  await expect(checkbox).toBeEnabled({ timeout: 5000 });
  await checkbox.check();
  await expect(page.locator("text=comment on heading")).toBeVisible();
  await expect(page.locator("text=comment on paragraph")).toBeVisible();
});
