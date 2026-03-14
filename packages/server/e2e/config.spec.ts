import { test, expect } from "./fixtures.js";

test.describe("Config Page", () => {
  test.beforeEach(async ({ server }) => {
    // Seed a project so onboarding doesn't show
    await fetch(`http://127.0.0.1:${server.port}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-proj", directory: "/tmp/test" }),
    });
  });

  test("navigates to config page and loads config form", async ({ page, server }) => {
    await page.goto(`http://127.0.0.1:${server.port}/`);

    // Click "⚙ Config" nav button in sidebar
    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await expect(configBtn).toBeVisible({ timeout: 5000 });
    await configBtn.click();

    // Wait for config page to appear
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });

    // Wait for loading to finish — "Loading configuration…" should disappear
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    // After loading, should see at least one config-section
    const sections = page.locator(".config-section");
    await expect(sections.first()).toBeVisible({ timeout: 3000 });

    // Should have the "Configuration" heading
    await expect(page.locator("h1:has-text('Configuration')")).toBeVisible();
  });

  test("config page shows multiple form sections", async ({ page, server }) => {
    await page.goto(`http://127.0.0.1:${server.port}/`);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await configBtn.click();

    // Wait for loading to complete
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    // Should have multiple config-section elements
    const sections = page.locator(".config-section");
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("edits config and persists changes via API", async ({ page, server }) => {
    // Verify the config API round-trip
    const response = await page.request.get(`http://127.0.0.1:${server.port}/api/config`);
    const config = await response.json();
    expect(config).toHaveProperty("claude");

    // Update config via PUT
    const putResponse = await page.request.put(`http://127.0.0.1:${server.port}/api/config`, {
      data: { ...config, claude: { ...config.claude, command: "echo-test" } },
    });
    expect(putResponse.ok()).toBe(true);

    // Verify persistence
    const verifyResponse = await page.request.get(`http://127.0.0.1:${server.port}/api/config`);
    const updatedConfig = await verifyResponse.json();
    expect(updatedConfig.claude.command).toBe("echo-test");
  });
});
