import { test, expect } from "./fixtures.js";

/**
 * Stats Display E2E Tests
 * Covers: UI rendering, tabs, cards, project cards, session tables
 */

// Helper: navigate to Stats page
async function goToStats(page: import("@playwright/test").Page, baseUrl: string) {
  await page.goto(baseUrl);
  const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
  await expect(statsBtn).toBeVisible({ timeout: 5000 });
  await statsBtn.click();
  await expect(page.locator("h1:has-text('Token Statistics')")).toBeVisible({ timeout: 5000 });
}

// Helper: wait for data to load (loading disappears, summary-cards or empty-hint or error-msg visible)
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

test.describe("M7 - Navigation", () => {
  // Case #42 (P0): Navigate to Stats page via nav button
  test("navigate-to-stats", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    const statsBtn = page.locator("button.nav-btn:has-text('Stats')");
    await expect(statsBtn).toBeVisible({ timeout: 5000 });
    await statsBtn.click();

    await expect(page.locator("h1:has-text('Token Statistics')")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".window-tabs")).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "navigate-stats");
  });
});

test.describe("M1 - Window Tabs", () => {
  // Case #1 (P0): User sees time window options
  test("tabs-render-three-buttons", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);

    const windowTabs = page.locator(".window-tabs");
    await expect(windowTabs).toBeVisible({ timeout: 3000 });

    const tabBtns = windowTabs.locator(".tab-btn");
    await expect(tabBtns).toHaveCount(3);

    await expect(tabBtns.nth(0)).toHaveText("最近 24h");
    await expect(tabBtns.nth(1)).toHaveText("最近 7天");
    await expect(tabBtns.nth(2)).toHaveText("全部");

    await server.screenshot(page, "tabs-render");
  });

  // Case #2 (P0): Default tab is 24h
  test("tabs-default-active-24h", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);

    const firstTab = page.locator(".window-tabs .tab-btn").first();
    await expect(firstTab).toHaveClass(/active/);
    await expect(firstTab).toHaveText("最近 24h");

    await server.screenshot(page, "tabs-default");
  });

  // Case #3 (P0): User switches to 7d tab
  test("tabs-switch-to-7d", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);

    const tabs = page.locator(".window-tabs .tab-btn");
    const tab24h = tabs.nth(0);
    const tab7d = tabs.nth(1);

    // Initially 24h is active
    await expect(tab24h).toHaveClass(/active/);

    await tab7d.click();

    await expect(tab7d).toHaveClass(/active/);
    await expect(tab24h).not.toHaveClass(/active/);

    await server.screenshot(page, "tabs-switch-7d");
  });

  // Case #4 (P1): User switches to all tab
  test("tabs-switch-to-all", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);

    const tabs = page.locator(".window-tabs .tab-btn");
    const tabAll = tabs.nth(2);

    await tabAll.click();

    await expect(tabAll).toHaveClass(/active/);
    await expect(tabs.nth(0)).not.toHaveClass(/active/);
    await expect(tabs.nth(1)).not.toHaveClass(/active/);

    await server.screenshot(page, "tabs-switch-all");
  });

  // Case #5 (P0): Tab switch triggers API call
  test("tabs-switch-triggers-fetch", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    // Intercept the next overview call
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/stats/overview") && res.url().includes("window=7d")
    );

    // Click the 7d tab
    await page.locator(".window-tabs .tab-btn").nth(1).click();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // Wait for new data to render
    await waitForDataLoaded(page);

    await server.screenshot(page, "tabs-api-call");
  });

  // Case #6 (P1): Rapid tab switching does not corrupt display
  test("tabs-rapid-switch-no-corruption", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    // Rapidly click 7d then all
    const tabs = page.locator(".window-tabs .tab-btn");
    await tabs.nth(1).click(); // 7d
    await tabs.nth(2).click(); // all (immediately)

    // Wait for the "all" window response
    await page.waitForResponse(
      (res) => res.url().includes("/api/stats/overview") && res.url().includes("window=all")
    );
    await waitForDataLoaded(page);

    // The "all" tab should be active
    await expect(tabs.nth(2)).toHaveClass(/active/);
    await expect(tabs.nth(1)).not.toHaveClass(/active/);

    await server.screenshot(page, "tabs-rapid");
  });
});

