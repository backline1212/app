import { expect, test } from "@playwright/test";
import { createWorkspace, loginViaOtp } from "../helpers/login";

test.describe("Workspace Room Code & Join Requests", () => {
  test("user can request to join via room code and admin can approve", async ({ browser }) => {
    // 1. Admin logs in and creates workspace
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const adminEmail = `admin-roomcode-${Date.now()}@example.com`;
    await loginViaOtp(adminPage, adminEmail);
    
    const wsName = `RoomCode WS ${Date.now()}`;
    const workspaceSlug = await createWorkspace(adminPage, wsName);

    // Go to settings and set a room code
    await adminPage.goto(`/w/${workspaceSlug}/settings`);
    const roomCode = `CODE${Date.now()}`;
    await adminPage.getByLabel("Room Code").fill(roomCode);
    await adminPage.getByRole("button", { name: "Save Changes" }).click();
    await expect(adminPage.getByText("Workspace settings updated")).toBeVisible();

    // 2. New user logs in
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    const userEmail = `user-roomcode-${Date.now()}@example.com`;
    await loginViaOtp(userPage, userEmail);

    // User goes to /join
    await userPage.goto('/join');
    await userPage.getByPlaceholder("Room Code (e.g. ALPHA123)").fill(roomCode);
    await userPage.getByRole("button", { name: "Join" }).click();
    
    // Expect success message
    await expect(userPage.getByText("Your request to join has been sent. An admin must approve it.")).toBeVisible();

    // 3. Admin goes to members page -> Pending requests
    await adminPage.goto(`/w/${workspaceSlug}/members`);
    await adminPage.getByRole("button", { name: "Pending Requests" }).click();
    
    // Admin should see the user request and approve
    await expect(adminPage.getByText(userEmail)).toBeVisible();
    await adminPage.getByRole("button", { name: "Approve" }).click();

    // Verify user is approved (moves to members tab or disappears from pending)
    await expect(adminPage.getByText(userEmail)).not.toBeVisible();
    
    // Admin goes to members list and sees user
    await adminPage.getByRole("button", { name: "List View" }).click();
    await expect(adminPage.getByText(userEmail)).toBeVisible();

    await adminContext.close();
    await userContext.close();
  });
});
