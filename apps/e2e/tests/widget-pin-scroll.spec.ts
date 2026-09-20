import { expect, test } from "@playwright/test";

import { createProject, createShareLink, createWorkspace, loginViaOtp } from "../helpers/login";
import { openWidgetTestSite } from "../helpers/widget";

// A real bug found via manual testing on a live client site: the pin/composer used
// clientX/clientY (viewport-relative) with position: fixed, so they stayed glued to
// the screen coordinate where the reviewer clicked - the instant the page scrolled,
// they visually drifted off the element they were supposed to mark. Fixed by switching
// to pageX/pageY (document-relative) + position: absolute (apps/widget/src/ui.ts).
// This test scrolls for real and checks the pin's on-screen position shifts by exactly
// the scroll delta - the same math that proves "attached to the document" vs
// "attached to the viewport."
test("pin and composer stay attached to the clicked element across a scroll", async ({
  page,
}) => {
  const email = `pinscroll-${Date.now()}@example.com`;
  await loginViaOtp(page, email);
  const workspaceSlug = await createWorkspace(page, `PinScroll ${Date.now()}`);
  const projectId = await createProject(page, "Client Site", "https://example.com");
  const shareToken = await createShareLink(page, workspaceSlug, projectId);

  await openWidgetTestSite(page, shareToken);
  await page.waitForSelector('input[placeholder="Jamie"]', { timeout: 10_000 });
  await page.fill('input[placeholder="Jamie"]', "Scroll Tester");
  await page.click('button:has-text("Continue")');
  await page.waitForSelector("text=Tap anywhere on the page to leave feedback.", {
    timeout: 10_000,
  });

  await page.click("h2:has-text('Testimonials')");
  await page.waitForSelector('textarea[placeholder="What needs to change here?"]', {
    timeout: 10_000,
  });

  const pin = page.locator(".bl-pin");
  const composer = page.locator(".bl-composer");
  const pinBoxBefore = await pin.boundingBox();
  const composerBoxBefore = await composer.boundingBox();
  if (!pinBoxBefore || !composerBoxBefore) throw new Error("Pin/composer not rendered");

  const scrollDelta = 300;
  await page.evaluate((delta) => window.scrollBy(0, delta), scrollDelta);
  await page.waitForTimeout(100);

  const pinBoxAfter = await pin.boundingBox();
  const composerBoxAfter = await composer.boundingBox();
  if (!pinBoxAfter || !composerBoxAfter) throw new Error("Pin/composer disappeared on scroll");

  // On-screen (viewport) position must have moved up by exactly the scroll amount -
  // that's what "stayed attached to the document, not the viewport" looks like.
  // `position: fixed` (the bug) would leave these numbers at ~0 instead.
  expect(pinBoxBefore.y - pinBoxAfter.y).toBeCloseTo(scrollDelta, 0);
  expect(composerBoxBefore.y - composerBoxAfter.y).toBeCloseTo(scrollDelta, 0);
});
