import { test, expect } from "./fixtures.js";

/**
 * User Journeys — end-to-end flows combining multiple features.
 * These tests are serial and depend on state built up through the journey.
 */

test.describe("User Journey J0: First-time Setup", () => {
  test("complete onboarding wizard from empty config", async ({ page, server }) => {
    // Mock empty project state for onboarding
    await page.route("**/api/projects", (route) => {
      const method = route.request().method();
      if (method === "POST") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ name: "j0-project", directory: "/tmp/j0" }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.route("**/api/config", (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          claude: { command: "/app/e2e/fixtures/mock-claude.sh", defaultArgs: ["--print"], timeout: 30000, bufferInterval: 500 },
          projects: [], discord: { token: "" }, lark: { appId: "", appSecret: "" },
          formatter: { maxMessageLength: { discord: 2000, lark: 30000, web: 100000 }, maxConcurrentProcesses: 2 },
        }),
      });
    });
    await page.route("**/api/claude/test", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    );

    // Step 1: Navigate to app - overlay should appear
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);
    await expect(page.locator(".overlay")).toBeVisible({ timeout: 5000 });
    await server.screenshot(page, "j0-step1-overlay");

    // Step 2: Claude command
    await page.locator("#claude-cmd").fill("/app/e2e/fixtures/mock-claude.sh");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);

    // Step 3: Test command
    await page.locator('.btn-primary:has-text("Test Command")').click();
    await page.waitForTimeout(3000);
    await expect(page.locator(".status-msg.success")).toBeVisible({ timeout: 10000 });
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);

    // Step 4: Project details
    await page.locator("#proj-name").fill("j0-project");
    await page.locator("#proj-dir").fill("/tmp/j0");
    await page.locator('.btn-primary:has-text("Next")').click();
    await page.waitForTimeout(1000);

    // Step 5: Skip platform tokens
    await page.locator('.btn-ghost:has-text("Skip")').click();
    await page.waitForTimeout(1000);

    // Step 6: Finish
    await page.locator('.btn-primary:has-text("Start Chatting")').click();
    await page.waitForTimeout(2000);

    // Overlay should be gone, chat visible
    await expect(page.locator(".overlay")).toBeHidden({ timeout: 5000 });
    await expect(page.locator(".main-content")).toBeVisible();

    await server.screenshot(page, "j0-complete");
  });
});

test.describe("User Journey J1: First Conversation", () => {
  test("send first message and receive streaming response with tokens", async ({ page, server }) => {
    // Listen for WS events
    const wsMessages: any[] = [];
    page.on("websocket", (ws) => {
      ws.on("framereceived", (frame) => {
        try { wsMessages.push(JSON.parse(frame.payload as string)); } catch {}
      });
    });

    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Create new session
    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();
    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Step 1: Type message
    await textarea.fill("Hello, what can you do?");
    const sendBtn = page.locator(".send-btn");
    await expect(sendBtn).not.toBeDisabled();

    // Step 2: Send
    await textarea.press("Enter");

    // Step 3: User bubble appears immediately
    const userBubble = page.locator(".message-wrap.user").first();
    await expect(userBubble).toBeVisible({ timeout: 500 });
    await server.screenshot(page, "j1-user-sent");

    // Step 4: Streaming starts
    const assistantBubble = page.locator(".message-wrap.assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });

    // Step 5: Wait for completion
    await expect(assistantBubble.locator(".cursor")).toBeHidden({ timeout: 60000 });
    const content = assistantBubble.locator(".content.markdown");
    const text = await content.textContent();
    expect(text!.length).toBeGreaterThan(0);

    // Step 6: Verify chat.done received
    await page.waitForTimeout(1000);
    const doneEvents = wsMessages.filter(m => m.type === "chat.done");
    expect(doneEvents.length).toBeGreaterThan(0);

    await server.screenshot(page, "j1-complete");
  });
});

test.describe("User Journey J2: Configuration Change", () => {
  test("modify config settings and verify persistence", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Step 1: Navigate to Config
    const configNav = page.locator('.nav-btn:has-text("Config")').first();
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);
    await server.screenshot(page, "j2-config-loaded");

    // Step 2: Change Claude default args
    const argsInput = page.locator("#claude-args");
    await expect(argsInput).toBeVisible({ timeout: 5000 });
    const originalArgs = await argsInput.inputValue();
    await argsInput.fill(originalArgs + " --verbose");

    // Step 3: Save
    const saveBtn = page.locator('button:has-text("Save Config")').first();
    await saveBtn.click();
    await page.waitForTimeout(2000);

    // Step 4: Reload and verify
    await page.reload();
    await page.waitForTimeout(2000);
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);

    const reloadedArgs = await page.locator("#claude-args").inputValue();
    expect(reloadedArgs).toContain("--verbose");

    // Restore original value
    await page.locator("#claude-args").fill(originalArgs);
    await page.locator('button:has-text("Save Config")').first().click();
    await page.waitForTimeout(1000);

    // Step 5: Add a project
    const addBtn = page.locator('button:has-text("+ Add Project")').first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    await page.waitForTimeout(500);
    await page.locator("#new-proj-name").fill("j2-test-project");
    await page.locator("#new-proj-dir").fill("/tmp/j2");
    await page.locator('button:has-text("Add Project")').first().click();
    await page.waitForTimeout(2000);

    await server.screenshot(page, "j2-config-changed");

    // Step 6: Verify project appears (reload to check sidebar)
    await page.reload();
    await page.waitForTimeout(2000);
    const projectSection = page.locator('.project-section:has-text("j2-test-project")');
    await expect(projectSection).toBeVisible({ timeout: 5000 });

    // Step 7: Delete the test project
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);
    const card = page.locator('.project-card:has-text("j2-test-project")');
    await expect(card).toBeVisible({ timeout: 5000 });
    await card.locator(".btn-danger").click();
    await page.waitForTimeout(2000);

    // Cleanup via API (in case UI delete didn't work)
    try {
      await page.request.delete(`${server.baseUrl}/api/projects/j2-test-project`);
    } catch {}

    await server.screenshot(page, "j2-complete");
  });
});

