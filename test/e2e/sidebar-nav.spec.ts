import { test, expect } from "./fixtures.js";

test.describe("Sidebar Navigation", () => {
  test("nav buttons for Config and Stats are visible", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");

    await expect(configBtn).toBeVisible({ timeout: 5000 });
    await expect(statsBtn).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "sidebar-nav-buttons");
  });

  test("sidebar header shows app title", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Sidebar should contain the app title text
    await expect(sidebar.locator(".app-name")).toBeVisible({ timeout: 3000 });
    await expect(sidebar.locator(".app-name")).toContainText("cc2im");

    await server.screenshot(page, "sidebar-header-title");
  });

  test("clicking Config nav button marks it active", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configBtn = page.locator("button.nav-btn:has-text('Config')");
    await configBtn.click();
    await page.waitForTimeout(500);

    await expect(configBtn).toHaveClass(/active/, { timeout: 2000 });

    await server.screenshot(page, "sidebar-nav-config-active");
  });

  test("clicking Stats nav button marks it active", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await statsBtn.click();
    await page.waitForTimeout(500);

    await expect(statsBtn).toHaveClass(/active/, { timeout: 2000 });

    await server.screenshot(page, "sidebar-nav-stats-active");
  });
});
