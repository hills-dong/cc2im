import { test, expect } from "./fixtures.js";

/**
 * Stats Missing E2E Tests
 * Covers: empty states, error handling, edge cases
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

test.describe("M5 - Loading States", () => {
  // Case #32 (P0): Loading indicator shown during fetch
  test("loading-shown-during-fetch", async ({ page, server }) => {
    // Delay the API response to make loading visible
    await page.route("**/api/stats/overview*", async (route) => {
      // Fetch the real response but delay it
      const response = await route.fetch();
      const body = await response.text();
      // Small delay to ensure loading text is visible
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({ status: 200, contentType: "application/json", body });
    });

    await page.goto(server.baseUrl);
    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await expect(statsBtn).toBeVisible({ timeout: 5000 });
    await statsBtn.click();

    // Loading text should appear
    await expect(page.locator(".loading-text")).toBeVisible({ timeout: 5000 });
    const loadingText = await page.locator(".loading-text").textContent();
    expect(loadingText).toContain("Loading statistics");

    // After data loads, loading text should disappear
    await expect(page.locator(".loading-text")).toBeHidden({ timeout: 10000 });

    await server.screenshot(page, "loading-indicator");
  });

  // Case #33 (P1): Loading shown on tab switch
  test("loading-shown-on-tab-switch", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    // Add delay to API for next request
    await page.route("**/api/stats/overview*", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await new Promise((r) => setTimeout(r, 500));
      await route.fulfill({ status: 200, contentType: "application/json", body });
    });

    // Click a different tab
    await page.locator(".window-tabs .tab-btn").nth(1).click();

    // Loading text should appear during re-fetch
    await expect(page.locator(".loading-text")).toBeVisible({ timeout: 5000 });

    // After data loads, loading disappears
    await expect(page.locator(".loading-text")).toBeHidden({ timeout: 10000 });

    await server.screenshot(page, "loading-tab-switch");
  });
});

test.describe("M5 - Empty States", () => {
  // Case #34 (P0): Empty state when no data in window
  test("empty-state-no-data", async ({ page, server }) => {
    // Mock API to return empty projects
    await page.route("**/api/stats/overview*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          window: "24h",
          total: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
          projects: [],
        }),
      })
    );

    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    // Empty hint should be visible
    await expect(page.locator(".empty-hint")).toBeVisible({ timeout: 5000 });
    const hintText = await page.locator(".empty-hint").textContent();
    expect(hintText).toContain("No token usage data in this time window.");

    // No project cards should exist
    await expect(page.locator(".project-card")).toHaveCount(0);

    await server.screenshot(page, "empty-state");
  });

  // Case #35 (P1): Empty state shows zero summary cards
  test("empty-cards-show-zero", async ({ page, server }) => {
    // Mock API to return empty data with zero totals
    await page.route("**/api/stats/overview*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          window: "24h",
          total: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
          projects: [],
        }),
      })
    );

    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const summaryCards = page.locator(".summary-cards");
    await expect(summaryCards).toBeVisible({ timeout: 5000 });

    // All card-value elements should show "0"
    const inputCard = summaryCards.locator(".card.primary").first();
    await expect(inputCard.locator(".card-value")).toHaveText("0");
    await expect(inputCard.locator(".card-sub")).toHaveText("0");

    const outputCard = summaryCards.locator(".card.primary").nth(1);
    await expect(outputCard.locator(".card-value")).toHaveText("0");
    await expect(outputCard.locator(".card-sub")).toHaveText("0");

    const cacheCard = summaryCards.locator(".card.secondary");
    await expect(cacheCard.locator(".card-value-sm")).toHaveText("0 / 0");
    await expect(cacheCard.locator(".card-sub")).toHaveText("0 / 0");

    await server.screenshot(page, "empty-cards-zero");
  });
});

test.describe("M5 - Error Handling", () => {
  // Case #36 (P0): API 500 error shows error message
  test("error-api-500", async ({ page, server }) => {
    // Mock API to return 500
    await page.route("**/api/stats/overview*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      })
    );

    await goToStats(page, server.baseUrl);

    // Error message should be visible
    await expect(page.locator(".error-msg")).toBeVisible({ timeout: 5000 });
    const errorText = await page.locator(".error-msg").textContent();
    expect(errorText).toContain("Failed to load stats");

    // No summary cards should be rendered (data is null on error)
    await expect(page.locator(".summary-cards")).toHaveCount(0);

    // Page heading should still be visible (no crash)
    await expect(page.locator("h1:has-text('Token Statistics')")).toBeVisible();

    await server.screenshot(page, "error-500");
  });

  // Case #37 (P1): API network error shows error message
  test("error-network-failure", async ({ page, server }) => {
    // Mock network failure
    await page.route("**/api/stats/overview*", (route) => route.abort());

    await goToStats(page, server.baseUrl);

    // Error message should be visible
    await expect(page.locator(".error-msg")).toBeVisible({ timeout: 5000 });

    // Tabs should still be clickable
    const tabs = page.locator(".window-tabs .tab-btn");
    await expect(tabs.first()).toBeEnabled();
    await expect(tabs.nth(1)).toBeEnabled();

    await server.screenshot(page, "error-network");
  });

  // Case #38 (P1): Error clears on successful retry
  test("error-clears-on-retry", async ({ page, server }) => {
    // Mock API failure for initial load
    await page.route("**/api/stats/overview*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary error" }),
      })
    );

    await goToStats(page, server.baseUrl);

    // Error should be shown
    await expect(page.locator(".error-msg")).toBeVisible({ timeout: 5000 });

    // Remove the mock to allow real API calls
    await page.unroute("**/api/stats/overview*");

    // Click a different tab to retry
    await page.locator(".window-tabs .tab-btn").nth(2).click();
    await waitForDataLoaded(page);

    // Error should be cleared
    await expect(page.locator(".error-msg")).toHaveCount(0);

    // Data should render (either summary cards or empty hint)
    await expect(
      page.locator(".summary-cards, .empty-hint").first()
    ).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "error-retry");
  });

  // Case #39 (P1): No console errors during normal operation
  test("no-console-errors", async ({ page, server }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to Stats
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    // Switch tabs
    await page.locator(".window-tabs .tab-btn").nth(1).click();
    await waitForDataLoaded(page);

    await page.locator(".window-tabs .tab-btn").nth(2).click();
    await waitForDataLoaded(page);

    // Expand/collapse projects if any exist
    const projectCards = page.locator(".project-card");
    const projectCount = await projectCards.count();
    if (projectCount > 0) {
      await projectCards.first().locator(".project-header").click();
      await expect(projectCards.first().locator(".session-table")).toBeVisible({ timeout: 3000 });

      await projectCards.first().locator(".project-header").click();
      await expect(projectCards.first().locator(".session-table")).toHaveCount(0);
    }

    // Filter out favicon 404 errors
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("404")
    );
    expect(criticalErrors).toEqual([]);

    await server.screenshot(page, "no-js-errors");
  });
});
