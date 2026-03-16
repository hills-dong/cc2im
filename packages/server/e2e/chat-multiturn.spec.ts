import { test, expect } from "./fixtures.js";

test.describe("Chat Multi-turn", () => {
  test("second message in same session", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send first message
    await textarea.fill("Reply with exactly: first reply");
    await textarea.press("Enter");

    const firstUser = page.locator(".message-wrap.user").first();
    await expect(firstUser).toBeVisible({ timeout: 3000 });

    const firstAssistant = page.locator(".message-wrap.assistant").first();
    await expect(firstAssistant).toBeVisible({ timeout: 30000 });
    await expect(firstAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });
    await server.screenshot(page, "multiturn-first-response");

    // Send second message
    await textarea.fill("Reply with exactly: second reply");
    await textarea.press("Enter");

    const userBubbles = page.locator(".message-wrap.user");
    await expect(userBubbles).toHaveCount(2, { timeout: 5000 });

    const secondAssistant = page.locator(".message-wrap.assistant").nth(1);
    await expect(secondAssistant).toBeVisible({ timeout: 30000 });
    await expect(secondAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Verify both conversations are visible
    const assistantBubbles = page.locator(".message-wrap.assistant");
    await expect(assistantBubbles).toHaveCount(2);

    await server.screenshot(page, "multiturn-second-response");
  });

  test("second turn produces a response without error", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send first message
    await textarea.fill("Reply with exactly: hello");
    await textarea.press("Enter");

    const firstAssistant = page.locator(".message-wrap.assistant").first();
    await expect(firstAssistant).toBeVisible({ timeout: 30000 });
    await expect(firstAssistant.locator(".cursor")).toBeHidden({ timeout: 90000 });
    await server.screenshot(page, "multiturn-context-first");

    // Send a second message in the same session
    await textarea.fill("Reply with exactly: world");
    await textarea.press("Enter");

    const secondAssistant = page.locator(".message-wrap.assistant").nth(1);
    await expect(secondAssistant).toBeVisible({ timeout: 30000 });
    await expect(secondAssistant.locator(".cursor")).toBeHidden({ timeout: 90000 });

    // Verify the second response has content (no error)
    const content = secondAssistant.locator(".content.markdown");
    await expect(content).toBeVisible();
    const text = await content.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
    // Verify it's not an error message
    expect(text).not.toContain("Error:");

    await server.screenshot(page, "multiturn-second-turn-success");
  });

  test("message ordering preserved across turns", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send first message
    await textarea.fill("Reply with exactly: alpha");
    await textarea.press("Enter");

    const firstAssistant = page.locator(".message-wrap.assistant").first();
    await expect(firstAssistant).toBeVisible({ timeout: 30000 });
    await expect(firstAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Send second message
    await textarea.fill("Reply with exactly: beta");
    await textarea.press("Enter");

    const secondAssistant = page.locator(".message-wrap.assistant").nth(1);
    await expect(secondAssistant).toBeVisible({ timeout: 30000 });
    await expect(secondAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Verify ordering: user1, assistant1, user2, assistant2
    const allMessages = page.locator(".message-wrap");
    await expect(allMessages).toHaveCount(4);

    const firstMsg = allMessages.nth(0);
    const secondMsg = allMessages.nth(1);
    const thirdMsg = allMessages.nth(2);
    const fourthMsg = allMessages.nth(3);

    await expect(firstMsg).toHaveClass(/user/);
    await expect(secondMsg).toHaveClass(/assistant/);
    await expect(thirdMsg).toHaveClass(/user/);
    await expect(fourthMsg).toHaveClass(/assistant/);

    await server.screenshot(page, "multiturn-ordering-preserved");
  });

  test("auto-scroll on new messages", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send a message that will produce a response
    await textarea.fill("Write a short paragraph about testing software.");
    await textarea.press("Enter");

    const assistantBubble = page.locator(".message-wrap.assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });
    await expect(assistantBubble.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Check that the last message is in viewport (auto-scrolled)
    await expect(assistantBubble).toBeInViewport();

    await server.screenshot(page, "multiturn-auto-scroll");
  });

  test("send blocked during streaming", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send a message that should produce a longer response
    await textarea.fill("Write a detailed paragraph about the history of computing.");
    await textarea.press("Enter");

    // Wait for streaming to start (assistant bubble appears with cursor)
    const assistantBubble = page.locator(".message-wrap.assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });

    // During streaming, either send button is disabled or abort button is shown
    const abortBtn = page.locator(".abort-btn");
    const sendBtn = page.locator(".send-btn");

    // The abort button should appear during streaming (replacing the send button)
    const abortVisible = await abortBtn.isVisible().catch(() => false);
    const sendDisabled = await sendBtn.isDisabled().catch(() => false);

    // At least one blocking mechanism should be active
    expect(abortVisible || sendDisabled).toBeTruthy();

    await server.screenshot(page, "multiturn-send-blocked-streaming");

    // Wait for streaming to complete before ending
    await expect(assistantBubble.locator(".cursor")).toBeHidden({ timeout: 60000 });
  });
});
