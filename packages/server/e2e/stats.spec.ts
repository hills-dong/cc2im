import { test, expect } from "./fixtures.js";

test.describe("Token Stats Page", () => {
  test.beforeEach(async ({ server }) => {
    // Seed a project so onboarding doesn't show
    await fetch(`http://127.0.0.1:${server.port}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "stats-proj", directory: "/tmp/stats" }),
    });
  });

  test("navigates to stats page and displays token statistics", async ({ page, server }) => {
    await page.goto(`http://127.0.0.1:${server.port}/`);

    // Click stats nav button
    const statsBtn = page.locator("button:has-text('Stats'), button:has-text('stats'), button:has-text('Statistics'), button:has-text('统计'), button:has-text('Token'), [data-page='stats']").first();
    await expect(statsBtn).toBeVisible({ timeout: 5000 });
    await statsBtn.click();

    // Should show stats page content
    await expect(page.locator("text=/[Tt]oken|[Ss]tats|[Uu]sage/").first()).toBeVisible({ timeout: 3000 });
  });

  test("token stats API returns correct data", async ({ page, server }) => {
    // Query token stats for a project
    const response = await page.request.get(
      `http://127.0.0.1:${server.port}/api/stats/tokens?project=stats-proj`,
    );
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data).toHaveProperty("inputTokens");
    expect(data).toHaveProperty("outputTokens");
    expect(data).toHaveProperty("cacheReadTokens");
    expect(data).toHaveProperty("cacheCreationTokens");
    // Fresh project should have 0 tokens
    expect(data.inputTokens).toBe(0);
    expect(data.outputTokens).toBe(0);
  });
});
