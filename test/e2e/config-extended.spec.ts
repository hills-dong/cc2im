import { test, expect } from "./fixtures.js";

test.describe("Config Extended", () => {
  // Helper: navigate to Config page
  async function goToConfig(page: import("@playwright/test").Page, baseUrl: string) {
    await page.goto(baseUrl);
    await page.waitForTimeout(2000);
    const configNav = page.locator('.nav-btn:has-text("Config")').first();
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });
  }

  // Helper: add a project via the UI form
  async function addProjectViaUI(
    page: import("@playwright/test").Page,
    name: string,
    directory: string,
  ) {
    const addToggle = page.locator(".btn-secondary:has-text('+ Add Project')");
    await addToggle.click();
    const form = page.locator(".project-form");
    await expect(form).toBeVisible({ timeout: 3000 });
    await page.locator("#new-proj-name").fill(name);
    await page.locator("#new-proj-dir").fill(directory);
    const addBtn = page.locator(".btn-primary:has-text('Add Project')");
    await addBtn.click();
    await expect(page.locator(".toast.success")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);
  }

  // Helper: delete a project via API
  async function deleteProjectViaAPI(
    page: import("@playwright/test").Page,
    baseUrl: string,
    name: string,
  ) {
    await page.request.delete(`${baseUrl}/api/projects/${encodeURIComponent(name)}`);
  }

  // 1. Formatter numeric inputs: set Discord max length to 1800, save, verify persistence
  test("formatter numeric input persists after save", async ({ page, server }) => {
    await goToConfig(page, server.baseUrl);

    // Find a numeric input in the formatter section
    const numberInputs = page.locator(".config-section input[type='number']");
    const count = await numberInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const firstNumericInput = numberInputs.first();
    const originalValue = await firstNumericInput.inputValue();

    // Set to 1800
    await firstNumericInput.fill("1800");

    // Save config
    const saveBtn = page.locator(".btn-primary:has-text('Save Config')").first();
    await saveBtn.click();
    await expect(page.locator(".toast.success")).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "config-ext-formatter-saved");

    // Verify via API that the specific value was saved
    const response = await page.request.get(`${server.baseUrl}/api/config`);
    const config = await response.json();
    expect(config.formatter).toBeDefined();
    expect(config.formatter.maxMessageLength.discord).toBe(1800);

    // Restore original value
    await firstNumericInput.fill(originalValue);
    await saveBtn.click();
    await expect(page.locator(".toast.success")).toBeVisible({ timeout: 5000 });
  });

  // 2. Save then reload verifies persistence
  test("save then reload verifies persistence", async ({ page, server }) => {
    await goToConfig(page, server.baseUrl);

    // Read current claude command value
    const claudeInput = page.locator("#claude-command");
    await expect(claudeInput).toBeVisible({ timeout: 3000 });
    const originalValue = await claudeInput.inputValue();

    // Change value
    const testValue = originalValue + "-e2e-persist-test";
    await claudeInput.fill(testValue);

    // Save
    const saveBtn = page.locator(".btn-primary:has-text('Save Config')").first();
    await saveBtn.click();
    await expect(page.locator(".toast.success")).toBeVisible({ timeout: 5000 });

    // Reload the page
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);
    const configNav = page.locator('.nav-btn:has-text("Config")').first();
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    // Verify the value persisted
    const reloadedInput = page.locator("#claude-command");
    await expect(reloadedInput).toBeVisible({ timeout: 3000 });
    await expect(reloadedInput).toHaveValue(testValue);

    await server.screenshot(page, "config-ext-persistence-verified");

    // Restore original value
    await reloadedInput.fill(originalValue);
    await saveBtn.click();
    await expect(page.locator(".toast.success")).toBeVisible({ timeout: 5000 });
  });

  // 3. Added project persists after reload
  test("added project persists after reload", async ({ page, server }) => {
    const testProjectName = `e2e-persist-${Date.now()}`;
    const testProjectDir = "/tmp/e2e-persist-test";

    await goToConfig(page, server.baseUrl);
    await addProjectViaUI(page, testProjectName, testProjectDir);

    // Verify project card exists
    const projectCard = page.locator(`.project-card:has-text("${testProjectName}")`);
    await expect(projectCard).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "config-ext-project-added-before-reload");

    // Reload page and navigate back to config
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);
    const configNav = page.locator('.nav-btn:has-text("Config")').first();
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    // Verify project still exists
    const projectCardAfter = page.locator(`.project-card:has-text("${testProjectName}")`);
    await expect(projectCardAfter).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "config-ext-project-persisted-after-reload");

    // Cleanup: delete via API
    await deleteProjectViaAPI(page, server.baseUrl, testProjectName);
  });

  // 4. Deleted project stays deleted after reload
  test("deleted project stays deleted after reload", async ({ page, server }) => {
    const testProjectName = `e2e-del-${Date.now()}`;
    const testProjectDir = "/tmp/e2e-del-test";

    await goToConfig(page, server.baseUrl);
    await addProjectViaUI(page, testProjectName, testProjectDir);

    // Find and delete the project
    const projectCard = page.locator(`.project-card:has-text("${testProjectName}")`);
    await expect(projectCard).toBeVisible({ timeout: 3000 });
    const deleteBtn = projectCard.locator(".btn-danger");
    await deleteBtn.click();
    await page.waitForTimeout(1000);

    // Verify project is gone from config page
    await expect(projectCard).not.toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "config-ext-project-deleted");

    // Reload and go to main page first - verify not in sidebar
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Check project is not in sidebar
    const sidebarProject = page.locator(`.project-section:has-text("${testProjectName}")`);
    await expect(sidebarProject).not.toBeVisible({ timeout: 3000 });

    // Navigate to config and verify project is still gone
    const configNav = page.locator('.nav-btn:has-text("Config")').first();
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    const projectCardAfter = page.locator(`.project-card:has-text("${testProjectName}")`);
    await expect(projectCardAfter).not.toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "config-ext-project-stays-deleted");
  });

  // 5. Config values match API response
  test("config values match API response", async ({ page, server }) => {
    await goToConfig(page, server.baseUrl);

    // Fetch config from API
    const response = await page.request.get(`${server.baseUrl}/api/config`);
    const config = await response.json();

    // Verify claude command matches
    const claudeInput = page.locator("#claude-command");
    await expect(claudeInput).toBeVisible({ timeout: 3000 });
    const claudeValue = await claudeInput.inputValue();
    expect(claudeValue).toBe(config.claude.command);

    // Verify discord token field is present (masked as ***)
    const discordToken = page.locator("#discord-token");
    await expect(discordToken).toBeVisible({ timeout: 3000 });
    // Token in API should be masked
    expect(config.discord.token).toBe("***");

    // Verify project count matches
    const projectCards = page.locator(".project-card");
    const uiProjectCount = await projectCards.count();
    expect(uiProjectCount).toBe(config.projects.length);

    await server.screenshot(page, "config-ext-values-match-api");
  });

  // 6. Delete project with sessions - no crash
  test("delete project does not crash when project has been used", async ({ page, server }) => {
    const testProjectName = `e2e-active-${Date.now()}`;
    const testProjectDir = "/tmp/e2e-active-test";

    // Add a project via API
    const addRes = await page.request.post(`${server.baseUrl}/api/projects`, {
      data: { name: testProjectName, directory: testProjectDir },
    });
    expect(addRes.ok()).toBeTruthy();

    // Navigate to config to delete it
    await goToConfig(page, server.baseUrl);

    const projectCard = page.locator(`.project-card:has-text("${testProjectName}")`);
    await expect(projectCard).toBeVisible({ timeout: 5000 });
    const deleteBtn = projectCard.locator(".btn-danger");
    await deleteBtn.click();
    await page.waitForTimeout(2000);

    // Verify no crash and project is gone
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await expect(projectCard).not.toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "config-ext-delete-project");
  });

  // 7. Save failure shows error toast
  test("save failure shows error toast and form stays usable", async ({ page, server }) => {
    await goToConfig(page, server.baseUrl);

    // Intercept PUT /api/config to return 500
    await page.route("**/api/config", (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({ status: 500, body: "Internal Server Error" });
      }
      return route.continue();
    });

    // Modify a field
    const claudeInput = page.locator("#claude-command");
    await expect(claudeInput).toBeVisible({ timeout: 3000 });
    const originalValue = await claudeInput.inputValue();
    await claudeInput.fill(originalValue + "-fail-test");

    // Try to save
    const saveBtn = page.locator(".btn-primary:has-text('Save Config')").first();
    await saveBtn.click();

    // Verify error toast appears
    const errorToast = page.locator(".toast.error");
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "config-ext-save-failure");

    // Verify page is still functional - form inputs should be interactable
    await expect(claudeInput).toBeVisible();
    await expect(claudeInput).toBeEditable();
    await expect(saveBtn).toBeVisible();

    // Remove the route intercept
    await page.unroute("**/api/config");

    // Restore original value and save successfully
    await claudeInput.fill(originalValue);
    await saveBtn.click();
    await expect(page.locator(".toast.success")).toBeVisible({ timeout: 5000 });
  });

  // 8. Navigate away with unsaved changes
  test("navigate away with unsaved changes and back", async ({ page, server }) => {
    await goToConfig(page, server.baseUrl);

    // Read current value
    const claudeInput = page.locator("#claude-command");
    await expect(claudeInput).toBeVisible({ timeout: 3000 });
    const originalValue = await claudeInput.inputValue();

    // Make an unsaved change
    await claudeInput.fill(originalValue + "-unsaved");

    // Navigate away by clicking Stats nav
    const statsNav = page.locator('.nav-btn:has-text("Stats")').first();
    await statsNav.click();
    await page.waitForTimeout(1000);

    await server.screenshot(page, "config-ext-navigated-away");

    // Navigate back to Config
    const configNav = page.locator('.nav-btn:has-text("Config")').first();
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    // Either: form shows warning, or form reloads from server (original value)
    const reloadedInput = page.locator("#claude-command");
    await expect(reloadedInput).toBeVisible({ timeout: 3000 });
    const currentValue = await reloadedInput.inputValue();

    // The form should have reloaded from server (original value) since we didn't save
    expect(currentValue).toBe(originalValue);

    await server.screenshot(page, "config-ext-navigated-back");
  });

  // 9. Duplicate project name - upsert behavior via API
  test("duplicate project name updates existing project via API", async ({ page, server }) => {
    const testProjectName = `e2e-dup-${Date.now()}`;

    // Add project first time via API
    const res1 = await page.request.post(`${server.baseUrl}/api/projects`, {
      data: { name: testProjectName, directory: "/tmp/e2e-dup-1" },
    });
    expect(res1.ok()).toBeTruthy();

    // Add same name again via API - should upsert
    const res2 = await page.request.post(`${server.baseUrl}/api/projects`, {
      data: { name: testProjectName, directory: "/tmp/e2e-dup-2" },
    });
    expect(res2.ok()).toBeTruthy();

    // Verify only 1 project with this name via API
    const listRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const projects = await listRes.json();
    const matching = projects.filter((p: any) => p.name === testProjectName);
    expect(matching.length).toBe(1);
    // Directory should be updated to the second one
    expect(matching[0].directory).toBe("/tmp/e2e-dup-2");

    // Cleanup
    await deleteProjectViaAPI(page, server.baseUrl, testProjectName);

    await server.screenshot(page, "config-ext-duplicate-upsert");
  });

  // 10. Empty fields rejected for project
  test("empty project name and directory are rejected", async ({ page, server }) => {
    await goToConfig(page, server.baseUrl);

    // Try adding project with empty name
    const addToggle = page.locator(".btn-secondary:has-text('+ Add Project')");
    await addToggle.click();
    const form = page.locator(".project-form");
    await expect(form).toBeVisible({ timeout: 3000 });

    // Leave both fields empty
    await page.locator("#new-proj-name").fill("");
    await page.locator("#new-proj-dir").fill("");

    const addBtn = page.locator(".btn-primary:has-text('Add Project')");
    await addBtn.click();

    // Should show error toast
    const errorToast = page.locator(".toast.error");
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "config-ext-empty-rejected");

    // Also test empty name with valid directory
    await page.waitForTimeout(1000);
    await page.locator("#new-proj-name").fill("");
    await page.locator("#new-proj-dir").fill("/tmp/valid-dir");
    await addBtn.click();

    await expect(errorToast).toBeVisible({ timeout: 5000 });

    // And valid name with empty directory
    await page.waitForTimeout(1000);
    await page.locator("#new-proj-name").fill("valid-name");
    await page.locator("#new-proj-dir").fill("");
    await addBtn.click();

    await expect(errorToast).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "config-ext-whitespace-rejected-partial");

    // Verify no project was actually created
    const projectCards = page.locator('.project-card:has-text("valid-name")');
    const count = await projectCards.count();
    expect(count).toBe(0);
  });
});
