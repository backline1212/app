import { expect, test } from "@playwright/test";

import { createWorkspace, loginViaOtp } from "../../helpers/login";

// Journey 6: Integrations and billing
// Verifies the integrations and billing pages render and that choosing a plan opens
// checkout, without completing a payment.
test("agency manages integrations and opens plan checkout", async ({ page }) => {
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

  await expect(page.getByRole("heading", { name: "Billing & plans" })).toBeVisible();

  // Current plan banner and tier cards
  await expect(page.locator(".bl-plan-banner").getByRole("heading", { name: "Free Starter" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Solo Pro plan" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Team Standard plan" })).toBeVisible();

  // Choosing a plan opens its checkout
  await page.getByRole("button", { name: "Upgrade to Solo Pro" }).click();
  await expect(page.getByRole("dialog", { name: "Get Solo Pro" })).toBeVisible();
});
