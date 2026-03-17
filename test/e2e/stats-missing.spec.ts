import { test, expect } from "./fixtures.js";

test.describe("Stats Page Missing", () => {
  // Helper: navigate to Stats page
  async function goToStats(page: import("@playwright/test").Page, baseUrl: string) {
    await page.goto(baseUrl);
    await page.waitForTimeout(2000);
    const statsNav = page.locator('.nav-btn:has-text("Stats")').first();
    await statsNav.click();
    await expect(page.locator('h1:has-text("Token Statistics")')).toBeVisible({ timeout: 5000 });
  }

  // Helper: select first real project, return its name
  async function selectFirstProject(page: import("@playwright/test").Page): Promise<string | null> {
    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });
    const firstOption = select.locator("option").nth(1);
    const projectName = await firstOption.getAttribute("value");
    if (projectName) {
      await select.selectOption(projectName);
      await page.waitForTimeout(2000);
    }
    return projectName;
  }

  // Helper: send a chat message and wait for assistant response
  async function sendChatMessage(page: import("@playwright/test").Page, baseUrl: string) {
    await page.goto(baseUrl);
    await page.waitForTimeout(2000);
    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();
    const textarea = page.locator("textarea.message-input");
    await textarea.fill("hello");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });
  }

  test("1 - loading states: selecting project shows cards or empty hint", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);

    const projectName = await selectFirstProject(page);
    expect(projectName).toBeTruthy();

    // After selecting a project, either cards or empty hint should appear
    const cardsLocator = page.locator(".summary-cards .card");
    const emptyHint = page.locator(".empty-hint");

    await page.waitForTimeout(2000);
    // At least one of these must be visible after selecting a project
    const hasCards = await cardsLocator.first().isVisible();
    const hasEmpty = await emptyHint.isVisible();
    expect(hasCards || hasEmpty).toBe(true);

    await server.screenshot(page, "stats-loading-states");
  });

  test("2 - stats persist after page refresh", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);

    const projectName = await selectFirstProject(page);
    expect(projectName).toBeTruthy();

    // Record current card values
    const cards = page.locator(".summary-cards .card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    const cardTexts: string[] = [];
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      cardTexts.push(await cards.nth(i).innerText());
    }

    await server.screenshot(page, "stats-before-refresh");

    // Reload and re-navigate to stats, then re-select the same project
    await page.reload();
    await page.waitForTimeout(2000);
    const statsNav = page.locator('.nav-btn:has-text("Stats")').first();
    await statsNav.click();
    await expect(page.locator('h1:has-text("Token Statistics")')).toBeVisible({ timeout: 5000 });

    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });
    await select.selectOption(projectName);
    await page.waitForTimeout(2000);

    // Compare card values after refresh
    const cardsAfter = page.locator(".summary-cards .card");
    await expect(cardsAfter.first()).toBeVisible({ timeout: 5000 });
    const countAfter = await cardsAfter.count();
    expect(countAfter).toBe(count);
    for (let i = 0; i < countAfter; i++) {
      const text = await cardsAfter.nth(i).innerText();
      expect(text).toBe(cardTexts[i]);
    }

    await server.screenshot(page, "stats-after-refresh");
  });

  test("3 - summary cards match API response exactly", async ({ page, server }) => {
    // Get a real project name from API
    const projRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const projects = await projRes.json();
    expect(projects.length).toBeGreaterThan(0);

    const projectName = projects[0].name;

    // Fetch stats from API
    const statsRes = await page.request.get(
      `${server.baseUrl}/api/stats/tokens?project=${encodeURIComponent(projectName)}`
    );
    const apiData = await statsRes.json();

    // Navigate to stats page and select the project
    await goToStats(page, server.baseUrl);
    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });
    await select.selectOption(projectName);
    await page.waitForTimeout(2000);

    const cards = page.locator(".summary-cards .card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });

    // Extract text from each card and verify against API
    const cardCount = await cards.count();
    expect(cardCount).toBe(4);

    const allCardText = await page.locator(".summary-cards").innerText();

    // Verify that the API values appear in the card text
    // Cards display: input, output, cache, total
    const total = apiData.totalInput + apiData.totalOutput + apiData.totalCache;
    const expectedValues = [apiData.totalInput, apiData.totalOutput, apiData.totalCache, total];

    for (const val of expectedValues) {
      // The value should appear in some formatted form in the cards
      // Check the raw number or formatted version is present
      const valStr = String(val);
      const hasRaw = allCardText.includes(valStr);
      // Also check formatted versions like "1.5K", "2.3M"
      const hasFormatted =
        allCardText.includes(formatToken(val)) || allCardText.includes(val.toLocaleString());
      expect(hasRaw || hasFormatted).toBe(true);
    }

    await server.screenshot(page, "stats-cards-match-api");
  });

  test("4 - daily table rows match API daily data", async ({ page, server }) => {
    const projRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const projects = await projRes.json();
    expect(projects.length).toBeGreaterThan(0);

    const projectName = projects[0].name;

    const statsRes = await page.request.get(
      `${server.baseUrl}/api/stats/tokens?project=${encodeURIComponent(projectName)}`
    );
    const apiData = await statsRes.json();

    await goToStats(page, server.baseUrl);
    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });
    await select.selectOption(projectName);
    await page.waitForTimeout(2000);

    if (apiData.daily.length === 0) {
      // Should show empty hint
      await expect(page.locator(".empty-hint")).toBeVisible({ timeout: 3000 });
      return;
    }

    const table = page.locator(".table-section table");
    await expect(table).toBeVisible({ timeout: 5000 });

    // Get data rows (skip header row)
    const dataRows = table.locator("tbody tr, tr:not(:first-child)");
    const rowCount = await dataRows.count();

    // Each API daily entry should have a corresponding row
    expect(rowCount).toBeGreaterThanOrEqual(apiData.daily.length);

    // Verify each daily entry's date appears in the table
    const tableText = await table.innerText();
    for (const day of apiData.daily) {
      expect(tableText).toContain(day.date);
    }

    await server.screenshot(page, "stats-daily-table-matches-api");
  });

  test("5 - non-zero values for project with completed conversations", async ({
    page,
    server,
  }) => {
    // First send a chat message to ensure at least one conversation exists
    await sendChatMessage(page, server.baseUrl);

    // Now navigate to stats
    await goToStats(page, server.baseUrl);
    const projectName = await selectFirstProject(page);
    expect(projectName).toBeTruthy();

    // Summary cards should show non-zero values for input/output
    const cards = page.locator(".summary-cards .card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });

    const allCardText = await page.locator(".summary-cards").innerText();
    // Cards should not all be "0"
    const hasNonZero = !/^[\s\D]*0[\s\D]*0[\s\D]*0[\s\D]*0[\s\D]*$/.test(allCardText);
    expect(hasNonZero).toBe(true);

    // Daily table should be visible with at least one row after sending a message
    const table = page.locator(".table-section table");
    await expect(table).toBeVisible({ timeout: 5000 });
    const rows = table.locator("tbody tr, tr:not(:first-child)");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    await server.screenshot(page, "stats-nonzero-values");
  });

  test("6 - stats update after new conversation", async ({ page, server }) => {
    // Get initial stats via API
    const projRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const projects = await projRes.json();
    expect(projects.length).toBeGreaterThan(0);

    const projectName = projects[0].name;
    const beforeRes = await page.request.get(
      `${server.baseUrl}/api/stats/tokens?project=${encodeURIComponent(projectName)}`
    );
    const beforeData = await beforeRes.json();
    const beforeTotal = beforeData.totalInput + beforeData.totalOutput;

    // Send a chat message
    await sendChatMessage(page, server.baseUrl);

    // Check stats again via API
    const afterRes = await page.request.get(
      `${server.baseUrl}/api/stats/tokens?project=${encodeURIComponent(projectName)}`
    );
    const afterData = await afterRes.json();
    const afterTotal = afterData.totalInput + afterData.totalOutput;

    // Token counts should have increased after the conversation
    expect(afterTotal).toBeGreaterThan(beforeTotal);

    // Verify in UI the stats page shows data after a conversation
    await goToStats(page, server.baseUrl);
    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });
    await select.selectOption(projectName);
    await page.waitForTimeout(2000);

    const cards = page.locator(".summary-cards .card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "stats-after-new-conversation");
  });

  test("7 - bar chart proportions are accurate", async ({ page, server }) => {
    const projRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const projects = await projRes.json();
    expect(projects.length).toBeGreaterThan(0);

    const projectName = projects[0].name;
    const statsRes = await page.request.get(
      `${server.baseUrl}/api/stats/tokens?project=${encodeURIComponent(projectName)}`
    );
    const apiData = await statsRes.json();

    // Need at least 2 days to compare proportions
    expect(apiData.daily.length).toBeGreaterThanOrEqual(2);

    await goToStats(page, server.baseUrl);
    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });
    await select.selectOption(projectName);
    await page.waitForTimeout(2000);

    const barChart = page.locator(".bar-chart");
    await expect(barChart).toBeVisible({ timeout: 5000 });

    // Get all bar elements (rect elements in SVG)
    const bars = barChart.locator("svg rect");
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThanOrEqual(2);

    // Collect bar heights
    const heights: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const height = await bars.nth(i).getAttribute("height");
      if (height) {
        heights.push(parseFloat(height));
      }
    }

    // Find max daily usage from API
    const dailyTotals = apiData.daily.map(
      (d: { input: number; output: number; cache: number }) => d.input + d.output + d.cache
    );
    const maxDaily = Math.max(...dailyTotals);
    const maxBarHeight = Math.max(...heights);

    // The tallest bar should correspond to the highest-usage day
    expect(maxDaily).toBeGreaterThan(0);
    expect(maxBarHeight).toBeGreaterThan(0);

    // Verify the max bar index matches the max daily index
    const maxDailyIdx = dailyTotals.indexOf(maxDaily);
    const maxBarIdx = heights.indexOf(maxBarHeight);
    expect(maxBarIdx).toBe(maxDailyIdx);

    await server.screenshot(page, "stats-bar-chart-proportions");
  });

  test("8 - token formatting correct for large numbers", async ({ page, server }) => {
    const projRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const projects = await projRes.json();
    expect(projects.length).toBeGreaterThan(0);

    // Find a project with >1000 tokens
    let targetProject: string | null = null;
    let apiData: { totalInput: number; totalOutput: number; totalCache: number } | null = null;

    for (const proj of projects) {
      const res = await page.request.get(
        `${server.baseUrl}/api/stats/tokens?project=${encodeURIComponent(proj.name)}`
      );
      const data = await res.json();
      const total = data.totalInput + data.totalOutput + data.totalCache;
      if (total > 1000) {
        targetProject = proj.name;
        apiData = data;
        break;
      }
    }

    expect(targetProject).toBeTruthy();
    expect(apiData).toBeTruthy();

    await goToStats(page, server.baseUrl);
    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });
    await select.selectOption(targetProject!);
    await page.waitForTimeout(2000);

    const cards = page.locator(".summary-cards .card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });

    const allCardText = await page.locator(".summary-cards").innerText();

    // Verify formatted values like "1.5K", "2.3M", or comma-separated numbers
    const hasFormattedNumber =
      /\d+(\.\d+)?[KMB]/.test(allCardText) || /\d{1,3}(,\d{3})+/.test(allCardText);
    // At least one value >1000 should appear in formatted form
    expect(hasFormattedNumber).toBe(true);

    // Verify no obviously wrong values (NaN, undefined, null displayed)
    expect(allCardText).not.toContain("NaN");
    expect(allCardText).not.toContain("undefined");
    expect(allCardText).not.toContain("null");

    await server.screenshot(page, "stats-token-formatting");
  });

  test("9 - no data for zero-usage project shows empty hint without errors", async ({
    page,
    server,
  }) => {
    await goToStats(page, server.baseUrl);

    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });

    // Collect console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Try to find a project with zero usage, or use a nonexistent project
    const projRes = await page.request.get(`${server.baseUrl}/api/projects`);
    const projects = await projRes.json();

    let zeroProject: string | null = null;
    for (const proj of projects) {
      const res = await page.request.get(
        `${server.baseUrl}/api/stats/tokens?project=${encodeURIComponent(proj.name)}`
      );
      const data = await res.json();
      if (data.totalInput === 0 && data.totalOutput === 0 && data.totalCache === 0) {
        zeroProject = proj.name;
        break;
      }
    }

    test.skip(!zeroProject, "No zero-usage project available to test");

    await select.selectOption(zeroProject);
    await page.waitForTimeout(2000);

    // Should show empty hint
    const emptyHint = page.locator(".empty-hint");
    await expect(emptyHint).toBeVisible({ timeout: 5000 });

    // No bar chart or table should be visible
    const barChart = page.locator(".bar-chart");
    const table = page.locator(".table-section table");
    const hasChart = await barChart.isVisible();
    const hasTable = await table.isVisible();

    // With zero data, chart and table should not be shown (or be empty)
    if (hasChart) {
      // If chart is shown, it should have no meaningful bars
      const bars = barChart.locator("svg rect");
      const barCount = await bars.count();
      expect(barCount).toBe(0);
    }

    // No JS errors should have occurred
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("404")
    );
    expect(criticalErrors).toEqual([]);

    await server.screenshot(page, "stats-zero-usage-empty-hint");
  });

  test("10 - API failure shows error message without crash", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Mock the stats API to return 500
    await page.route("**/api/stats/tokens**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      })
    );

    const statsNav = page.locator('.nav-btn:has-text("Stats")').first();
    await statsNav.click();
    await expect(page.locator('h1:has-text("Token Statistics")')).toBeVisible({ timeout: 5000 });

    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });

    // Select a project (this will trigger the mocked 500 response)
    const firstOption = select.locator("option").nth(1);
    const projectName = await firstOption.getAttribute("value");
    expect(projectName).toBeTruthy();

    await select.selectOption(projectName!);
    await page.waitForTimeout(2000);

    // Error message should be displayed
    const errorMsg = page.locator(".error-msg");
    await expect(errorMsg).toBeVisible({ timeout: 5000 });

    // Page should not crash - heading should still be visible
    await expect(page.locator('h1:has-text("Token Statistics")')).toBeVisible();

    // No summary cards should be displayed when API fails
    const cards = page.locator(".summary-cards .card");
    const cardCount = await cards.count();
    expect(cardCount).toBe(0);

    await server.screenshot(page, "stats-api-failure");
  });

  test("11 - switching projects updates card values, chart, and table", async ({
    page,
    server,
  }) => {
    await goToStats(page, server.baseUrl);

    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });

    const options = select.locator("option");
    const optionCount = await options.count();

    // Need at least 2 real projects (plus placeholder)
    expect(optionCount).toBeGreaterThanOrEqual(3);

    // Select project A
    const projectA = await options.nth(1).getAttribute("value");
    expect(projectA).toBeTruthy();
    await select.selectOption(projectA!);
    await page.waitForTimeout(2000);

    // Record project A values
    const cards = page.locator(".summary-cards .card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    let cardTextsA: string[] = [];
    const countA = await cards.count();
    for (let i = 0; i < countA; i++) {
      cardTextsA.push(await cards.nth(i).innerText());
    }

    // Fetch API data for both projects
    const statsResA = await page.request.get(
      `${server.baseUrl}/api/stats/tokens?project=${encodeURIComponent(projectA!)}`
    );
    const apiDataA = await statsResA.json();

    const projectB = await options.nth(2).getAttribute("value");
    expect(projectB).toBeTruthy();

    const statsResB = await page.request.get(
      `${server.baseUrl}/api/stats/tokens?project=${encodeURIComponent(projectB!)}`
    );
    const apiDataB = await statsResB.json();

    await server.screenshot(page, "stats-project-a-selected");

    // Select project B
    await select.selectOption(projectB!);
    await page.waitForTimeout(2000);

    await server.screenshot(page, "stats-project-b-selected");

    // Verify display updated to project B's data
    const allCardTextB = await page.locator(".summary-cards").innerText();

    // Card values should have changed after switching projects
    const totalA = apiDataA.totalInput + apiDataA.totalOutput + apiDataA.totalCache;
    const totalB = apiDataB.totalInput + apiDataB.totalOutput + apiDataB.totalCache;

    let cardTextsB: string[] = [];
    const countB = await cards.count();
    for (let i = 0; i < countB; i++) {
      cardTextsB.push(await cards.nth(i).innerText());
    }

    if (totalA !== totalB) {
      // At least one card should differ when projects have different data
      const anyDifferent = cardTextsA.some((text, idx) => text !== cardTextsB[idx]);
      expect(anyDifferent).toBe(true);
    } else {
      // If totals are the same, card texts should match
      expect(cardTextsB).toEqual(cardTextsA);
    }

    // Verify project B values appear in the display
    const totalBValue = apiDataB.totalInput + apiDataB.totalOutput + apiDataB.totalCache;
    const hasBValue =
      allCardTextB.includes(String(totalBValue)) ||
      allCardTextB.includes(formatToken(totalBValue));
    expect(hasBValue).toBe(true);

    // Chart and table should reflect project B
    const barChart = page.locator(".bar-chart");
    const table = page.locator(".table-section table");
    const emptyHint = page.locator(".empty-hint");

    if (apiDataB.daily.length > 0) {
      // Should have chart or table visible
      await expect(barChart.or(table).first()).toBeVisible({ timeout: 5000 });
    } else {
      // Should show empty hint
      await expect(emptyHint).toBeVisible({ timeout: 3000 });
    }
  });
});

// Helper to format token numbers similar to UI formatting
function formatToken(n: number): string {
  if (n >= 1_000_000) {
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (n >= 1_000) {
    return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return String(n);
}
