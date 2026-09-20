import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { createProject, createWorkspace, loginViaOtp } from "../helpers/login";

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

// Covers the widget's comment/reply attachment upload (paperclip button, eager
// per-file upload, pending -> uploaded chip state), the resulting thread-view link
// (opens in a new tab, points at a real fetchable URL - not a dead link), and the
// dashboard Comments panel picking up the top-level comment's own attachment.
test("comment attachments: upload, card display, new-tab link, dashboard display", async ({
  page,
  context,
}) => {
  const email = `attach-${Date.now()}@example.com`;
  await loginViaOtp(page, email);
  const workspaceSlug = await createWorkspace(page, `Attach ${Date.now()}`);
  const projectId = await createProject(page, "Attach Site", "https://example.com");

  // Project route should NOT show the dashboard sidebar (a separate route tree from
  // the workspace dashboard - apps/web/src/app/layout/ProjectLayout.tsx).
  await page.goto(`/w/${workspaceSlug}/p/${projectId}`);
  await page.waitForSelector('button[aria-label="Details"]', { timeout: 10_000 });
  await expect(page.locator("text=Recent Projects")).not.toBeVisible();
  await expect(page.locator("text=Project Types")).not.toBeVisible();

  const frame = page.frameLocator("iframe");
  const nameInput = frame.locator('input[placeholder="Jamie"]');
  const namePromptAppeared = await nameInput
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (namePromptAppeared) {
    await nameInput.fill("Attach Tester");
    await frame.locator('button:has-text("Continue")').click();
  }
  await frame
    .locator("text=Tap anywhere on the page to leave feedback.")
    .waitFor({ timeout: 10_000 });

  await frame.locator("h1").click();
  await frame.locator('textarea[placeholder="What needs to change here?"]').fill("check this brief");

  // Attach a PDF via the paperclip button.
  await frame.locator('.bl-composer button:has-text("Attach a screenshot")').click();
  await frame
    .locator('input[aria-label="Choose files to attach"]')
    .setInputFiles(path.join(FIXTURE_DIR, "brief.pdf"));

  // Chip appears, eventually loses its pending state once the upload completes.
  const chip = frame.locator(".bl-attachment-chip");
  await expect(chip).toBeVisible();
  await expect(chip).not.toHaveClass(/bl-attachment-pending/, { timeout: 10_000 });
  await expect(chip.locator(".bl-attachment-name")).toHaveText("brief.pdf");

  await frame.locator('button:has-text("Post comment")').click();
  await frame.locator("text=Comment posted.").waitFor({ timeout: 15_000 });

  // Reopen the thread by clicking the pin, verify the attachment link is there.
  await frame.locator(".bl-pin").first().click();
  const attachmentLink = frame.locator(".bl-attachment-link");
  await expect(attachmentLink).toBeVisible();
  await expect(attachmentLink).toHaveText(/brief\.pdf/);
  await expect(attachmentLink).toHaveAttribute("target", "_blank");
  const href = await attachmentLink.getAttribute("href");
  expect(href).toBeTruthy();

  // The href is a real, fetchable presigned URL - not a dead link. (Not driving an
  // actual click-opens-a-tab check here: Chrome's built-in PDF viewer hangs forever on
  // the fixture's fake, invalid PDF bytes - target="_blank" above already proves it
  // opens in a new tab/page rather than navigating the current one.)
  const fetchResp = await context.request.get(href!);
  expect(fetchResp.ok()).toBe(true);
  const fetchedBody = await fetchResp.text();
  expect(fetchedBody).toContain("fake pdf content");

  // Dashboard's Comments panel shows the comment's attachment too.
  await page.click('button[aria-label="Comments"]');
  await expect(page.locator('a[title="brief.pdf"]')).toBeVisible();
});
