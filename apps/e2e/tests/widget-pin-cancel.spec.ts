import { expect, test } from "@playwright/test";

import { createProject, createShareLink, createWorkspace, loginViaOtp } from "../helpers/login";
import { openWidgetTestSite } from "../helpers/widget";

// A second real bug found by hand alongside the scroll-drift one: every click created a
// pin with no removal path at all - canceling a comment (the "x" button, or just
// clicking elsewhere) only ever removed the composer, never its pin, so clicking around
// a page a few times left a trail of permanent, unremovable stray pins. Fixed in
// apps/widget/src/ui.ts's openComposer via an onCancel callback the composer now fires
// on both dismissal paths, which index.ts uses to remove that attempt's pin.
test.describe("comment cancellation removes its pin", () => {
  async function setUp(page: import("@playwright/test").Page) {
    const email = `pincancel-${Date.now()}@example.com`;
    await loginViaOtp(page, email);
    const workspaceSlug = await createWorkspace(page, `PinCancel ${Date.now()}`);
    const projectId = await createProject(page, "Client Site", "https://example.com");
    const shareToken = await createShareLink(page, workspaceSlug, projectId);

    await openWidgetTestSite(page, shareToken);
    await page.waitForSelector('input[placeholder="Jamie"]', { timeout: 10_000 });
    await page.fill('input[placeholder="Jamie"]', "Cancel Tester");
    await page.click('button:has-text("Continue")');
    await page.waitForSelector("text=Tap anywhere on the page to leave feedback.", {
      timeout: 10_000,
    });
  }

  test("the explicit x button removes the composer and its pin", async ({ page }) => {
    await setUp(page);

    await page.click("h2:has-text('Pricing')");
    await page.waitForSelector('textarea[placeholder="What needs to change here?"]', {
      timeout: 10_000,
    });
    await expect(page.locator(".bl-pin")).toHaveCount(1);

    await page.click('button[aria-label="Cancel comment"]');

    await expect(page.locator(".bl-composer")).toHaveCount(0);
    await expect(page.locator(".bl-pin")).toHaveCount(0);
  });

  test("clicking elsewhere cancels the previous attempt instead of accumulating pins", async ({
    page,
  }) => {
    await setUp(page);

    await page.click("h2:has-text('Pricing')");
    await page.waitForSelector('textarea[placeholder="What needs to change here?"]', {
      timeout: 10_000,
    });
    await expect(page.locator(".bl-pin")).toHaveCount(1);

    // A second click elsewhere, on content that isn't part of the open composer -
    // should cancel the first attempt (removing its pin) and start a fresh one, not
    // leave both pins on the page.
    await page.click("h2:has-text('Testimonials')");
    await page.waitForSelector('textarea[placeholder="What needs to change here?"]', {
      timeout: 10_000,
    });

    await expect(page.locator(".bl-composer")).toHaveCount(1);
    await expect(page.locator(".bl-pin")).toHaveCount(1);
  });

  test("a successfully submitted comment's pin is not removed", async ({ page }) => {
    await setUp(page);

    await page.click("h2:has-text('Pricing')");
    await page.waitForSelector('textarea[placeholder="What needs to change here?"]', {
      timeout: 10_000,
    });
    await page.fill('textarea[placeholder="What needs to change here?"]', "Real feedback");
    await page.click('button:has-text("Post comment")');
    await page.waitForSelector("text=Comment posted.", { timeout: 15_000 });

    // Click elsewhere - the now-stale composer (still showing "Comment posted.")
    // dismisses via the outside-click path, but the submitted pin must survive: it
    // marks a real, persisted comment now, not an abandoned attempt.
    await page.click("h2:has-text('Testimonials')");
    await page.waitForTimeout(200);

    await expect(page.locator(".bl-pin")).toHaveCount(2);
  });
});
