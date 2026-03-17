import { test, expect } from "./fixtures.js";

/**
 * Helper: set up API route mocks so the server appears to have no projects,
 * which triggers the onboarding wizard overlay.
 */
async function mockEmptyProjects(page: import("@playwright/test").Page) {
  await page.route("**/api/projects", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.continue();
  });

  await page.route("**/api/config", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          claude: {
            command: "/app/e2e/fixtures/mock-claude.sh",
            defaultArgs: ["--print"],
            timeout: 30000,
            bufferInterval: 500,
          },
          projects: [],
          discord: { token: "" },
          lark: { appId: "", appSecret: "" },
          formatter: {
            maxMessageLength: { discord: 2000, lark: 30000, web: 100000 },
            maxConcurrentProcesses: 2,
          },
        }),
      });
    }
    return route.continue();
  });
}

/**
 * Helper: mock all APIs for full wizard completion.
 */
async function mockAllApis(page: import("@playwright/test").Page) {
  await page.route("**/api/projects", (route) => {
    const method = route.request().method();
    if (method === "GET") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (method === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name: "e2e-project", directory: "/tmp/e2e", platforms: {} }),
      });
    }
    return route.continue();
  });

  await page.route("**/api/config", (route) => {
    const method = route.request().method();
    if (method === "PUT") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        claude: { command: "/app/e2e/fixtures/mock-claude.sh", defaultArgs: ["--print"], timeout: 30000, bufferInterval: 500 },
        projects: [],
        discord: { token: "" },
        lark: { appId: "", appSecret: "" },
        formatter: { maxMessageLength: { discord: 2000, lark: 30000, web: 100000 }, maxConcurrentProcesses: 2 },
      }),
    });
  });

  await page.route("**/api/claude/test", (route) => {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}

test.describe("Onboarding Extended", () => {
  // Selectors from Onboarding.svelte:
  // Next button: .btn-primary (with text "Next"), disabled when !canProceed()
  // Back button: .btn-secondary (with text "Back")
  // Skip button: .btn-ghost (with text "Skip")
  // Finish button: .btn-primary (with text "Start Chatting")
  // Test button: .btn-primary (with text "Test Command")

  test("step 1 - onboarding visible and typing command enables Next", async ({ page, server }) => {
    await mockEmptyProjects(page);
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Step 1 should show Claude Command input
    const claudeCmd = page.locator("#claude-cmd");
    await expect(claudeCmd).toBeVisible({ timeout: 3000 });

    // Step indicator should be visible
    const stepIndicator = page.locator(".step-indicator");
    await expect(stepIndicator).toBeVisible({ timeout: 3000 });

    // Claude command has default "claude" value, so Next should be enabled
    const nextBtn = page.locator('.btn-primary:has-text("Next")');
    await expect(nextBtn).toBeEnabled({ timeout: 3000 });

    // Clear and verify disabled
    await claudeCmd.fill("");
    await expect(nextBtn).toBeDisabled();

    // Type a command and verify enabled
    await claudeCmd.fill("/app/e2e/fixtures/mock-claude.sh");
    await expect(nextBtn).toBeEnabled();

    await server.screenshot(page, "onboarding-step1-command");
  });

  test("step 1 validation - empty command prevents advancing", async ({ page, server }) => {
    await mockEmptyProjects(page);
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    const claudeCmd = page.locator("#claude-cmd");
    await expect(claudeCmd).toBeVisible({ timeout: 3000 });

    // Clear the default value
    await claudeCmd.fill("");

    // Next button should be disabled
    const nextBtn = page.locator('.btn-primary:has-text("Next")');
    await expect(nextBtn).toBeDisabled();

    // Try clicking it anyway
    await nextBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Should still be on step 1
    await expect(claudeCmd).toBeVisible();

    await server.screenshot(page, "onboarding-step1-validation");
  });

  test("step 2 - valid command shows success after test", async ({ page, server }) => {
    await mockAllApis(page);
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Step 1: fill command and advance
    const claudeCmd = page.locator("#claude-cmd");
    await claudeCmd.fill("/app/e2e/fixtures/mock-claude.sh");
    const nextBtn = page.locator('.btn-primary:has-text("Next")');
    await nextBtn.click();
    await page.waitForTimeout(1000);

    // Step 2: should show "Test Command" button
    const testBtn = page.locator('.btn-primary:has-text("Test Command")');
    await expect(testBtn).toBeVisible({ timeout: 3000 });

    // Click test
    await testBtn.click();
    await page.waitForTimeout(3000);

    // Should show success message
    const successMsg = page.locator(".status-msg.success");
    await expect(successMsg).toBeVisible({ timeout: 10000 });

    await server.screenshot(page, "onboarding-step2-success");
  });

  test("step 2 - invalid command shows error after test", async ({ page, server }) => {
    await mockEmptyProjects(page);

    // Mock test endpoint to return error
    await page.route("**/api/claude/test", (route) => {
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Command not found" }) });
    });

    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Step 1: fill invalid command and advance
    const claudeCmd = page.locator("#claude-cmd");
    await claudeCmd.fill("/usr/bin/false");
    const nextBtn = page.locator('.btn-primary:has-text("Next")');
    await nextBtn.click();
    await page.waitForTimeout(1000);

    // Step 2: test the command
    const testBtn = page.locator('.btn-primary:has-text("Test Command")');
    await expect(testBtn).toBeVisible({ timeout: 3000 });
    await testBtn.click();
    await page.waitForTimeout(3000);

    // Should show error message
    const errorMsg = page.locator(".status-msg.error");
    await expect(errorMsg).toBeVisible({ timeout: 10000 });

    // Next button should be disabled (test failed, canProceed returns false for step 2)
    const nextBtn2 = page.locator('.btn-primary:has-text("Next")');
    await expect(nextBtn2).toBeVisible({ timeout: 5000 });
    await expect(nextBtn2).toBeDisabled();

    await server.screenshot(page, "onboarding-step2-error");
  });

  test("step 3 - fill project name and directory then advance", async ({ page, server }) => {
    await mockAllApis(page);
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Navigate to step 3
    // Step 1
    const claudeCmd = page.locator("#claude-cmd");
    await claudeCmd.fill("/app/e2e/fixtures/mock-claude.sh");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);

    // Step 2: test and advance
    await page.locator('.btn-primary:has-text("Test Command")').click();
    await page.waitForTimeout(3000);
    await expect(page.locator(".status-msg.success")).toBeVisible({ timeout: 10000 });
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);

    // Step 3: project details
    const projName = page.locator("#proj-name");
    await expect(projName).toBeVisible({ timeout: 3000 });
    const projDir = page.locator("#proj-dir");

    // Next should be disabled with empty fields
    const nextBtn = page.locator('.btn-primary:has-text("Next")');
    await expect(nextBtn).toBeDisabled();

    // Fill fields
    await projName.fill("e2e-project");
    await projDir.fill("/tmp/e2e");
    await expect(nextBtn).toBeEnabled();

    // Advance to step 4
    await nextBtn.click();
    await page.waitForTimeout(1000);

    // Should be on step 4 (platforms)
    const discordTok = page.locator("#discord-tok");
    await expect(discordTok).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "onboarding-step3-project");
  });

  test("step 3 validation - empty fields prevent advancing", async ({ page, server }) => {
    await mockAllApis(page);
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Navigate to step 3
    await page.locator("#claude-cmd").fill("/app/e2e/fixtures/mock-claude.sh");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);
    await page.locator('.btn-primary:has-text("Test Command")').click();
    await page.waitForTimeout(3000);
    await expect(page.locator(".status-msg.success")).toBeVisible({ timeout: 10000 });
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);

    // Step 3: leave empty
    const nextBtn = page.locator('.btn-primary:has-text("Next")');
    await expect(nextBtn).toBeDisabled();

    // Fill only name
    await page.locator("#proj-name").fill("test");
    await expect(nextBtn).toBeDisabled(); // directory still empty

    // Fill only directory, clear name
    await page.locator("#proj-name").fill("");
    await page.locator("#proj-dir").fill("/tmp");
    await expect(nextBtn).toBeDisabled(); // name empty

    await server.screenshot(page, "onboarding-step3-validation");
  });

  test("step 4 - skip platform tokens and proceed to step 5", async ({ page, server }) => {
    await mockAllApis(page);
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Navigate through steps 1-3
    await page.locator("#claude-cmd").fill("/app/e2e/fixtures/mock-claude.sh");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);
    await page.locator('.btn-primary:has-text("Test Command")').click();
    await page.waitForTimeout(3000);
    await expect(page.locator(".status-msg.success")).toBeVisible({ timeout: 10000 });
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);
    await page.locator("#proj-name").fill("e2e-project");
    await page.locator("#proj-dir").fill("/tmp/e2e");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);

    // Step 4: skip tokens
    const skipBtn = page.locator('.btn-ghost:has-text("Skip")');
    await expect(skipBtn).toBeVisible({ timeout: 3000 });
    await skipBtn.click();
    await page.waitForTimeout(1000);

    // Should be on step 5 (summary)
    const startBtn = page.locator('.btn-primary:has-text("Start Chatting")');
    await expect(startBtn).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "onboarding-step4-skip");
  });

  test("step 5 - click finish hides overlay and shows chat", async ({ page, server }) => {
    await mockAllApis(page);
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Navigate through all steps
    await page.locator("#claude-cmd").fill("/app/e2e/fixtures/mock-claude.sh");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);
    await page.locator('.btn-primary:has-text("Test Command")').click();
    await page.waitForTimeout(3000);
    await expect(page.locator(".status-msg.success")).toBeVisible({ timeout: 10000 });
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);
    await page.locator("#proj-name").fill("e2e-project");
    await page.locator("#proj-dir").fill("/tmp/e2e");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);
    await page.locator('.btn-ghost:has-text("Skip")').click();
    await page.waitForTimeout(1000);

    // Step 5: click "Start Chatting"
    const startBtn = page.locator('.btn-primary:has-text("Start Chatting")');
    await expect(startBtn).toBeVisible({ timeout: 3000 });
    await startBtn.click();
    await page.waitForTimeout(2000);

    // Overlay should be gone
    await expect(overlay).toBeHidden({ timeout: 5000 });

    // Main content should be visible
    const mainContent = page.locator(".main-content");
    await expect(mainContent).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "onboarding-step5-complete");
  });

  test("back button returns to previous step with values preserved", async ({ page, server }) => {
    await mockAllApis(page);
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Step 1: fill command
    const claudeCmd = page.locator("#claude-cmd");
    await claudeCmd.fill("/my/custom/claude/path");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);

    // Step 2: go back
    const backBtn = page.locator('.btn-secondary:has-text("Back")');
    await expect(backBtn).toBeVisible({ timeout: 3000 });
    await backBtn.click();
    await page.waitForTimeout(1000);

    // Should be on step 1 with value preserved
    const cmdValue = await page.locator("#claude-cmd").inputValue();
    expect(cmdValue).toBe("/my/custom/claude/path");

    // Go forward again, test, advance to step 3
    await page.locator("#claude-cmd").fill("/app/e2e/fixtures/mock-claude.sh");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);
    await page.locator('.btn-primary:has-text("Test Command")').click();
    await page.waitForTimeout(3000);
    await expect(page.locator(".status-msg.success")).toBeVisible({ timeout: 10000 });
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);

    // Step 3: fill fields
    await page.locator("#proj-name").fill("my-project");
    await page.locator("#proj-dir").fill("/tmp/mydir");

    // Go back to step 2
    await page.locator('.btn-secondary:has-text("Back")').click();
    await page.waitForTimeout(1000);

    // Go back to step 1
    await page.locator('.btn-secondary:has-text("Back")').click();
    await page.waitForTimeout(1000);

    // Command should still be there
    const cmdValue2 = await page.locator("#claude-cmd").inputValue();
    expect(cmdValue2).toBe("/app/e2e/fixtures/mock-claude.sh");

    await server.screenshot(page, "onboarding-back-button");
  });

  test("completed onboarding persists after reload", async ({ page, server }) => {
    // This test verifies that after completing onboarding normally (without mocks),
    // the overlay doesn't reappear on reload because the project exists.
    // We use the real server which already has projects configured.
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Since e2e-project exists, overlay should NOT be visible
    const overlay = page.locator(".overlay");
    await expect(overlay).toBeHidden({ timeout: 3000 });

    // Reload
    await page.reload();
    await page.waitForTimeout(2000);

    // Still no overlay
    await expect(overlay).toBeHidden({ timeout: 3000 });

    // Sidebar should show project
    const projectSection = page.locator(".project-section");
    await expect(projectSection.first()).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "onboarding-persists-no-overlay");
  });

  test("refresh mid-wizard does not crash", async ({ page, server }) => {
    await mockEmptyProjects(page);
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const overlay = page.locator(".overlay");
    await expect(overlay).toBeVisible({ timeout: 5000 });

    // Navigate to step 1, fill command
    const claudeCmd = page.locator("#claude-cmd");
    await claudeCmd.fill("/app/e2e/fixtures/mock-claude.sh");

    // Refresh mid-wizard
    await mockEmptyProjects(page); // re-apply mocks after reload
    await page.reload();
    await page.waitForTimeout(2000);

    // Re-apply mocks for the reloaded page
    await mockEmptyProjects(page);
    await page.reload();
    await page.waitForTimeout(2000);

    // Since projects are mocked as empty, wizard overlay should reappear after refresh
    const overlayAfter = page.locator(".overlay");
    await expect(overlayAfter).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "onboarding-refresh-midwizard");
  });
});
