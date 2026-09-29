import { expect, test } from "@playwright/test";
import { createWorkspace, loginViaOtp } from "../helpers/login";

test.describe("Billing, Plans & Payment Workflows", () => {
  test("loads billing page, switches currency/intervals, and views competitor comparison", async ({
    page,
  }) => {
    const email = `billing-view-${Date.now()}@example.com`;
    await loginViaOtp(page, email);
    const workspaceSlug = await createWorkspace(page, `Billing Test ${Date.now()}`);

    // Navigate to Billing settings
    await page.goto(`/w/${workspaceSlug}/billing`);

    // Verify page header
    await expect(page.getByRole("heading", { name: "Plans & Billing" })).toBeVisible();

    // Verify Current Plan Banner
    await expect(page.getByText("Free Plan")).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();
    await expect(page.getByText(/Projects Used/i)).toBeVisible();
    await expect(page.getByText(/Team Members/i)).toBeVisible();

    // Verify 4 Plan Cards are rendered
    await expect(page.getByText("Free Starter")).toBeVisible();
    await expect(page.getByText("Solo Pro")).toBeVisible();
    await expect(page.getByText("Team Standard")).toBeVisible();
    await expect(page.getByText("Agency Enterprise")).toBeVisible();
    await expect(page.getByText("Most Popular")).toBeVisible();

    // Default USD Monthly Pricing checks
    await expect(page.getByText("$24").first()).toBeVisible(); // Solo Monthly
    await expect(page.getByText("$59").first()).toBeVisible(); // Team Monthly

    // Switch to Annual billing
    const annualTab = page.getByRole("tab", { name: /Annual/i });
    await annualTab.click();
    await expect(page.getByText("$19").first()).toBeVisible(); // Solo Annual
    await expect(page.getByText("$49").first()).toBeVisible(); // Team Annual
    await expect(page.getByText(/Save ~20%/i).first()).toBeVisible();

    // Switch Currency to INR (₹)
    const inrTab = page.getByRole("tab", { name: /INR/i });
    await inrTab.click();
    await expect(page.getByText("₹1,499").first()).toBeVisible(); // Solo Annual INR
    await expect(page.getByText("₹3,899").first()).toBeVisible(); // Team Annual INR

    // Switch back to Monthly INR
    const monthlyTab = page.getByRole("tab", { name: /Monthly/i });
    await monthlyTab.click();
    await expect(page.getByText("₹1,899").first()).toBeVisible(); // Solo Monthly INR
    await expect(page.getByText("₹4,699").first()).toBeVisible(); // Team Monthly INR

    // Verify Competitor Comparison Matrix
    await expect(page.getByRole("heading", { name: "Detailed Feature & Tier Comparison" })).toBeVisible();
    await expect(page.getByText("Core Feedback & Review")).toBeVisible();
    await expect(page.getByText("Video & Replay Capture")).toBeVisible();
    await expect(page.getByText("Integrations & Team")).toBeVisible();
    await expect(page.getByText("AI & Security")).toBeVisible();
    await expect(page.getByText("BugHerd / Marker.io Benchmark")).toBeVisible();
  });

  test("completes upgrade flow via checkout modal and generates invoice record", async ({
    page,
  }) => {
    const email = `billing-pay-${Date.now()}@example.com`;
    await loginViaOtp(page, email);
    const workspaceSlug = await createWorkspace(page, `Pay Test ${Date.now()}`);

    // Navigate to Billing settings
    await page.goto(`/w/${workspaceSlug}/billing`);

    // Click Upgrade to Team
    const upgradeTeamBtn = page.getByRole("button", { name: "Upgrade to Team" });
    await expect(upgradeTeamBtn).toBeVisible();
    await upgradeTeamBtn.click();

    // Verify Checkout Modal appears
    const checkoutDialog = page.getByRole("dialog");
    await expect(checkoutDialog).toBeVisible();
    await expect(checkoutDialog.getByText("Complete your subscription")).toBeVisible();
    await expect(checkoutDialog.getByText("Team Standard Plan")).toBeVisible();

    // Verify payment tabs: Stripe, Razorpay, UPI QR
    await expect(checkoutDialog.getByRole("tab", { name: /Stripe/i })).toBeVisible();
    await expect(checkoutDialog.getByRole("tab", { name: /Razorpay/i })).toBeVisible();
    await expect(checkoutDialog.getByRole("tab", { name: /UPI QR/i })).toBeVisible();

    // Test UPI Tab
    await checkoutDialog.getByRole("tab", { name: /UPI QR/i }).click();
    await expect(checkoutDialog.getByText(/Scan with Google Pay, PhonePe, Paytm, or BHIM/i)).toBeVisible();

    // Click Complete Payment in sandbox simulation mode
    const payBtn = checkoutDialog.getByRole("button", { name: /Complete Payment|Pay/i });
    await expect(payBtn).toBeVisible();
    await payBtn.click();

    // Modal closes on success
    await expect(checkoutDialog).not.toBeVisible();

    // Current Plan Banner should now reflect Team Plan
    await expect(page.getByText("Team Plan")).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();

    // Invoices table should now have an invoice
    await expect(page.getByRole("heading", { name: "Billing History & Invoices" })).toBeVisible();
    await expect(page.getByText(/INV-\d{4}-\d{4}/i)).toBeVisible();
    await expect(page.getByText("Paid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download" }).first()).toBeVisible();
  });

  test("enforces free project limit and allows unblocking after plan upgrade", async ({
    page,
  }) => {
    const email = `limit-test-${Date.now()}@example.com`;
    await loginViaOtp(page, email);
    const workspaceSlug = await createWorkspace(page, `Limit Workspace ${Date.now()}`);

    // Free plan allows 2 projects. Create 2 projects.
    await page.goto(`/w/${workspaceSlug}`);

    // Create Project 1
    await page.getByRole("button", { name: /New Project|Create Project/i }).click();
    await page.fill('input[placeholder*="Website or client name"]', "Project Alpha");
    await page.fill('input[placeholder*="example.com"]', "https://alpha.example.com");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Project Alpha")).toBeVisible();

    // Create Project 2
    await page.goto(`/w/${workspaceSlug}`);
    await page.getByRole("button", { name: /New Project|Create Project/i }).click();
    await page.fill('input[placeholder*="Website or client name"]', "Project Beta");
    await page.fill('input[placeholder*="example.com"]', "https://beta.example.com");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Project Beta")).toBeVisible();

    // Attempt to Create Project 3 (Exceeds Free Limit)
    await page.goto(`/w/${workspaceSlug}`);
    await page.getByRole("button", { name: /New Project|Create Project/i }).click();
    await page.fill('input[placeholder*="Website or client name"]', "Project Gamma");
    await page.fill('input[placeholder*="example.com"]', "https://gamma.example.com");
    await page.getByRole("button", { name: "Create project" }).click();

    // Verify limit error notification / CTA appears
    await expect(
      page.getByText(/Plan limit reached|Project limit reached|upgrade your plan/i)
    ).toBeVisible();

    // Navigate to Billing and Upgrade
    await page.goto(`/w/${workspaceSlug}/billing`);
    await page.getByRole("button", { name: "Upgrade to Solo" }).click();
    const checkoutDialog = page.getByRole("dialog");
    await expect(checkoutDialog).toBeVisible();
    await checkoutDialog.getByRole("button", { name: /Complete Payment|Pay/i }).click();
    await expect(checkoutDialog).not.toBeVisible();
    await expect(page.getByText("Solo Plan")).toBeVisible();

    // Now try creating Project 3 again
    await page.goto(`/w/${workspaceSlug}`);
    await page.getByRole("button", { name: /New Project|Create Project/i }).click();
    await page.fill('input[placeholder*="Website or client name"]', "Project Gamma");
    await page.fill('input[placeholder*="example.com"]', "https://gamma.example.com");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText("Project Gamma")).toBeVisible();
  });
});