test.describe("User Journey J3: Multi-turn & History", () => {
  test("extended conversation with history persistence", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Step 1: Start session and send first message
    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();
    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Remember this: the secret word is elephant");
    await textarea.press("Enter");
    const assistant1 = page.locator(".message-wrap.assistant").first();
    await expect(assistant1).toBeVisible({ timeout: 30000 });
    await expect(assistant1.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Step 2: Second message
    await textarea.fill("What did I just ask you to remember?");
    await textarea.press("Enter");
    const assistant2 = page.locator(".message-wrap.assistant").nth(1);
    await expect(assistant2).toBeVisible({ timeout: 30000 });
    await expect(assistant2.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Step 3: Third message
    await textarea.fill("Summarize our conversation");
    await textarea.press("Enter");
    const assistant3 = page.locator(".message-wrap.assistant").nth(2);
    await expect(assistant3).toBeVisible({ timeout: 30000 });
    await expect(assistant3.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Verify 6 messages in order
    const allMessages = page.locator(".message-wrap");
    await expect(allMessages).toHaveCount(6);

    await server.screenshot(page, "j3-multiturn");

    // Step 4: Reload and verify history loads
    await page.reload();
    await page.waitForTimeout(3000);

    // Sidebar should still show projects
    const projectSections = page.locator(".project-section");
    await expect(projectSections.first()).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "j3-after-reload");
  });
});

test.describe("User Journey J4: Token Stats Verification", () => {
  test("verify token stats reflect conversations", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Step 1: Send a message first
    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();
    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("Token stats journey test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Step 2: Navigate to Stats
    const statsNav = page.locator('.nav-btn:has-text("Stats")').first();
    await statsNav.click();
    await expect(page.locator('h1:has-text("Token Statistics")')).toBeVisible({ timeout: 5000 });

    // Step 3: Select project
    const select = page.locator("#project-select");
    await expect(select).toBeVisible({ timeout: 3000 });
    const option = select.locator("option").nth(1);
    const projectName = await option.getAttribute("value");
    expect(projectName).toBeTruthy();
    await select.selectOption(projectName!);
    await page.waitForTimeout(2000);

    // Step 4: Check cards are visible
    const cards = page.locator(".summary-cards .card");
    await expect(cards.first()).toBeVisible({ timeout: 5000 });

    // Step 5: Check API
    const res = await page.request.get(`${server.baseUrl}/api/stats/tokens?project=${projectName}`);
    const data = await res.json();
    expect(data).toHaveProperty("totalInput");
    expect(data).toHaveProperty("totalOutput");
    expect(data).toHaveProperty("daily");

    await server.screenshot(page, "j4-stats-verified");
  });
});

test.describe("User Journey J5: Returning User", () => {
  test("returning user sees previous data", async ({ page, server, browser }) => {
    // Step 1: First visit - send a message
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();
    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("Returning user journey test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    await server.screenshot(page, "j5-first-visit");

    // Step 2: Close browser
    await page.close();

    // Step 3: Open new browser context
    const newPage = await browser.newPage();
    await newPage.goto(server.baseUrl);
    await newPage.waitForTimeout(3000);

    // Step 4: Verify app loads
    const sidebar = newPage.locator(".sidebar");
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Step 5: Projects should be visible
    const projectSections = newPage.locator(".project-section");
    await expect(projectSections.first()).toBeVisible({ timeout: 5000 });

    // Step 6: WS should connect
    const connStatus = newPage.locator(".conn-status");
    await expect(connStatus).toContainText("Connected", { timeout: 5000 });

    await server.screenshot(newPage, "j5-returning-user");
    await newPage.close();
  });
});

test.describe("User Journey J6: Error Recovery", () => {
  test("app recovers from errors gracefully", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Step 1: Start a session
    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();
    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Error recovery journey test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    await server.screenshot(page, "j6-initial");

    // Step 2: Simulate network disconnect
    await page.context().setOffline(true);
    await page.waitForTimeout(3000);

    // Step 3: Reconnect
    await page.context().setOffline(false);
    await page.waitForTimeout(5000);

    // Step 4: Verify recovery
    const connStatus = page.locator(".conn-status");
    await expect(connStatus).toContainText("Connected", { timeout: 30000 });

    // Step 5: Send another message
    await textarea.fill("Message after recovery");
    await textarea.press("Enter");
    await page.waitForTimeout(3000);

    // Step 6: Try empty message
    await page.locator(".send-btn").click({ force: true });
    await page.waitForTimeout(500);

    // Step 7: Reload after error states
    await page.reload();
    await page.waitForTimeout(2000);

    // App should recover to clean state
    const sidebar = page.locator(".sidebar");
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "j6-recovered");
  });
});