test.describe("M2 - Summary Cards", () => {
  // Case #7 (P0): Summary cards render with data
  test("cards-render-three-cards", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const summaryCards = page.locator(".summary-cards");
    await expect(summaryCards).toBeVisible({ timeout: 5000 });

    const cards = summaryCards.locator(".card");
    await expect(cards).toHaveCount(3);

    const primaryCards = summaryCards.locator(".card.primary");
    await expect(primaryCards).toHaveCount(2);

    const secondaryCards = summaryCards.locator(".card.secondary");
    await expect(secondaryCards).toHaveCount(1);

    await server.screenshot(page, "cards-render");
  });

  // Case #8 (P0): Input card shows correct label and value
  test("cards-input-label-value", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const firstPrimary = page.locator(".summary-cards .card.primary").first();
    await expect(firstPrimary).toBeVisible({ timeout: 5000 });

    await expect(firstPrimary.locator(".card-label")).toHaveText("Input Tokens");
    await expect(firstPrimary.locator(".card-value")).toBeVisible();
    await expect(firstPrimary.locator(".card-sub")).toBeVisible();

    // card-value should contain a valid formatted number (digits, possibly with K/M suffix)
    const cardValue = await firstPrimary.locator(".card-value").textContent();
    expect(cardValue).toMatch(/^\d+(\.\d+)?[KM]?$/);

    await server.screenshot(page, "cards-input");
  });

  // Case #9 (P0): Output card shows correct label and value
  test("cards-output-label-value", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const secondPrimary = page.locator(".summary-cards .card.primary").nth(1);
    await expect(secondPrimary).toBeVisible({ timeout: 5000 });

    await expect(secondPrimary.locator(".card-label")).toHaveText("Output Tokens");
    await expect(secondPrimary.locator(".card-value")).toBeVisible();
    await expect(secondPrimary.locator(".card-sub")).toBeVisible();

    await server.screenshot(page, "cards-output");
  });

  // Case #10 (P1): Cache card shows read/create split
  test("cards-cache-read-create", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const cacheCard = page.locator(".summary-cards .card.secondary");
    await expect(cacheCard).toBeVisible({ timeout: 5000 });

    await expect(cacheCard.locator(".card-label")).toHaveText("Cache (read / create)");
    await expect(cacheCard.locator(".card-value-sm")).toBeVisible();

    // Should show "X / Y" format
    const valueSm = await cacheCard.locator(".card-value-sm").textContent();
    expect(valueSm).toMatch(/^.+\s*\/\s*.+$/);

    await server.screenshot(page, "cards-cache");
  });

  // Case #12 (P0): Cards update when tab switches
  test("cards-update-on-tab-switch", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    // Capture 24h card values
    const cardValuesBefore = await page.locator(".summary-cards").innerText();

    // Switch to "all" tab
    await page.locator(".window-tabs .tab-btn").nth(2).click();
    await waitForDataLoaded(page);

    // Cards should still be visible
    await expect(page.locator(".summary-cards")).toBeVisible({ timeout: 5000 });

    // Screenshot showing updated cards
    await server.screenshot(page, "cards-tab-update");
  });

  // Case #13 (P1): Number formatting: K suffix
  test("cards-format-thousands", async ({ page, server }) => {
    // Mock API to return known values in the thousands range
    await page.route("**/api/stats/overview*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          window: "24h",
          total: { input: 12345, output: 6789, cacheRead: 1500, cacheCreation: 2300 },
          projects: [],
        }),
      })
    );

    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const inputCard = page.locator(".summary-cards .card.primary").first();
    await expect(inputCard.locator(".card-value")).toHaveText("12.3K");

    await server.screenshot(page, "cards-fmt-k");
  });

  // Case #16 (P0): No NaN/undefined/null in card values
  test("cards-no-invalid-values", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const summaryText = await page.locator(".summary-cards").innerText();
    expect(summaryText).not.toContain("NaN");
    expect(summaryText).not.toContain("undefined");
    expect(summaryText).not.toContain("null");

    await server.screenshot(page, "cards-valid");
  });
});

