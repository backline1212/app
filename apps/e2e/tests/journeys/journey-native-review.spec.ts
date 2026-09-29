import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test, type APIResponse } from "@playwright/test";

// Real API, database, S3-compatible storage, production bundles and MV3 extension.
// Only the reviewed target and identity provider are local HTTP fixtures. No external
// credentials are needed, and all test data stays in the isolated local stack.
const web = process.env.WEB_BASE_URL ?? "http://localhost:5173";
const api = process.env.API_BASE_URL ?? "http://localhost:8000";
const extension = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../extension/dist");
const site = "https://private.example";
const provider = "https://accounts.example.test";

async function json(response: APIResponse) {
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}

test("password and OAuth-style sign-in, member and guest comments stay on the real website", async () => {
  expect(fs.existsSync(path.join(extension, "manifest.json")), "Build the extension first").toBeTruthy();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "backline-native-review-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    await context.route(`${site}/**`, async route => {
      const url = new URL(route.request().url());
      const signedIn = route.request().headers().cookie?.includes("site_session=valid");
      if (url.pathname === "/password" || url.pathname === "/oauth/callback") {
        return route.fulfill({ status: 302, headers: {
          location: `${site}/app`, "set-cookie": "site_session=valid; Path=/; Secure; HttpOnly; SameSite=Lax",
        }, body: "" });
      }
      if (url.pathname === "/logout") {
        return route.fulfill({ status: 302, headers: {
          location: `${site}/app`, "set-cookie": "site_session=; Max-Age=0; Path=/; Secure; HttpOnly",
        }, body: "" });
      }
      if (!signedIn) {
        return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>Sign in</title>
          <h1>Site sign in</h1><form action="/password" method="post"><input name="password" type="password"><button>Password login</button></form>
          <a id="google" href="${provider}/auth">Sign in with Google</a>` });
      }
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>Private app</title>
        <h1>Authenticated app</h1><button id="review-target">Review this</button>
        <button id="next" onclick="history.pushState({}, '', '/settings'); document.querySelector('h1').textContent='Private settings'">Settings</button>` });
    });
    await context.route(`${provider}/**`, route => route.fulfill({ contentType: "text/html", body:
      `<h1>Identity provider</h1><a id="consent" href="${site}/oauth/callback">Continue with account</a>` }));

    const page = await context.newPage();
    const email = `native-${Date.now()}@example.com`;
    const password = "DryRun!2026-Strong";
    const signup = await json(await context.request.post(`${api}/api/v1/auth/signup`, {
      data: { name: "Native reviewer", email, password },
    }));
    const workspace = await json(await context.request.post(`${api}/api/v1/workspaces`, {
      headers: { Authorization: `Bearer ${signup.access_token}` }, data: { name: "Native review dry run" },
    }));
    const switched = await json(await context.request.post(`${api}/api/v1/auth/switch-workspace`, {
      headers: { Authorization: `Bearer ${signup.access_token}` }, data: { workspace_id: workspace.id },
    }));
    const project = await json(await context.request.post(`${api}/api/v1/workspaces/${workspace.id}/projects`, {
      headers: { Authorization: `Bearer ${switched.access_token}` },
      data: { name: "Private app", target_origin: `${site}/app`, project_type: "website" },
    }));
    const links = await json(await context.request.get(`${api}/api/v1/projects/${project.id}/share-links`, {
      headers: { Authorization: `Bearer ${switched.access_token}` },
    }));
    expect(links.length).toBeGreaterThan(0);

    await page.goto(`${web}/login`);
    await page.locator("#lgInMail").fill(email);
    await page.locator("#lgInPw").fill(password);
    await Promise.all([
      page.waitForResponse(response => response.url() === `${api}/api/v1/auth/login` && response.status() === 200),
      page.locator("#lg-in button[type=submit]").click(),
    ]);
    await page.waitForURL(url => url.pathname !== "/login");
    await page.goto(`${web}/w/${workspace.slug}/p/${project.id}`);
    const button = page.getByRole("button", { name: "Browser review" });
    await expect(button).toBeVisible();
    const newTab = context.waitForEvent("page");
    await button.click();
    const target = await newTab;
    await target.waitForURL(`${site}/app`);
    await expect(target.getByRole("heading", { name: "Site sign in" })).toBeVisible();
    await target.getByRole("button", { name: "Password login" }).click();
    await expect(target.getByRole("heading", { name: "Authenticated app" })).toBeVisible();
    await expect(target.getByRole("toolbar", { name: "Backline browser review" })).toBeVisible();

    async function comment(body: string) {
      await target.getByRole("button", { name: "Comment", exact: true }).click();
      await target.locator("#review-target").click();
      await target.locator('[role="dialog"][aria-label="New comment"] textarea').fill(body);
      await target.locator('[role="dialog"][aria-label="New comment"] .bl-submit').click();
      await expect(target.getByText("Comment posted.")).toBeVisible();
      await expect(target.locator('[role="dialog"][aria-label="New comment"]')).toHaveCount(0);
    }
    await comment("Member on password-protected page");
    await target.getByRole("button", { name: "Browse", exact: true }).click();
    await target.locator("#next").click();
    await target.waitForURL(`${site}/settings`);
    await expect(target.getByRole("button", { name: "Browse", exact: true })).toHaveAttribute("aria-pressed", "true");
    await comment("Member on SPA settings page");

    await target.goto(`${site}/logout`);
    await expect(target.getByRole("heading", { name: "Site sign in" })).toBeVisible();
    await target.locator("#google").click();
    await target.waitForURL(`${provider}/auth`);
    await expect(target.getByRole("toolbar", { name: "Backline browser review" })).toHaveCount(0);
    await target.locator("#consent").click();
    await target.waitForURL(`${site}/app`);
    await expect(target.getByRole("toolbar", { name: "Backline browser review" })).toBeVisible();
    await comment("Member after provider redirect");

    const guest = await context.newPage();
    await guest.goto(`${web}/review/${links[0].token}`);
    await guest.getByPlaceholder("Ravi Kulkarni").fill("Guest reviewer");
    await guest.getByRole("button", { name: "Start reviewing" }).click();
    await expect(guest.getByRole("button", { name: "Browser review" })).toBeVisible();
    await guest.getByRole("button", { name: "Browser review" }).click();
    await target.bringToFront();
    await expect(target.getByRole("toolbar", { name: "Backline browser review" })).toBeVisible();
    await comment("Guest on already signed-in website");

    const comments = await json(await context.request.get(`${api}/api/v1/projects/${project.id}/comments`, {
      headers: { Authorization: `Bearer ${switched.access_token}` },
    }));
    for (const body of ["Member on password-protected page", "Member on SPA settings page", "Member after provider redirect", "Guest on already signed-in website"]) {
      expect(comments.some((item: { body: string }) => item.body === body), body).toBeTruthy();
    }
    const member = comments.find((item: { body: string }) => item.body === "Member after provider redirect");
    expect(member.capture_status).toBe("ok");
    expect(member.screenshot_url).toMatch(/^http:\/\/127\.0\.0\.1:9000\//);
    const guestComment = comments.find((item: { body: string }) => item.body === "Guest on already signed-in website");
    expect(guestComment.author_name).toBe("Guest reviewer");
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});
