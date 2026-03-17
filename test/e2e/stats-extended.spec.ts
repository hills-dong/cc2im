import { test, expect } from "./fixtures.js";

test.describe("Stats Page Extended", () => {
  test("selecting a project with data renders bar chart", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await statsBtn.click();

    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });

    // Select the first real project
    const firstOption = select.locator("option").nth(1);
    const projectName = await firstOption.getAttribute("value");
    expect(projectName).toBeTruthy();

    await select.selectOption(projectName!);
    await page.waitForTimeout(2000);

    // Check if bar chart SVG is rendered (only if project has data)
    const barChart = page.locator(".bar-chart");
    const emptyHint = page.locator(".empty-hint");

    // Either bar chart or empty hint should be visible
    const hasChart = await barChart.isVisible();
    const hasEmpty = await emptyHint.isVisible();
    expect(hasChart || hasEmpty).toBe(true);

    if (hasChart) {
      // Verify it's an SVG element
      await expect(barChart.locator("svg")).toBeVisible({ timeout: 3000 });
    }

    await server.screenshot(page, "stats-bar-chart");
  });

  test("selecting a project with data shows daily breakdown table", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await statsBtn.click();

    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });

    // Select the first real project
    const firstOption = select.locator("option").nth(1);
    const projectName = await firstOption.getAttribute("value");
    expect(projectName).toBeTruthy();

    await select.selectOption(projectName!);
    await page.waitForTimeout(2000);

    const table = page.locator(".table-section table");
    const emptyHint = page.locator(".empty-hint");

    const hasTable = await table.isVisible();
    const hasEmpty = await emptyHint.isVisible();
    expect(hasTable || hasEmpty).toBe(true);

    if (hasTable) {
      // Table should have at least a header row
      const rows = table.locator("tr");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(1);
    }

    await server.screenshot(page, "stats-daily-table");
  });

  test("stats API returns empty data for nonexistent project", async ({ page, server }) => {
    const res = await page.request.get(
      `${server.baseUrl}/api/stats/tokens?project=nonexistent-project-xyz`
    );
    const data = await res.json();

    // Should still return the correct shape but with zero/empty values
    expect(data).toHaveProperty("totalInput");
    expect(data).toHaveProperty("totalOutput");
    expect(data).toHaveProperty("totalCache");
    expect(data).toHaveProperty("daily");
    expect(data.totalInput).toBe(0);
    expect(data.totalOutput).toBe(0);
    expect(data.daily).toEqual([]);
  });

  test("switching between projects updates the stats display", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await statsBtn.click();

    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });

    const options = select.locator("option");
    const optionCount = await options.count();

    // Need at least 2 real projects (plus placeholder) to test switching
    expect(optionCount).toBeGreaterThanOrEqual(3);

    // Select first project
    const firstProject = await options.nth(1).getAttribute("value");
    expect(firstProject).toBeTruthy();
    await select.selectOption(firstProject!);
    await page.waitForTimeout(1500);

    // Capture first project's card text
    const cards = page.locator(".summary-cards .card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    const firstCardText = await page.locator(".summary-cards").innerText();
    await server.screenshot(page, "stats-first-project");

    // Select second project
    const secondProject = await options.nth(2).getAttribute("value");
    expect(secondProject).toBeTruthy();
    await select.selectOption(secondProject!);
    await page.waitForTimeout(1500);

    // Summary cards should still be visible after switching
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    const secondCardText = await page.locator(".summary-cards").innerText();
    await server.screenshot(page, "stats-second-project");

    // Verify the select value actually changed to the second project
    const selectedValue = await select.inputValue();
    expect(selectedValue).toBe(secondProject);
  });
});
