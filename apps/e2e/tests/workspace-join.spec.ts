import { expect, test } from "@playwright/test";
import { createWorkspace, loginViaOtp } from "../helpers/login";

// TDR-0056: an owner turns the room code on, a newcomer asks to join with it, and the
// owner approves them from the Team page's Requests tab.
test.describe("Workspace room code & join requests", () => {
  test("user can request to join via room code and admin can approve", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const adminEmail = `admin-roomcode-${Date.now()}@example.com`;
    await loginViaOtp(adminPage, adminEmail);
    const workspaceSlug = await createWorkspace(adminPage, `RoomCode WS ${Date.now()}`);

    // Turn on joining by code with a custom code from Settings.
    const roomCode = `CODE${Date.now()}`;
    await adminPage.goto(`/w/${workspaceSlug}/settings`);
    await adminPage.getByRole("button", { name: "Turn on room code" }).click();
    await adminPage.getByRole("button", { name: "Choose a code" }).click();
    await adminPage.getByLabel("Custom room code").fill(roomCode);
    await adminPage.getByRole("button", { name: "Use this code" }).click();
    await expect(adminPage.getByText("Room code saved.")).toBeVisible();

    // A newcomer opens the join link, sees the workspace, and asks to join.
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    const userEmail = `user-roomcode-${Date.now()}@example.com`;
    await loginViaOtp(userPage, userEmail);
    await userPage.goto(`/join?code=${roomCode.toLowerCase()}`);
    await expect(userPage.locator(".join-preview")).toContainText("an admin approves new people");
    await userPage.getByRole("button", { name: "Ask to join" }).click();
    await expect(userPage.getByText("Request sent")).toBeVisible();

    // The owner approves from the Requests tab.
    await adminPage.goto(`/w/${workspaceSlug}/members?view=requests`);
    await expect(adminPage.getByText(userEmail)).toBeVisible();
    await adminPage.getByRole("button", { name: "Approve" }).click();
    await expect(adminPage.getByText(userEmail)).not.toBeVisible();

    await adminPage.goto(`/w/${workspaceSlug}/members`);
    await expect(adminPage.getByText(userEmail)).toBeVisible();

    await adminContext.close();
    await userContext.close();
  });
});
