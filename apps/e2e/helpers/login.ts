import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

const BACKEND_LOG_PATH = process.env.BACKEND_LOG_PATH;

// otp/request is IP-rate-limited to 5/min (Milestone 11, core/config.py) - every test in
// this suite runs against one shared backend from one machine, so without this every
// login past the 5th in any given minute would 429. A fake IP per email (mirroring
// backend/tests/helpers.py's _fake_ip_for) puts each test in its own bucket, the same
// way distinct real guests would have distinct IPs.
function fakeIpFor(seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex");
  const octets = [0, 2, 4, 6].map((i) => parseInt(digest.slice(i, i + 2), 16));
  return octets.join(".");
}

// Without a configured RESEND_API_KEY, app/core/email.py logs the OTP code instead of
// emailing it (same local-dev convention every milestone's real-browser verification
// has relied on since M6). BACKEND_LOG_PATH must point at the uvicorn process's stdout.
function readOtpCodeFor(email: string): string {
  if (!BACKEND_LOG_PATH) {
    throw new Error(
      "BACKEND_LOG_PATH env var is required - point it at the running backend's stdout log.",
    );
  }
  const log = readFileSync(BACKEND_LOG_PATH, "utf-8");
  const idx = log.lastIndexOf(`to=${email}`);
  if (idx === -1) throw new Error(`No OTP email logged for ${email}`);
  const chunk = log.slice(idx, idx + 400);
  const match = chunk.match(/<strong>(\d{6})<\/strong>/);
  if (!match) throw new Error(`Could not find a 6-digit code in log chunk: ${chunk}`);
  return match[1];
}

async function waitForUrlMatch(page: Page, pattern: RegExp, timeout = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (pattern.test(page.url())) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for URL to match ${pattern}; last url = ${page.url()}`);
}

/**
 * Logs in via the real OTP flow and lands on the workspace picker. Since TDR-0053 the
 * login page leads with a password; the emailed code sits behind "Forgot password?",
 * and a verified code offers to set a password, which is skipped here.
 */
export async function loginViaOtp(page: Page, email: string): Promise<void> {
  await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": fakeIpFor(email) });
  await page.goto("/login");
  await page.click('button:has-text("Forgot password?")');
  await page.fill('input[type="email"]', email);
  await page.click('button:has-text("Send the sign-in code")');
  await page.waitForSelector('input[inputmode="numeric"]', { timeout: 10_000 });
  await page.waitForTimeout(300); // let the backend finish logging the email
  const code = readOtpCodeFor(email);
  await page.fill('input[inputmode="numeric"]', code);
  await page.click('button:has-text("Verify and sign in")');
  await page.click('button:has-text("Skip for now")');
  await waitForUrlMatch(page, /\/$|\/w\//);
}

/** Creates a brand-new workspace from the picker and returns its slug. */
export async function createWorkspace(page: Page, name: string): Promise<string> {
  await page.waitForSelector("text=Your workspaces", { timeout: 10_000 });
  await page.fill("form input[required]", name);
  await page.click('button:has-text("New Workspace")');
  await waitForUrlMatch(page, /\/w\/[^/]+$/);
  const slug = page.url().split("/w/")[1];
  if (!slug) throw new Error(`Could not parse workspace slug from ${page.url()}`);
  return slug;
}

/** Creates a project via the "+ New Project" modal on the workspace dashboard, returns its id. */
export async function createProject(
  page: Page,
  name: string,
  targetOrigin: string,
): Promise<string> {
  await page.waitForSelector('button:has-text("Add a website to review")', { timeout: 10_000 });
  await page.click('button:has-text("Add a website to review")');
  await page.waitForSelector('dialog[aria-label="New project"]');
  await page.click('button:has-text("Website")');
  await page.click('dialog button:has-text("Continue")');

  await page.waitForSelector('dialog[aria-label="Add the page to review"]');
  await page.fill('dialog input#project-name', name);
  await page.fill('dialog input#project-url', targetOrigin);
  await page.click('dialog button:has-text("Create project")');

  await page.waitForSelector('dialog[aria-label="Project created"]');
  await page.click('dialog a:has-text("Open project")');

  await waitForUrlMatch(page, /\/w\/[^/]+\/p\/[^/]+$/);
  const projectId = page.url().split("/p/")[1];
  if (!projectId) throw new Error(`Could not parse project ID from ${page.url()}`);
  return projectId;
}

/**
 * The dashboard's access token lives in memory only (13-Authentication.md §13.6) - not
 * a cookie, not localStorage - so a Playwright `request` context can't inherit it the
 * way it would inherit cookies. This watches every authenticated API call the page
 * itself makes and tracks the *latest* `Authorization` header, for reuse in direct API
 * calls a test needs to make outside the browser's own JS (e.g. driving the recovery
 * pipeline with a specific snapshot payload no UI form exists for). Latest, not first:
 * the token right after login is workspace-less (`switch-workspace` swaps it for a
 * workspace-scoped one once a workspace exists), and a workspace-scoped endpoint like
 * page registration would 403 against the pre-switch token.
 */
export function trackAuthHeader(page: Page): () => string {
  let latest = "";
  page.on("request", (request) => {
    const auth = request.headers()["authorization"];
    if (auth) latest = auth;
  });
  return () => latest;
}

/** From a project's Share Links page, creates a link and returns its token. */
export async function createShareLink(
  page: Page,
  workspaceSlug: string,
  projectId: string,
): Promise<string> {
  await page.goto(`/w/${workspaceSlug}/p/${projectId}/share-links`);
  await page.click('button:has-text("Create share link")');
  await page.waitForSelector(".font-mono", { timeout: 10_000 });
  const token = (await page.textContent(".font-mono"))?.trim();
  if (!token) throw new Error("Could not read the created share link's token");
  return token;
}
