import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_SITE_PATH = path.resolve(__dirname, "../../widget/test-site/index.html");

/** Opens the widget test-site under a real share token, as a third-party page would. */
export async function openWidgetTestSite(page: Page, shareToken: string): Promise<void> {
  // API_BASE_URL, not WEB_BASE_URL (playwright.config.ts's baseURL) - the widget talks
  // to the backend directly, never through the dashboard's own origin.
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";
  await page.goto(
    `file://${TEST_SITE_PATH}?shareToken=${shareToken}&apiBaseUrl=${encodeURIComponent(apiBaseUrl)}`,
  );
}

/**
 * Drives the full guest widget flow for real: name prompt (if this is a fresh guest
 * session) -> click an element -> composer -> submit. Returns the guest session token
 * so a caller can also make direct API calls as this same guest (07-Review-SDK.md §7.2
 * stores it in sessionStorage, keyed by share token, not localStorage).
 */
export async function postCommentViaWidget(
  page: Page,
  shareToken: string,
  body: string,
  { displayName = "Client Reviewer", clickSelector = "h2:has-text('Pricing')" } = {},
): Promise<{ guestSessionToken: string; pageId: string }> {
  const pageRegistered = page.waitForResponse(
    (resp) => resp.url().includes("/api/v1/pages") && resp.request().method() === "POST",
  );

  const nameInput = page.locator('input[placeholder="Jamie"]');
  if (await nameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await nameInput.fill(displayName);
    await page.click('button:has-text("Continue")');
  }
  const pageId = ((await (await pageRegistered).json()) as { id: string }).id;

  // The click listener that turns a page click into a pin+composer is only attached
  // after init()'s snapshot submission and showTooltip() calls finish (index.ts) - both
  // happen after page registration, so clicking immediately on the pageRegistered
  // response is a real race (the click can land before the listener exists at all).
  // The tooltip's appearance is the observable signal that init() has reached that point.
  await page.waitForSelector("text=Tap anywhere on the page to leave feedback.", {
    timeout: 10_000,
  });
  await page.click(clickSelector);
  await page.waitForSelector('textarea[placeholder="What needs to change here?"]', {
    timeout: 10_000,
  });
  await page.fill('textarea[placeholder="What needs to change here?"]', body);
  await page.click('button:has-text("Post comment")');
  await page.waitForSelector("text=Comment posted.", { timeout: 15_000 });

  const guestSessionToken = await page.evaluate((token: string) => {
    const raw = sessionStorage.getItem(`backline:guest-session:${token}`);
    return raw ? (JSON.parse(raw) as { guestSessionToken: string }).guestSessionToken : "";
  }, shareToken);
  if (!guestSessionToken) throw new Error("Could not read guest session token from sessionStorage");
  return { guestSessionToken, pageId };
}
