import { test, expect } from "./fixtures.js";

test.describe("Sidebar with real sessions", () => {
  test("sidebar shows projects loaded from real config", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);
    await server.screenshot(page, "sidebar-loading");

    // Should NOT still be in loading state
    await expect(page.locator(".sidebar-loading")).not.toBeVisible({ timeout: 5000 });

    // Should have project sections
    const projectSections = page.locator(".project-section");
    const count = await projectSections.count();
    expect(count).toBeGreaterThanOrEqual(1);

    await server.screenshot(page, "sidebar-projects-loaded");
  });

  test("sidebar shows session list with truncated IDs", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    await expect(page.locator(".sidebar-loading")).not.toBeVisible({ timeout: 5000 });

    const sessions = page.locator(".session-item");
    const count = await sessions.count();

    if (count > 0) {
      const firstText = await sessions.first().textContent();
      // Should be a short hash, not a project name or empty
      expect(firstText?.trim().length).toBeGreaterThan(0);
      expect(firstText?.trim().length).toBeLessThanOrEqual(8);
    }

    await server.screenshot(page, "sidebar-sessions-list");
  });

  test("no JS errors on page load", async ({ page, server }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(server.baseUrl);
    await page.waitForTimeout(3000);

    await server.screenshot(page, "sidebar-no-errors");
    expect(errors).toEqual([]);
  });

  test("clicking a session item activates it", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    await expect(page.locator(".sidebar-loading")).not.toBeVisible({ timeout: 5000 });

    const sessions = page.locator(".session-item");
    const count = await sessions.count();

    if (count > 0) {
      await sessions.first().click();
      await page.waitForTimeout(500);
      await server.screenshot(page, "sidebar-session-selected");

      await expect(sessions.first()).toHaveClass(/active/, { timeout: 2000 });
    }
  });

  test("clicking + button opens new session in chat", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    await expect(page.locator(".sidebar-loading")).not.toBeVisible({ timeout: 5000 });

    const newBtn = page.locator(".new-session-btn").first();
    await expect(newBtn).toBeVisible({ timeout: 3000 });
    await newBtn.click();
    await page.waitForTimeout(500);

    await server.screenshot(page, "sidebar-new-session");

    // Chat input should appear
    const chatInput = page.locator("textarea.message-input");
    await expect(chatInput).toBeVisible({ timeout: 3000 });
  });
});
