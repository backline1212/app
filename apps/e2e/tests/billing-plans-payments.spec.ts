import { expect, test } from "@playwright/test";
import { createWorkspace, loginViaOtp } from "../helpers/login";

// Runs against a stack with no Stripe/Razorpay keys and BILLING_SANDBOX_ENABLED=true,
// so checkouts complete as test payments (docs/tdr/0051).
test.describe("Billing, plans & payments", () => {
  test("shows plans, switches period and currency, and compares tiers", async ({ page }) => {
    await loginViaOtp(page, `billing-view-${Date.now()}@example.com`);
    const workspaceSlug = await createWorkspace(page, `Billing Test ${Date.now()}`);
    await page.goto(`/w/${workspaceSlug}/billing`);

    await expect(page.getByRole("heading", { name: "Billing & plans" })).toBeVisible();
    const banner = page.locator(".bl-plan-banner");
    await expect(banner.getByRole("heading", { name: "Free Starter" })).toBeVisible();
    await expect(banner.getByText("Active projects")).toBeVisible();
    await expect(banner.getByText("Team seats")).toBeVisible();
    await expect(banner.getByText("AI credits this month")).toBeVisible();

    for (const name of ["Free Starter", "Solo Pro", "Team Standard", "Agency Enterprise"]) {
      await expect(page.getByRole("article", { name: `${name} plan` })).toBeVisible();
    }
    await expect(page.getByText("Most Popular")).toBeVisible();

    const solo = page.getByRole("article", { name: "Solo Pro plan" });
    const team = page.getByRole("article", { name: "Team Standard plan" });
    // Yearly is the default view.
    await expect(solo.getByText("$19")).toBeVisible();
    await expect(team.getByText("$49")).toBeVisible();

    await page.getByRole("button", { name: "Monthly", exact: true }).click();
    await expect(page).toHaveURL(/interval=monthly/);
    await expect(solo.getByText("$24")).toBeVisible();
    await expect(team.getByText("$59")).toBeVisible();

    await page.getByRole("button", { name: "₹ INR" }).click();
    await expect(page).toHaveURL(/currency=inr/);
    await expect(solo.getByText("₹1,899")).toBeVisible();
    await expect(team.getByText("₹4,699")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Compare every plan" })).toBeVisible();
    for (const group of ["Core Feedback & Review", "Video & Replay Capture", "Integrations & Team", "AI & Security"]) {
      await expect(page.getByRole("columnheader", { name: group })).toBeVisible();
    }
  });

  test("completes a test-mode upgrade and issues an invoice", async ({ page }) => {
    await loginViaOtp(page, `billing-pay-${Date.now()}@example.com`);
    const workspaceSlug = await createWorkspace(page, `Pay Test ${Date.now()}`);
    await page.goto(`/w/${workspaceSlug}/billing`);

    await page.getByRole("button", { name: "Upgrade to Team Standard" }).click();
    const checkout = page.getByRole("dialog", { name: "Get Team Standard" });
    await expect(checkout).toBeVisible();
    await expect(checkout.getByText("Test mode.")).toBeVisible();
    await expect(checkout.getByRole("button", { name: /Card or wallet/ })).toBeVisible();
    await expect(checkout.getByRole("button", { name: /UPI, RuPay & netbanking/ })).toBeVisible();

    await checkout.getByRole("button", { name: /Complete test payment/ }).click();
    const confirmed = page.getByRole("dialog", { name: "Test payment complete" });
    await expect(confirmed).toBeVisible();
    await confirmed.getByRole("button", { name: "Done" }).click();

    const banner = page.locator(".bl-plan-banner");
    await expect(banner.getByRole("heading", { name: /Team Standard/ })).toBeVisible();
    await expect(banner.getByText(/Paid through/)).toBeVisible();

    await expect(page.getByRole("heading", { name: "Invoices & receipts" })).toBeVisible();
    await expect(page.getByText(/INV-\d{4}-\d{4,}/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Download receipt" })).toBeVisible();
  });

  test("blocks a project over the free limit until the plan is upgraded", async ({ page }) => {
    await loginViaOtp(page, `limit-test-${Date.now()}@example.com`);
    const workspaceSlug = await createWorkspace(page, `Limit Workspace ${Date.now()}`);

    const createProject = async (name: string, url: string) => {
      await page.goto(`/w/${workspaceSlug}`);
      await page.getByRole("button", { name: /New Project|Create Project/i }).click();
      await page.fill('input[placeholder*="Website or client name"]', name);
      await page.fill('input[placeholder*="example.com"]', url);
      await page.getByRole("button", { name: "Create project" }).click();
    };

    // A new workspace starts with its sample project, so one more reaches Free's 2.
    await createProject("Project Alpha", "https://alpha.example.com");
    await expect(page.getByText("Project Alpha")).toBeVisible();

    await createProject("Project Beta", "https://beta.example.com");
    await expect(page.getByText(/Free Starter includes 2 active projects/)).toBeVisible();
    await page.getByRole("link", { name: "See plans" }).click();

    // The limit prompt deep-links to the recommended plan's checkout.
    const checkout = page.getByRole("dialog", { name: "Get Solo Pro" });
    await expect(checkout).toBeVisible();
    await checkout.getByRole("button", { name: /Complete test payment/ }).click();
    await page.getByRole("dialog", { name: "Test payment complete" }).getByRole("button", { name: "Done" }).click();
    await expect(page.locator(".bl-plan-banner").getByRole("heading", { name: /Solo Pro/ })).toBeVisible();

    await createProject("Project Beta", "https://beta.example.com");
    await expect(page.getByText("Project Beta")).toBeVisible();
  });
});
