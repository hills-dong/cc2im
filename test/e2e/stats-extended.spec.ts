import { test, expect } from "./fixtures.js";

/**
 * Stats Extended E2E Tests
 * Covers: data accuracy, API validation, time windows, project summary accuracy
 */

// Helper: navigate to Stats page
async function goToStats(page: import("@playwright/test").Page, baseUrl: string) {
  await page.goto(baseUrl);
  const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
  await expect(statsBtn).toBeVisible({ timeout: 5000 });
  await statsBtn.click();
  await expect(page.locator("h1:has-text('Token Statistics')")).toBeVisible({ timeout: 5000 });
}

// Helper: wait for data to load
async function waitForDataLoaded(page: import("@playwright/test").Page) {
  await expect(
    page.locator(".summary-cards, .empty-hint, .error-msg").first()
  ).toBeVisible({ timeout: 10000 });
}

// Helper: replicate the fmt function from Stats.svelte
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// Helper: replicate fmtFull from Stats.svelte
function fmtFull(n: number): string {
  return n.toLocaleString();
}

test.describe("Data Accuracy - Card Values Match API", () => {
  // Case #11 (P0): Card values match API response
  test("cards-values-match-api", async ({ page, server }) => {
    // Fetch API data
    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();

    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    // If no data, summary cards may still show zeros
    const summaryCards = page.locator(".summary-cards");
    await expect(summaryCards).toBeVisible({ timeout: 5000 });

    // Input card
    const inputCard = summaryCards.locator(".card.primary").first();
    const inputValue = await inputCard.locator(".card-value").textContent();
    const inputSub = await inputCard.locator(".card-sub").textContent();
    expect(inputValue?.trim()).toBe(fmt(apiData.total.input));
    expect(inputSub?.trim()).toBe(fmtFull(apiData.total.input));

    // Output card
    const outputCard = summaryCards.locator(".card.primary").nth(1);
    const outputValue = await outputCard.locator(".card-value").textContent();
    const outputSub = await outputCard.locator(".card-sub").textContent();
    expect(outputValue?.trim()).toBe(fmt(apiData.total.output));
    expect(outputSub?.trim()).toBe(fmtFull(apiData.total.output));

    // Cache card
    const cacheCard = summaryCards.locator(".card.secondary");
    const cacheValueSm = await cacheCard.locator(".card-value-sm").textContent();
    const cacheSub = await cacheCard.locator(".card-sub").textContent();
    expect(cacheValueSm?.trim()).toBe(
      `${fmt(apiData.total.cacheRead)} / ${fmt(apiData.total.cacheCreation)}`
    );
    expect(cacheSub?.trim()).toBe(
      `${fmtFull(apiData.total.cacheRead)} / ${fmtFull(apiData.total.cacheCreation)}`
    );

    await server.screenshot(page, "cards-api-match");
  });

  // Case #23 (P1): Project summary values match API per-project totals
  test("projects-summary-matches-api", async ({ page, server }) => {
    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const projectCards = page.locator(".project-card");

    for (let i = 0; i < apiData.projects.length; i++) {
      const proj = apiData.projects[i];
      const card = projectCards.nth(i);

      const nameText = await card.locator(".project-name").textContent();
      expect(nameText?.trim()).toBe(proj.name);

      const summaryText = await card.locator(".project-summary").textContent();
      expect(summaryText).toContain(`in: ${fmt(proj.total.input)}`);
      expect(summaryText).toContain(`out: ${fmt(proj.total.output)}`);
    }

    await server.screenshot(page, "projects-accuracy");
  });
});

test.describe("State Persistence", () => {
  // Case #40 (P1): Active tab resets to 24h on page reload
  test("state-tab-resets-on-reload", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    // Switch to "all" tab
    const tabs = page.locator(".window-tabs .tab-btn");
    await tabs.nth(2).click();
    await waitForDataLoaded(page);

    // Verify "all" is active
    await expect(tabs.nth(2)).toHaveClass(/active/);

    // Reload and re-navigate
    await page.reload();
    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await expect(statsBtn).toBeVisible({ timeout: 5000 });
    await statsBtn.click();
    await expect(page.locator("h1:has-text('Token Statistics')")).toBeVisible({ timeout: 5000 });

    // Default tab should be 24h again
    const tabsAfter = page.locator(".window-tabs .tab-btn");
    await expect(tabsAfter.nth(0)).toHaveClass(/active/);
    await expect(tabsAfter.nth(0)).toHaveText("最近 24h");

    await server.screenshot(page, "state-tab-reload");
  });
});

test.describe("Tabs Always Visible", () => {
  // Case #44 (P1): Tabs always visible in any state
  test("tabs-always-visible", async ({ page, server }) => {
    // Test 1: tabs visible during normal data load
    await goToStats(page, server.baseUrl);
    await expect(page.locator(".window-tabs")).toBeVisible({ timeout: 3000 });
    await waitForDataLoaded(page);
    await expect(page.locator(".window-tabs")).toBeVisible();

    // Test 2: tabs visible during error state
    await page.route("**/api/stats/overview*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "test error" }),
      })
    );

    // Click a tab to trigger re-fetch with mocked error
    await page.locator(".window-tabs .tab-btn").nth(1).click();
    await expect(page.locator(".error-msg")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".window-tabs")).toBeVisible();

    // Tabs should still be clickable
    await expect(page.locator(".window-tabs .tab-btn").nth(2)).toBeEnabled();

    await server.screenshot(page, "tabs-always");
  });
});