test.describe("M3 - Project Accordion", () => {
  // Case #17 (P0): Project cards render for each project
  test("projects-render-list", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    // Fetch API to know expected project count
    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();

    const projectCards = page.locator(".project-card");
    await expect(projectCards).toHaveCount(apiData.projects.length);

    await server.screenshot(page, "projects-list");
  });

  // Case #18 (P0): Project card shows name and summary
  test("projects-name-summary", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();

    // Skip if no projects
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    const firstCard = page.locator(".project-card").first();
    const projectName = firstCard.locator(".project-name");
    const projectSummary = firstCard.locator(".project-summary");

    await expect(projectName).toBeVisible();
    await expect(projectSummary).toBeVisible();

    // Summary should contain "in:" and "out:"
    const summaryText = await projectSummary.textContent();
    expect(summaryText).toContain("in:");
    expect(summaryText).toContain("out:");

    await server.screenshot(page, "projects-info");
  });

  // Case #19 (P0): Projects default to collapsed
  test("projects-default-collapsed", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    // All collapse icons should show "▶"
    const collapseIcons = page.locator(".collapse-icon");
    const count = await collapseIcons.count();
    for (let i = 0; i < count; i++) {
      await expect(collapseIcons.nth(i)).toHaveText("▶");
    }

    // No session tables should be visible
    await expect(page.locator(".session-table")).toHaveCount(0);

    await server.screenshot(page, "projects-collapsed");
  });

  // Case #20 (P0): Click project header expands it
  test("projects-expand-on-click", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    const firstCard = page.locator(".project-card").first();
    const header = firstCard.locator(".project-header");
    const collapseIcon = firstCard.locator(".collapse-icon");

    await header.click();

    await expect(collapseIcon).toHaveText("▼");
    await expect(firstCard.locator(".session-table")).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "projects-expand");
  });

  // Case #21 (P0): Click expanded project header collapses it
  test("projects-collapse-on-click", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    const firstCard = page.locator(".project-card").first();
    const header = firstCard.locator(".project-header");
    const collapseIcon = firstCard.locator(".collapse-icon");

    // Expand
    await header.click();
    await expect(collapseIcon).toHaveText("▼");
    await expect(firstCard.locator(".session-table")).toBeVisible({ timeout: 3000 });

    // Collapse
    await header.click();
    await expect(collapseIcon).toHaveText("▶");
    await expect(firstCard.locator(".session-table")).toHaveCount(0);

    await server.screenshot(page, "projects-collapse");
  });

  // Case #22 (P1): Multiple projects can be expanded simultaneously
  test("projects-multi-expand", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length < 2, "Need 2+ projects for multi-expand test");

    const firstCard = page.locator(".project-card").nth(0);
    const secondCard = page.locator(".project-card").nth(1);

    await firstCard.locator(".project-header").click();
    await expect(firstCard.locator(".collapse-icon")).toHaveText("▼");

    await secondCard.locator(".project-header").click();
    await expect(secondCard.locator(".collapse-icon")).toHaveText("▼");

    // Both should have visible session tables
    await expect(firstCard.locator(".session-table")).toBeVisible({ timeout: 3000 });
    await expect(secondCard.locator(".session-table")).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "projects-multi");
  });

  // Case #24 (P1): Tab switch resets expanded state and reloads projects
  test("projects-tab-switch-reloads", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    // Expand first project
    const firstCard = page.locator(".project-card").first();
    await firstCard.locator(".project-header").click();
    await expect(firstCard.locator(".session-table")).toBeVisible({ timeout: 3000 });

    // Switch tab to "all"
    await page.locator(".window-tabs .tab-btn").nth(2).click();
    await waitForDataLoaded(page);

    // After tab switch, data is set to null during load then re-rendered
    // All projects should be collapsed (expandedProjects Set is reset)
    const collapseIcons = page.locator(".collapse-icon");
    const count = await collapseIcons.count();
    for (let i = 0; i < count; i++) {
      await expect(collapseIcons.nth(i)).toHaveText("▶");
    }

    await server.screenshot(page, "projects-tab-reset");
  });
});

