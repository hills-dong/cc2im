import { test, expect } from "./fixtures.js";

test.describe("Sidebar Extended", () => {
  // 1. Project collapse/expand (P1)
  test("project collapse/expand toggles session visibility", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const projectSections = page.locator(".project-section");
    await expect(projectSections.first()).toBeVisible({ timeout: 5000 });

    const firstProject = projectSections.first();
    const projectHeader = firstProject.locator(".project-header, .project-name, h3, h4").first();

    // Verify sessions are visible before collapse
    const sessions = firstProject.locator(".session-item");
    await expect(sessions.first()).toBeVisible({ timeout: 5000 });

    // Click header to collapse
    await projectHeader.click();
    await page.waitForTimeout(500);
    await server.screenshot(page, "sidebar-project-collapsed");

    // Sessions should be hidden after collapse
    await expect(sessions.first()).not.toBeVisible({ timeout: 3000 });

    // Click again to expand
    await projectHeader.click();
    await page.waitForTimeout(500);
    await server.screenshot(page, "sidebar-project-expanded");

    // Sessions should be visible again after expand
    await expect(sessions.first()).toBeVisible({ timeout: 3000 });
  });

  // 2. New session creates chat area (P0)
  test("new session button creates chat input area", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    // Chat input should appear
    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send message creates a working session
    await textarea.fill("sidebar session test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    await server.screenshot(page, "sidebar-new-session-chat");
  });

  // 3. Projects persist after refresh (P0)
  test("projects persist after page refresh", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const countBefore = await page.locator(".project-section").count();
    expect(countBefore).toBeGreaterThanOrEqual(1);

    await page.reload();
    await page.waitForTimeout(2000);

    const countAfter = await page.locator(".project-section").count();
    expect(countAfter).toBe(countBefore);

    await server.screenshot(page, "sidebar-projects-after-refresh");
  });

  // 4. Sidebar loading completes (P0)
  test("sidebar loading completes quickly", async ({ page, server }) => {
    await page.goto(server.baseUrl);

    // Loading should complete within 5 seconds
    await expect(page.locator(".sidebar-loading")).not.toBeVisible({ timeout: 5000 });

    // Projects should be visible
    const projectSections = page.locator(".project-section");
    await expect(projectSections.first()).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "sidebar-loading-complete");
  });

  // 5. API failure for projects (P1)
  test("handles API failure for projects without crashing", async ({ page, server }) => {
    await page.route("**/api/projects", (route) =>
      route.fulfill({ status: 500, body: "Internal Server Error" })
    );

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(server.baseUrl);
    await page.waitForTimeout(3000);

    expect(errors).toEqual([]);
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "sidebar-api-failure");
  });

  // 6. Empty project list (P1)
  test("handles empty project list without crashing", async ({ page, server }) => {
    await page.route("**/api/projects", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
    expect(await page.locator(".project-section").count()).toBe(0);

    await server.screenshot(page, "sidebar-empty-projects");
  });

  // 7. Config navigation works (P0)
  test("config navigation shows config page", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const configNav = page.locator('.nav-btn:has-text("Config")').first();
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "sidebar-config-nav");
  });

  // 8. Stats navigation works (P0)
  test("stats navigation shows stats page", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const statsNav = page.locator('.nav-btn:has-text("Stats")').first();
    await statsNav.click();
    await expect(page.locator('h1:has-text("Token Statistics")')).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "sidebar-stats-nav");
  });
});
