import { expect, test } from "@playwright/test";

import { createProject, createShareLink, createWorkspace, loginViaOtp } from "../helpers/login";
import { openWidgetTestSite, postCommentViaWidget } from "../helpers/widget";

// Clicking an existing pin opens a read-only card (apps/widget/src/ui-comment-view.ts):
// the comment as it was posted - author, text, tag, attachments - with no reply box and
// no edit/delete actions.
test.describe("existing comments: read-only card", () => {
  async function setUpProject(page: import("@playwright/test").Page, label: string) {
    const email = `${label}-${Date.now()}@example.com`;
    await loginViaOtp(page, email);
    const workspaceSlug = await createWorkspace(page, `${label} ${Date.now()}`);
    const projectId = await createProject(page, "Client Site", "https://example.com");
    return createShareLink(page, workspaceSlug, projectId);
  }

  test("an existing comment's pin survives reload and opens its thread on click", async ({
    page,
  }) => {
    const shareToken = await setUpProject(page, "thread1");
    await openWidgetTestSite(page, shareToken);
    await postCommentViaWidget(page, shareToken, "Original message", {
      displayName: "Thread Tester",
    });

    // Reload to prove this comes from the fetch-and-render-existing-comments path
    // (index.ts), not just the in-memory pin left over from creating it.
    await page.reload();
    await expect(page.locator(".bl-pin")).toHaveCount(1, { timeout: 10_000 });

    await page.click(".bl-pin");
    await expect(page.locator(".bl-thread")).toBeVisible();
    await expect(page.locator(".bl-thread-message-body")).toHaveText("Original message");
    await expect(page.locator(".bl-thread-message-author")).toHaveText("Thread Tester");
    // Posted with the composer's default tag; nothing in the card is editable.
    await expect(page.locator(".bl-thread .bl-cp-tag")).toHaveText("Bug");
    await expect(page.locator(".bl-thread textarea")).toHaveCount(0);
  });

  test("another guest can see someone else's comment, read-only", async ({ browser }) => {
    const setupContext = await browser.newContext();
    const setupPage = await setupContext.newPage();
    const shareToken = await setUpProject(setupPage, "thread4");
    await openWidgetTestSite(setupPage, shareToken);
    await postCommentViaWidget(setupPage, shareToken, "Guest A's comment", {
      displayName: "Guest A",
    });
    await setupContext.close();

    // A second, independent guest (separate browser context - guest identity lives in
    // sessionStorage, scoped per tab).
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await openWidgetTestSite(page2, shareToken);
    await page2.waitForSelector('input[placeholder="Jamie"]', { timeout: 10_000 });
    await page2.fill('input[placeholder="Jamie"]', "Guest B");
    await page2.click('button:has-text("Continue")');

    await expect(page2.locator(".bl-pin")).toHaveCount(1, { timeout: 10_000 });
    await page2.click(".bl-pin");
    await expect(page2.locator(".bl-thread-message-body")).toHaveText("Guest A's comment");
    await expect(page2.locator(".bl-thread-message-author")).toHaveText("Guest A");
    await expect(page2.locator(".bl-thread textarea")).toHaveCount(0);

    await context2.close();
  });
});
