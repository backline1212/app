import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createProject, createWorkspace, loginViaOtp } from "../helpers/login";
import { openWidgetTestSite } from "../helpers/widget";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// The widget renders into a shadow root injected on a *third-party* page
// (07-Review-SDK.md) - a real dashboard flow generates the share token, then a second
// page (standing in for the client's site) loads the built apps/widget/dist/sdk.js
// against that token, exactly as a real embed would.
test("widget (name prompt + composer) has no WCAG AA violations", async ({ page, context }) => {
  const email = `a11y-widget-${Date.now()}@example.com`;
  await loginViaOtp(page, email);
  const workspaceSlug = await createWorkspace(page, `A11y Widget ${Date.now()}`);
  const projectId = await createProject(page, "Widget A11y Project", "https://example.com");

  await page.goto(`/w/${workspaceSlug}/p/${projectId}/share-links`);
  await page.click('button:has-text("Create share link")');
  await page.waitForSelector(".font-mono", { timeout: 10_000 });
  const shareToken = (await page.textContent(".font-mono"))?.trim();
  if (!shareToken) throw new Error("Could not read the created share link's token");

  const widgetPage = await context.newPage();
  await openWidgetTestSite(widgetPage, shareToken);

  await test.step("name prompt (guest session not yet established)", async () => {
    await widgetPage.waitForSelector('input[placeholder="Jamie"]', { timeout: 10_000 });
    const results = await new AxeBuilder({ page: widgetPage }).withTags(WCAG_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  await test.step("composer (after submitting a display name and clicking the page)", async () => {
    await widgetPage.fill('input[placeholder="Jamie"]', "Accessibility Tester");
    await widgetPage.click('button:has-text("Continue")');
    await widgetPage.waitForSelector("text=Tap anywhere on the page to leave feedback.", {
      timeout: 10_000,
    });
    await widgetPage.click("h2:has-text('Pricing')");
    await widgetPage.waitForSelector('textarea[placeholder="What needs to change here?"]', {
      timeout: 10_000,
    });
    const results = await new AxeBuilder({ page: widgetPage }).withTags(WCAG_TAGS).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  await widgetPage.close();
});
