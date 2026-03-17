import { test, expect } from "./fixtures.js";

test.describe("Chat Edge Cases", () => {
  test("empty message not sent", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send button should be disabled with empty input
    const sendBtn = page.locator(".send-btn");
    await expect(sendBtn).toBeDisabled();

    // Try clicking the disabled send button
    await sendBtn.click({ force: true });
    await page.waitForTimeout(500);

    // Also try pressing Enter with empty input
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Try with whitespace-only input
    await textarea.fill("   ");
    await textarea.press("Enter");
    await page.waitForTimeout(500);

    // Verify no user bubble appeared
    const userBubbles = page.locator(".message-wrap.user");
    await expect(userBubbles).toHaveCount(0);

    await server.screenshot(page, "edge-empty-message-blocked");
  });

  test("markdown formatting rendered in response", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Ask for markdown-formatted response
    await textarea.fill(
      "Reply with exactly this markdown (no extra text):\n**bold text** and `inline code` and\n```\ncode block\n```"
    );
    await textarea.press("Enter");

    const assistantBubble = page.locator(".message-wrap.assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });
    await expect(assistantBubble.locator(".cursor")).toBeHidden({ timeout: 90000 });

    const markdownContent = assistantBubble.locator(".content.markdown");
    await expect(markdownContent).toBeVisible();

    // Verify rendered HTML elements exist (not raw markdown syntax)
    const html = await markdownContent.innerHTML();

    // Should have bold rendered as <strong> or <b>
    const hasBold = html.includes("<strong>") || html.includes("<b>");
    expect(hasBold).toBeTruthy();

    // Should have code rendered as <code>
    expect(html).toContain("<code>");

    await server.screenshot(page, "edge-markdown-rendered");
  });

  test("new session button shows chat input area", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Click new session button
    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();
    await page.waitForTimeout(500);

    // Chat input area should be visible
    const chatInput = page.locator(".chat-input-area");
    await expect(chatInput).toBeVisible({ timeout: 3000 });

    // Textarea should be present and editable
    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await expect(textarea).not.toBeDisabled();

    await server.screenshot(page, "edge-new-session-input");
  });

  test("clicking existing session from sidebar loads its state", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Assert existing sessions exist in sidebar
    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });

    // Click an existing session
    await sessionItems.first().click();
    await page.waitForTimeout(1000);

    // Should activate the session
    await expect(sessionItems.first()).toHaveClass(/active/, { timeout: 2000 });

    // Main content should show something (either messages or empty state for that session)
    const mainContent = page.locator(".main-content");
    await expect(mainContent).toBeVisible();

    await server.screenshot(page, "edge-sidebar-session-click");
  });
});
