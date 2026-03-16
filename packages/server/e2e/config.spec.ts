import { test, expect } from "./fixtures.js";

test.describe("Config Page", () => {
  test("navigates to config page and loads config form", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await expect(configBtn).toBeVisible({ timeout: 5000 });
    await configBtn.click();

    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await server.screenshot(page, "config-loading");

    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    const sections = page.locator(".config-section");
    await expect(sections.first()).toBeVisible({ timeout: 3000 });
    await expect(page.locator("h1:has-text('Configuration')")).toBeVisible();

    await server.screenshot(page, "config-loaded");
  });

  test("config page shows multiple form sections", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await configBtn.click();

    await expect(page.locator(".config-page")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".loading")).toBeHidden({ timeout: 10000 });

    const sections = page.locator(".config-section");
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(3);

    await server.screenshot(page, "config-sections");
  });

  test("config API returns correct shape", async ({ page, server }) => {
    const response = await page.request.get(`${server.baseUrl}/api/config`);
    const config = await response.json();
    expect(config).toHaveProperty("claude");
    expect(config).toHaveProperty("projects");
    expect(config).toHaveProperty("formatter");
    // Token should be masked
    expect(config.discord.token).toBe("***");
  });
});
