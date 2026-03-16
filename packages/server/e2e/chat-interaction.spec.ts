import { test, expect } from "./fixtures.js";

test.describe("Chat Interaction", () => {
  test("shows empty state when no project is selected", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const emptyState = page.locator(".empty-state");
    await expect(emptyState).toBeVisible({ timeout: 5000 });
    await expect(emptyState).toContainText("Select a project");

    await server.screenshot(page, "chat-empty-state");
  });

  test("clicking new session button shows chat UI", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await expect(newSessionBtn).toBeVisible({ timeout: 5000 });
    await newSessionBtn.click();
    await page.waitForTimeout(500);

    // Chat input area should appear
    const chatInput = page.locator(".chat-input-area");
    await expect(chatInput).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "chat-new-session-ui");
  });

  test("chat input has placeholder and disabled send button", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    const placeholder = await textarea.getAttribute("placeholder");
    expect(placeholder).toContain("Enter to send");

    const sendBtn = page.locator(".send-btn");
    await expect(sendBtn).toBeDisabled();

    await server.screenshot(page, "chat-input-empty");
  });

  test("send button enables when text is typed", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("Hello Claude");

    const sendBtn = page.locator(".send-btn");
    await expect(sendBtn).not.toBeDisabled();

    await server.screenshot(page, "chat-input-filled");
  });

  test("sending a message and receiving Claude response", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("Reply with exactly: hello e2e");
    await server.screenshot(page, "chat-before-send");

    await textarea.press("Enter");

    // Step 1: User bubble should appear immediately
    const userBubble = page.locator(".message-wrap.user").first();
    await expect(userBubble).toBeVisible({ timeout: 3000 });
    await expect(userBubble).toContainText("Reply with exactly: hello e2e");
    await server.screenshot(page, "chat-user-sent");

    // Step 2: Assistant bubble should appear (streaming starts)
    const assistantBubble = page.locator(".message-wrap.assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });
    await server.screenshot(page, "chat-assistant-streaming");

    // Step 3: Wait for streaming to finish (cursor disappears)
    const cursor = assistantBubble.locator(".cursor");
    await expect(cursor).toBeHidden({ timeout: 60000 });
    await server.screenshot(page, "chat-assistant-done");

    // Step 4: Verify assistant reply has actual content
    const content = assistantBubble.locator(".content.markdown");
    await expect(content).toBeVisible();
    const text = await content.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);

    await server.screenshot(page, "chat-complete-conversation");
  });

  test("no-messages hint shows before first message", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const noMessages = page.locator(".no-messages");
    await expect(noMessages).toBeVisible({ timeout: 3000 });

    await server.screenshot(page, "chat-no-messages-hint");
  });
});
