import { expect, test } from "@playwright/test";

import { createProject, createShareLink, createWorkspace, loginViaOtp } from "../helpers/login";

// A real bug found by hand: a comment left on one word partway through a paragraph
// ("...questions sound familiar...") jumped to the *start* of that paragraph after a
// reload. A selector path resolves no finer than a whole element, so the anchor is the
// entire <p>; the creation path passed the click offset to trackPinPosition, but the
// reload path passed none - so every restored pin snapped to its element's top-left
// corner. The anchor now carries click_offset_pct and both paths use it.
test("a pin restored after reload keeps its position within the element, not its corner", async ({
  page,
}) => {
  const email = `pinreload-${Date.now()}@example.com`;
  await loginViaOtp(page, email);
  const workspaceSlug = await createWorkspace(page, `PinReload ${Date.now()}`);
  const projectId = await createProject(page, "Client Site", "https://example.com");
  await createShareLink(page, workspaceSlug, projectId);

  await page.goto(`/w/${workspaceSlug}/p/${projectId}`);
  await page.waitForSelector('button[aria-label="Details"]', { timeout: 10_000 });

  const frame = page.frameLocator("iframe");
  const nameInput = frame.locator('input[placeholder="Jamie"]');
  const namePromptAppeared = await nameInput
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (namePromptAppeared) {
    await nameInput.fill("Pin Reload Tester");
    await frame.locator('button:has-text("Continue")').click();
  }
  await frame
    .locator("text=Tap anywhere on the page to leave feedback.")
    .waitFor({ timeout: 10_000 });

  // Click deliberately far from the paragraph's top-left corner - near its right edge,
  // which is what makes a corner-snap regression obvious rather than sub-pixel.
  const paragraph = frame.locator("p").first();
  const paraBox = (await paragraph.boundingBox())!;
  expect(paraBox.width).toBeGreaterThan(200);
  await paragraph.click({ position: { x: paraBox.width - 30, y: paraBox.height / 2 } });

  await frame.locator('textarea[placeholder="What needs to change here?"]').fill("on the word here");
  await frame.locator('button:has-text("Post comment")').click();
  await frame.locator("text=Comment posted.").waitFor({ timeout: 15_000 });

  const pinBefore = (await frame.locator(".bl-pin").boundingBox())!;
  // Sanity: the pin really is far from the paragraph's left edge, so the assertion
  // below is actually capable of catching a corner-snap.
  expect(pinBefore.x - paraBox.x).toBeGreaterThan(150);

  await page.reload();
  await page.waitForSelector('button[aria-label="Details"]', { timeout: 10_000 });
  const reloadedFrame = page.frameLocator("iframe");
  await reloadedFrame.locator(".bl-pin").waitFor({ timeout: 15_000 });
  const pinAfter = (await reloadedFrame.locator(".bl-pin").boundingBox())!;

  expect(Math.abs(pinAfter.x - pinBefore.x)).toBeLessThan(5);
  expect(Math.abs(pinAfter.y - pinBefore.y)).toBeLessThan(5);
});
