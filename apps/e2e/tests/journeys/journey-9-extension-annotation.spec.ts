import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

import { createWorkspace, loginViaOtp, trackAuthHeader } from "../../helpers/login";

// Browser-extension plan, Phase 4 milestone: load the real unpacked extension, connect
// it via a token generated through the actual dashboard settings UI (not a raw API
// call - same "drive the real UI" convention every other journey in this file uses),
// then drop a point comment on a live page and confirm it landed on the auto-created
// project via a direct API check (the same technique journey-1 uses for its share-link
// assertion).
//
// This needs its own browser context rather than the shared `page` fixture other
// journeys use: loading a Manifest V3 extension requires `launchPersistentContext`
// with `--load-extension`, which the default Playwright config's fixtures don't set up
// (19-Testing-CI.md's stack assumes no extension is involved anywhere else).
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:5173";
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000";
const EXTENSION_DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../extension/dist",
);
const TARGET_URL = "https://example.com";
const COMMENT_BODY = "This heading needs more contrast - Journey 9";

test("member connects the extension and drops a point comment on a live site", async () => {
  test.skip(
    !fs.existsSync(path.join(EXTENSION_DIST, "manifest.json")),
    `Build the extension first: pnpm --filter @backline/extension build (expected ${EXTENSION_DIST})`,
  );

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "backline-extension-"));
  // Chrome only loads extensions in a real (or "new" headless) window, never the
  // classic --headless mode - hence launchPersistentContext with headless: false here,
  // unlike every other journey which uses the shared, ordinarily-headless `page` fixture.
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_DIST}`,
      `--load-extension=${EXTENSION_DIST}`,
    ],
  });

  try {
    const dashboardPage = await context.newPage();
    const authHeader = trackAuthHeader(dashboardPage);
    const email = `journey9-${Date.now()}@example.com`;

    await dashboardPage.goto(`${WEB_BASE_URL}/login`);
    await loginViaOtp(dashboardPage, email);
    const workspaceSlug = await createWorkspace(dashboardPage, `Journey9 ${Date.now()}`);

    // Generate the extension token from the real settings page, same as a real member
    // would - reveal-once input lives in the "Copy your token" section (ExtensionSettingsPage.tsx).
    await dashboardPage.goto(`${WEB_BASE_URL}/w/${workspaceSlug}/extension`);
    await dashboardPage.fill('input[placeholder="Work laptop - Chrome"]', "Journey 9 Chrome");
    await dashboardPage.click('button:has-text("Generate token")');
    const tokenInput = dashboardPage.locator('section:has-text("Copy your token") input');
    await tokenInput.waitFor({ state: "visible", timeout: 10_000 });
    const token = await tokenInput.inputValue();
    expect(token).toBeTruthy();

    // The background service worker only starts once the extension is actually loaded -
    // waiting for it is also how the extension's id (only ever known at load time, since
    // it's derived from the unpacked path) is recovered.
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent("serviceworker", { timeout: 10_000 });
    const extensionId = new URL(worker.url()).host;

    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.fill("#token-input", token);
    await popupPage.click('#connect-form button[type="submit"]');
    await popupPage.waitForSelector("#connected-view", { state: "visible" });

    // The target page must be Chrome's actual active tab before triggering annotation
    // mode - chrome.tabs.query({active:true}) inside popup.ts resolves against whichever
    // tab is currently selected, and the point is to activate annotation on the real
    // site's tab, not on the popup's own (also just a regular tab, from Playwright's
    // point of view) tab. Bringing the popup back to front to click its own button would
    // flip that selection the wrong way, so this deliberately never does that - Playwright
    // can dispatch a click on a background tab without needing OS-level focus.
    const targetPage = await context.newPage();
    await targetPage.goto(TARGET_URL);
    await targetPage.bringToFront();

    await popupPage.click("#activate-point-btn");

    // Point mode is now live on targetPage's content script (Shadow DOM, so Playwright's
    // default CSS locators pierce it transparently - no special handling needed).
    await targetPage.bringToFront();
    await targetPage.click("h1");
    const composerTextarea = targetPage.locator(".bl-composer textarea");
    await composerTextarea.waitFor({ state: "visible", timeout: 10_000 });
    await composerTextarea.fill(COMMENT_BODY);
    await targetPage.click(".bl-composer .bl-submit");
    await expect(targetPage.locator(".bl-composer .bl-status")).toHaveText(
      "Comment posted.",
      { timeout: 15_000 },
    );

    // Verify server-side, the same way journey-1 verifies its share link: the project
    // was auto-created for this origin, and the comment landed on it.
    const workspacesResp = await dashboardPage.request.get(`${API_BASE_URL}/api/v1/workspaces`, {
      headers: { Authorization: authHeader() },
    });
    const workspaces = await workspacesResp.json();
    const workspace = workspaces.find((w: { slug: string }) => w.slug === workspaceSlug);
    expect(workspace).toBeTruthy();

    const projectsResp = await dashboardPage.request.get(
      `${API_BASE_URL}/api/v1/workspaces/${workspace.id}/projects`,
      { headers: { Authorization: authHeader() } },
    );
    const projects = await projectsResp.json();
    const project = projects.find((p: { target_origin: string }) => p.target_origin === TARGET_URL);
    expect(project).toBeTruthy();

    const commentsResp = await dashboardPage.request.get(
      `${API_BASE_URL}/api/v1/projects/${project.id}/comments`,
      { headers: { Authorization: authHeader() } },
    );
    const comments = await commentsResp.json();
    expect(comments.some((c: { body: string }) => c.body === COMMENT_BODY)).toBe(true);
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
