import { expect, test } from "@playwright/test";

import { createProject, createShareLink, createWorkspace, loginViaOtp } from "../helpers/login";

// The dashboard's Comments panel (panel/CommentsTab.tsx) posts a "scroll to this
// comment" message across the cross-origin canvas iframe boundary - the widget
// (apps/widget/src/index.ts) listens for it, re-resolves the comment's anchor fresh,
// scrolls it into view, and opens its thread. Real bug this fixes: a pin that's
// off-screen (position-tracker.ts's intersectsViewport correctly hides it) or that
// simply hadn't rendered yet reads as "my comment is gone" even though the data is
// still there - clicking it in the list is how a reviewer actually finds it again.
test("clicking a comment in the dashboard's Comments panel opens its thread inside the canvas", async ({
  page,
}) => {
  const email = `commentsnav-${Date.now()}@example.com`;
  await loginViaOtp(page, email);
  const workspaceSlug = await createWorkspace(page, `CommentsNav ${Date.now()}`);
  const projectId = await createProject(page, "Client Site", "https://example.com");
  await createShareLink(page, workspaceSlug, projectId);

  await page.goto(`/w/${workspaceSlug}/p/${projectId}`);
  await page.waitForSelector('button[aria-label="Details"]', { timeout: 10_000 });

  // Post a real comment through the dashboard's own canvas iframe (proxy mode).
  const frame = page.frameLocator("iframe");
  const nameInput = frame.locator('input[placeholder="Jamie"]');
  const namePromptAppeared = await nameInput
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (namePromptAppeared) {
    await nameInput.fill("Nav Tester");
    await frame.locator('button:has-text("Continue")').click();
  }
  await frame
    .locator("text=Tap anywhere on the page to leave feedback.")
    .waitFor({ timeout: 10_000 });
  await frame.locator("h1").first().click();
  await frame.locator('textarea[placeholder="What needs to change here?"]').fill("Find me again");
  await frame.locator('button:has-text("Post comment")').click();
  await frame.locator("text=Comment posted.").waitFor({ timeout: 15_000 });

  // A real bug found by hand: the thread opened at the *anchored element's* raw
  // top-left corner instead of the pin's own actual position (which keeps the
  // original click-time offset within that element) - for anything wider/taller than
  // a point, that's a visibly different spot from where the pin (and the comment)
  // actually sits. Record the pin's real position now, before navigating away, so it
  // can be compared against where the thread opens later.
  const pinBoxBefore = await frame.locator(".bl-pin").boundingBox();
  expect(pinBoxBefore).not.toBeNull();

  await page.click('button[aria-label="Comments"]');
  await expect(page.locator("text=Find me again")).toBeVisible({ timeout: 10_000 });

  // Click the comment row itself (not its resolve/menu buttons).
  await page.locator("text=Find me again").click();

  // The widget should have received the message, resolved the anchor, and opened
  // that exact comment's thread view inside the iframe.
  await expect(frame.locator(".bl-thread")).toBeVisible({ timeout: 10_000 });
  await expect(frame.locator(".bl-thread-message-body")).toHaveText("Find me again");

  const pinBoxAfter = await frame.locator(".bl-pin").boundingBox();
  expect(pinBoxAfter).not.toBeNull();
  expect(Math.abs(pinBoxAfter!.x - pinBoxBefore!.x)).toBeLessThan(2);
  expect(Math.abs(pinBoxAfter!.y - pinBoxBefore!.y)).toBeLessThan(2);

  // The thread panel itself should open right next to that same pin, not off at the
  // anchored element's corner.
  const threadBox = await frame.locator(".bl-thread").boundingBox();
  expect(threadBox).not.toBeNull();
  expect(Math.abs(threadBox!.x - pinBoxAfter!.x)).toBeLessThan(60);
  expect(Math.abs(threadBox!.y - pinBoxAfter!.y)).toBeLessThan(60);
});
