import { expect, test } from "@playwright/test";

import { createWorkspace, loginViaOtp } from "../../helpers/login";

// Journey 6: Integrations and Billing placeholders
// This test verifies that the integrations (Slack/Clickup) and billing pages render correctly
// as placeholders, without attempting mock transactions.
test("agency manages integrations and views billing placeholder", async ({ page }) => {
  const email = `journey6-${Date.now()}@example.com`;
  await loginViaOtp(page, email);

  const workspaceSlug = await createWorkspace(page, `Journey6 ${Date.now()}`);

  // Navigate to integrations page
  await page.goto(`/w/${workspaceSlug}/integrations`);

  const integrationsHeader = page.getByRole("heading", { name: "Integrations" });
  await expect(integrationsHeader).toBeVisible();

  // Verify that Slack, ClickUp, and Trello cards exist
  await expect(page.getByText("Slack")).toBeVisible();
  await expect(page.getByText("ClickUp")).toBeVisible();
  await expect(page.getByText("Trello")).toBeVisible();

  // Navigate to billing page
  await page.goto(`/w/${workspaceSlug}/billing`);

  const billingHeader = page.getByRole("heading", { name: "Plans & Billing" });
  await expect(billingHeader).toBeVisible();

  // Verify Current Plan Banner and Tier Cards
  await expect(page.getByText("Free Plan")).toBeVisible();
  await expect(page.getByText("Solo Pro")).toBeVisible();
  await expect(page.getByText("Team Standard")).toBeVisible();

  // Click Upgrade to Solo to verify Checkout modal opens
  const upgradeSoloButton = page.getByRole("button", { name: "Upgrade to Solo" });
  await expect(upgradeSoloButton).toBeVisible();
  await upgradeSoloButton.click();

  // Verify checkout modal opens
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Solo Pro Plan")).toBeVisible();
});
