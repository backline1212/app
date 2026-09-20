import { expect, test } from "@playwright/test";

import { createProject, createShareLink, createWorkspace, loginViaOtp } from "../helpers/login";

// A real bug found by hand: openThreadForComment (apps/widget/src/index.ts) never
// closed a previously-open thread before opening a new one. Clicking a pin directly
// rarely hits this (an outside click naturally dismisses the old one first), but
// clicking through several comments in the dashboard's Comments panel in a row - each
// one triggered from *outside* the iframe via postMessage, with no "outside click"
// ever happening inside it - just kept stacking new .bl-thread panels on top of each
// other, so an older thread's body text could still be showing (or ambiguously
// matching) after clicking a different comment entirely.
test("clicking through several comments in the Comments panel opens each thread cleanly, one at a time", async ({
  page,
}) => {
  const email = `multinav-${Date.now()}@example.com`;
  await loginViaOtp(page, email);
  const workspaceSlug = await createWorkspace(page, `MultiNav ${Date.now()}`);
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
        await nameInput.fill("Multi Tester");
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
    // No explicit dismiss click needed: openComposer's outside-click handler
    // (apps/widget/src/ui.ts) is registered on the capture phase, so the *next*
    // postComment's own click on its target element removes this stale, already-
    // submitted composer before that same click goes on to create the next pin -
    // one click does both. A separate dismiss click here was actually creating a 4th,
    // never-cleaned-up stray pin after the last comment (nothing followed it to cancel
    // it), which is exactly the bug this replaces.
    await page.waitForTimeout(300);
  }

  await postComment("h1", "on the heading", true);
  await postComment("p >> nth=0", "on the first paragraph", false);
  await postComment("a:has-text('Learn more')", "on learn more", false);

  await expect(frame.locator(".bl-pin")).toHaveCount(3);

  await page.click('button[aria-label="Comments"]');
  for (const body of ["on the heading", "on the first paragraph", "on learn more"]) {
    await page.locator(`text=${body}`).first().click();
    // Exactly one thread panel, showing exactly this comment's body - not still
    // showing (or ambiguously matching) a previous click's stacked-up panel.
    await expect(frame.locator(".bl-thread")).toHaveCount(1);
    await expect(frame.locator(".bl-thread-message-body")).toHaveText(body, { timeout: 10_000 });
  }
});