test.describe("M4 - Session Table", () => {
  // Case #25 (P0): Session table has correct columns
  test("session-table-columns", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    // Expand first project
    await page.locator(".project-card").first().locator(".project-header").click();

    const sessionTable = page.locator(".session-table").first();
    await expect(sessionTable).toBeVisible({ timeout: 3000 });

    const headers = sessionTable.locator("thead th");
    await expect(headers).toHaveCount(5);
    await expect(headers.nth(0)).toHaveText("Platform");
    await expect(headers.nth(1)).toHaveText("Session");
    await expect(headers.nth(2)).toHaveText("Time");
    await expect(headers.nth(3)).toHaveText("In");
    await expect(headers.nth(4)).toHaveText("Out");

    await server.screenshot(page, "session-columns");
  });

  // Case #26 (P0): Session rows render for each session
  test("session-table-rows", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    const firstProject = apiData.projects[0];

    // Expand first project
    await page.locator(".project-card").first().locator(".project-header").click();

    const sessionTable = page.locator(".session-table").first();
    await expect(sessionTable).toBeVisible({ timeout: 3000 });

    const rows = sessionTable.locator("tbody tr");
    await expect(rows).toHaveCount(firstProject.sessions.length);

    await server.screenshot(page, "session-rows");
  });

  // Case #27 (P1): Platform column shows icon and name
  test("session-platform-display", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    // Expand first project
    await page.locator(".project-card").first().locator(".project-header").click();

    const sessionTable = page.locator(".session-table").first();
    await expect(sessionTable).toBeVisible({ timeout: 3000 });

    const platformCells = sessionTable.locator("tbody td.col-platform");
    const count = await platformCells.count();
    expect(count).toBeGreaterThan(0);

    const platformIcons: Record<string, string> = {
      discord: "🟣",
      lark: "🔵",
      web: "🟢",
    };

    const firstProject = apiData.projects[0];
    for (let i = 0; i < count; i++) {
      const cellText = await platformCells.nth(i).textContent();
      const session = firstProject.sessions[i];
      const platform = session.platform ?? "unknown";
      const icon = session.platform ? (platformIcons[session.platform] ?? "⚪") : "⚪";
      expect(cellText).toContain(icon);
      expect(cellText).toContain(platform);
    }

    await server.screenshot(page, "session-platform");
  });

  // Case #28 (P1): Session column shows name or truncated ID
  test("session-name-or-id", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    // Expand first project
    await page.locator(".project-card").first().locator(".project-header").click();

    const sessionTable = page.locator(".session-table").first();
    await expect(sessionTable).toBeVisible({ timeout: 3000 });

    const sessionCells = sessionTable.locator("tbody td.col-session");
    const firstProject = apiData.projects[0];

    for (let i = 0; i < firstProject.sessions.length; i++) {
      const cellText = await sessionCells.nth(i).textContent();
      const session = firstProject.sessions[i];
      if (session.name) {
        expect(cellText).toBe(session.name);
      } else {
        expect(cellText).toBe(session.sessionId.slice(0, 12));
      }
    }

    await server.screenshot(page, "session-name");
  });

  // Case #29 (P1): Time column shows formatted date
  test("session-time-format", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    // Expand first project
    await page.locator(".project-card").first().locator(".project-header").click();

    const sessionTable = page.locator(".session-table").first();
    await expect(sessionTable).toBeVisible({ timeout: 3000 });

    const timeCells = sessionTable.locator("tbody td.col-time");
    const firstProject = apiData.projects[0];

    for (let i = 0; i < firstProject.sessions.length; i++) {
      const cellText = (await timeCells.nth(i).textContent())?.trim();
      const session = firstProject.sessions[i];
      if (session.createdAt === null) {
        expect(cellText).toBe("—");
      } else {
        // Should match MM-DD HH:MM format
        expect(cellText).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);
      }
    }

    await server.screenshot(page, "session-time");
  });

  // Case #30 (P1): In/Out columns show formatted token counts
  test("session-token-values", async ({ page, server }) => {
    await goToStats(page, server.baseUrl);
    await waitForDataLoaded(page);

    const apiRes = await page.request.get(`${server.baseUrl}/api/stats/overview?window=24h`);
    const apiData = await apiRes.json();
    test.skip(apiData.projects.length === 0, "No projects in 24h window");

    // Expand first project
    await page.locator(".project-card").first().locator(".project-header").click();

    const sessionTable = page.locator(".session-table").first();
    await expect(sessionTable).toBeVisible({ timeout: 3000 });

    const rows = sessionTable.locator("tbody tr");
    const firstProject = apiData.projects[0];

    for (let i = 0; i < firstProject.sessions.length; i++) {
      const row = rows.nth(i);
      const numCells = row.locator("td.col-num");

      const inText = (await numCells.nth(0).textContent())?.trim();
      const outText = (await numCells.nth(1).textContent())?.trim();

      const session = firstProject.sessions[i];
      expect(inText).toBe(fmt(session.total.input));
      expect(outText).toBe(fmt(session.total.output));
    }

    await server.screenshot(page, "session-tokens");
  });
});
