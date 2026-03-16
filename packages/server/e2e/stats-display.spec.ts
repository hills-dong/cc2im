import { test, expect } from "./fixtures.js";

test.describe("Stats Page", () => {
  test("navigates to stats page", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await expect(statsBtn).toBeVisible({ timeout: 5000 });
    await statsBtn.click();

    await expect(page.locator("h1:has-text('Token Statistics')")).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "stats-initial");
  });

  test("stats page shows project selector with real projects", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await statsBtn.click();

    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });

    // Should have at least one project option from real config
    const options = select.locator("option");
    const count = await options.count();
    // First option is the placeholder "Select a project..."
    expect(count).toBeGreaterThanOrEqual(2);

    await server.screenshot(page, "stats-project-selector");
  });

  test("selecting a project shows summary cards", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await statsBtn.click();

    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });

    // Select the first real project
    const firstOption = select.locator("option").nth(1);
    const projectName = await firstOption.getAttribute("value");
    if (projectName) {
      await select.selectOption(projectName);
      await page.waitForTimeout(1000);

      await server.screenshot(page, "stats-project-selected");

      // Should show summary cards
      const cards = page.locator(".summary-cards .card");
      await expect(cards.first()).toBeVisible({ timeout: 5000 });

      const count = await cards.count();
      expect(count).toBe(4);
    }
  });

  test("stats API returns correct shape for real project", async ({ page, server }) => {
    // Get a real project name
    const projRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const projects = await projRes.json();
    if (projects.length > 0) {
      const name = projects[0].name;
      const res = await page.request.get(`${server.baseUrl}/api/stats/tokens?project=${name}`);
      const data = await res.json();
      expect(data).toHaveProperty("totalInput");
      expect(data).toHaveProperty("totalOutput");
      expect(data).toHaveProperty("totalCache");
      expect(data).toHaveProperty("daily");
      expect(Array.isArray(data.daily)).toBe(true);
    }
  });

  test("no project selected shows hint message", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await statsBtn.click();

    const hint = page.locator(".empty-hint:has-text('Select a project')");
    await expect(hint).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "stats-no-project-hint");
  });
});
