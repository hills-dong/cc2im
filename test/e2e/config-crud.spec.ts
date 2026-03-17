import { test, expect } from "./fixtures.js";

test.describe("Config Page CRUD", () => {
  test("config section layout shows all 5 sections", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await configBtn.click();

    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    const sections = page.locator(".config-section");
    const count = await sections.count();
    expect(count).toBe(5);

    await server.screenshot(page, "config-all-sections");
  });

  test("discord token input is masked as password", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await configBtn.click();

    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    const tokenInput = page.locator("#discord-token");
    await expect(tokenInput).toBeVisible({ timeout: 3000 });
    await expect(tokenInput).toHaveAttribute("type", "password");

    await server.screenshot(page, "config-token-masked");
  });

  test("save config shows success toast", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await configBtn.click();

    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    // Read current value of claude command to restore later
    const claudeInput = page.locator("#claude-command");
    await expect(claudeInput).toBeVisible({ timeout: 3000 });
    const originalValue = await claudeInput.inputValue();

    // Modify the field (add a space and remove it to trigger change)
    await claudeInput.fill(originalValue + " ");
    await claudeInput.fill(originalValue);

    // Click Save Config (first one in page header)
    const saveBtn = page.locator(".btn-primary:has-text('Save Config')").first();
    await saveBtn.click();

    // Verify success toast appears
    const toast = page.locator(".toast.success");
    await expect(toast).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "config-save-success");
  });

  test("add project with empty fields shows error toast", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await configBtn.click();

    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    // Click "+ Add Project" to show the form
    const addToggle = page.locator(".btn-secondary:has-text('+ Add Project')");
    await addToggle.click();

    // Wait for form to appear
    const form = page.locator(".project-form");
    await expect(form).toBeVisible({ timeout: 3000 });

    // Click "Add Project" with empty fields
    const addBtn = page.locator(".btn-primary:has-text('Add Project')");
    await addBtn.click();

    // Verify error toast
    const toast = page.locator(".toast.error");
    await expect(toast).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "config-add-project-validation");
  });

  test("add and delete a test project", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await configBtn.click();

    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    // Count existing project cards
    const initialCount = await page.locator(".project-card").count();

    // Click "+ Add Project" to show the form
    const addToggle = page.locator(".btn-secondary:has-text('+ Add Project')");
    await addToggle.click();

    const form = page.locator(".project-form");
    await expect(form).toBeVisible({ timeout: 3000 });

    // Fill in test project details
    const testProjectName = `e2e-test-${Date.now()}`;
    await page.locator("#new-proj-name").fill(testProjectName);
    await page.locator("#new-proj-dir").fill("/tmp/e2e-test-project");

    // Click "Add Project"
    const addBtn = page.locator(".btn-primary:has-text('Add Project')");
    await addBtn.click();

    // Verify success toast
    const addToast = page.locator(".toast.success");
    await expect(addToast).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "config-project-added");

    // Verify project card count increased
    await page.waitForTimeout(1000);
    const afterAddCount = await page.locator(".project-card").count();
    expect(afterAddCount).toBe(initialCount + 1);

    // Find and delete the test project
    // The last project card should be our newly added one
    const lastCard = page.locator(".project-card").last();
    const deleteBtn = lastCard.locator(".btn-danger");
    await deleteBtn.click();

    // Wait for deletion
    await page.waitForTimeout(1000);

    // Verify project card count is back to original
    const afterDeleteCount = await page.locator(".project-card").count();
    expect(afterDeleteCount).toBe(initialCount);

    await server.screenshot(page, "config-project-deleted");
  });

  test("formatter section has numeric inputs", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await configBtn.click();

    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    // Scroll to bottom to find formatter section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Find numeric inputs in the config sections (formatter section has number inputs)
    const numberInputs = page.locator(".config-section input[type='number']");
    const count = await numberInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await server.screenshot(page, "config-formatter-numeric");
  });
});
