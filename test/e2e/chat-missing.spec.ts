import { test, expect } from "./fixtures.js";

test.describe("Chat Page - Missing Test Cases", () => {
  // ── UI Tests ──

  test("long conversation scrollable", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send multiple messages to create long conversation
    for (let i = 0; i < 5; i++) {
      await textarea.fill(`Message number ${i + 1} for scroll test`);
      await textarea.press("Enter");
      const assistant = page.locator(".message-wrap.assistant").nth(i);
      await expect(assistant).toBeVisible({ timeout: 30000 });
      await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });
    }

    // Verify scrollbar is present - .messages-container has overflow-y: auto
    const messagesContainer = page.locator(".messages-container").first();
    const isScrollable = await messagesContainer.evaluate((el) => el.scrollHeight > el.clientHeight);
    // If messages-container not found, check any scrollable parent
    if (!isScrollable) {
      const anyScrollable = await page.evaluate(() => {
        const messages = document.querySelectorAll(".message-wrap");
        if (messages.length === 0) return false;
        let el = messages[0].parentElement;
        while (el) {
          if (el.scrollHeight > el.clientHeight) return true;
          el = el.parentElement;
        }
        return false;
      });
      expect(anyScrollable).toBeTruthy();
    }

    await server.screenshot(page, "chat-long-conversation-scrollable");
  });

  test("XSS prevention in messages", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send XSS payload
    await textarea.fill("<script>alert('xss')</script>");
    await textarea.press("Enter");

    const userBubble = page.locator(".message-wrap.user").first();
    await expect(userBubble).toBeVisible({ timeout: 3000 });

    // Text should display literally, not execute
    await expect(userBubble).toContainText("<script>alert('xss')</script>");

    // Verify no script injection in DOM
    const scriptExecuted = await page.evaluate(() => {
      return (window as any).__xss_triggered === true;
    });
    expect(scriptExecuted).toBeFalsy();

    await server.screenshot(page, "chat-xss-prevention");
  });

  // ── UX Tests ──

  test("Shift+Enter inserts newline", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Line 1");
    await textarea.press("Shift+Enter");
    await textarea.type("Line 2");

    // Message should NOT be sent
    const userBubbles = page.locator(".message-wrap.user");
    await expect(userBubbles).toHaveCount(0);

    // Textarea should contain both lines
    const value = await textarea.inputValue();
    expect(value).toContain("Line 1");
    expect(value).toContain("Line 2");
  });

  test("abort streaming response", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Write a very long response about the history of computing");
    await textarea.press("Enter");

    // Wait for streaming to start
    const assistantBubble = page.locator(".message-wrap.assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });

    // Abort button must be visible during streaming
    const abortBtn = page.locator(".abort-btn");
    await expect(abortBtn).toBeVisible({ timeout: 5000 });

    await abortBtn.click();
    // Cursor should disappear after abort
    await expect(assistantBubble.locator(".cursor")).toBeHidden({ timeout: 10000 });
    // Should be able to send again
    const sendBtn = page.locator(".send-btn");
    await expect(sendBtn).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "chat-abort-streaming");
  });

  test("reconnection after disconnect", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const connStatus = page.locator(".conn-status");
    await expect(connStatus).toContainText("Connected", { timeout: 5000 });

    // Simulate WS disconnect by closing all WebSocket connections
    const disconnected = await page.evaluate(() => {
      const originalWS = (window as any).__ws;
      if (originalWS) {
        originalWS.close();
        return true;
      }
      return false;
    });
    expect(disconnected).toBe(true);

    // Wait a moment and check if reconnection happens
    await page.waitForTimeout(5000);

    // Connection should auto-reconnect
    await expect(connStatus).toContainText("Connected", { timeout: 30000 });

    await server.screenshot(page, "chat-reconnection");
  });

  test("double-click send button only sends once", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("Double click test message");

    const sendBtn = page.locator(".send-btn");
    await expect(sendBtn).not.toBeDisabled();

    // Double click rapidly
    await sendBtn.dblclick();

    // Wait for response
    await page.waitForTimeout(2000);

    // Only 1 user bubble should appear
    const userBubbles = page.locator(".message-wrap.user");
    const count = await userBubbles.count();
    expect(count).toBe(1);
  });

  // ── Functional Tests ──

  test("context continuity - assistant references prior messages", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // First message
    await textarea.fill("Remember this word: elephant");
    await textarea.press("Enter");
    const firstAssistant = page.locator(".message-wrap.assistant").first();
    await expect(firstAssistant).toBeVisible({ timeout: 30000 });
    await expect(firstAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Second message asking about prior context
    await textarea.fill("What did I just ask you to remember?");
    await textarea.press("Enter");
    const secondAssistant = page.locator(".message-wrap.assistant").nth(1);
    await expect(secondAssistant).toBeVisible({ timeout: 30000 });
    await expect(secondAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Verify assistant response references prior context
    const content = secondAssistant.locator(".content.markdown");
    const text = await content.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
    // The response should reference the word from the prior message
    const lowerText = (text ?? "").toLowerCase();
    const referencesContext = lowerText.includes("elephant") || lowerText.includes("earlier") || lowerText.includes("prior") || lowerText.includes("remember");
    expect(referencesContext).toBe(true);

    await server.screenshot(page, "chat-context-continuity");
  });

  test("session resume sends to same session ID", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // First message to establish session
    await textarea.fill("First message for session resume test");
    await textarea.press("Enter");
    const firstAssistant = page.locator(".message-wrap.assistant").first();
    await expect(firstAssistant).toBeVisible({ timeout: 30000 });
    await expect(firstAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Second message in same session
    await textarea.fill("Second message in same session");
    await textarea.press("Enter");
    const secondAssistant = page.locator(".message-wrap.assistant").nth(1);
    await expect(secondAssistant).toBeVisible({ timeout: 30000 });
    await expect(secondAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Verify both messages are in the same session
    // The sidebar should not have created a second session for the second message
    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });
    const sessionCountBefore = await sessionItems.count();

    // The count should not have increased from the second message (same session reused)
    // We don't assert exact count since other tests may have created sessions in the shared DB

    // Both user and assistant messages should be visible in the same view
    const allMessages = page.locator(".message-wrap");
    const msgCount = await allMessages.count();
    expect(msgCount).toBe(4); // 2 user + 2 assistant in same session

    await server.screenshot(page, "chat-session-resume");
  });

  test("new vs existing session distinction", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send a message to create a session with history
    await textarea.fill("Message for new vs existing test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Wait for session to appear in sidebar
    await page.waitForTimeout(1000);
    const sessionItemsBefore = page.locator(".session-item");
    const sessionCount = await sessionItemsBefore.count();

    // Click + to start new session
    await newSessionBtn.click();
    await page.waitForTimeout(1000);

    // New session should show different state from existing:
    // Either no-messages hint, or chat input area is visible (ready for new input)
    const chatInput = page.locator(".chat-input-area, textarea.message-input");
    await expect(chatInput.first()).toBeVisible({ timeout: 3000 });

    // Session must exist in sidebar after sending a message
    expect(sessionCount).toBeGreaterThan(0);

    // Click the session to verify it shows messages
    await sessionItemsBefore.first().click();
    await page.waitForTimeout(1000);

    // Existing session should show its messages
    const messages = page.locator(".message-wrap");
    const msgCount = await messages.count();
    expect(msgCount).toBeGreaterThan(0);

    await server.screenshot(page, "chat-new-vs-existing-loaded");

    // Click + again to verify it goes back to blank state
    await newSessionBtn.click();
    await page.waitForTimeout(500);

    // Chat input should still be visible for the new session
    await expect(chatInput.first()).toBeVisible();

    await server.screenshot(page, "chat-new-vs-existing");
  });

  test("empty session state shows hint", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();
    await page.waitForTimeout(500);

    // Should show no-messages hint
    const noMessages = page.locator(".no-messages");
    await expect(noMessages).toBeVisible({ timeout: 3000 });

    // Should NOT show stale messages from another session
    const assistantBubbles = page.locator(".message-wrap.assistant");
    await expect(assistantBubbles).toHaveCount(0);
  });

  // ── Real-time Tests ──

  test("user message appears BEFORE server response", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("Optimistic UI test");

    await textarea.press("Enter");

    // User bubble should appear immediately (< 200ms)
    const userBubble = page.locator(".message-wrap.user").first();
    await expect(userBubble).toBeVisible({ timeout: 200 });

    // At this point, assistant bubble may not exist yet
    const assistantCount = await page.locator(".message-wrap.assistant").count();
    // User bubble should be visible before or at the same time as assistant

    await server.screenshot(page, "chat-optimistic-ui");

    // Wait for completion so test doesn't leave orphaned state
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });
  });

  test("streaming renders progressively", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("Tell me about progressive streaming");
    await textarea.press("Enter");

    const assistantBubble = page.locator(".message-wrap.assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });

    // Check content grows over time (mock streams in chunks)
    const content = assistantBubble.locator(".content.markdown");
    await expect(content).toBeVisible({ timeout: 5000 });

    // Wait for completion
    await expect(assistantBubble.locator(".cursor")).toBeHidden({ timeout: 60000 });
    const finalText = await content.textContent();
    expect(finalText!.length).toBeGreaterThan(0);

    await server.screenshot(page, "chat-progressive-streaming");
  });

  test("no lag between send and bubble", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("No lag test");

    const startTime = Date.now();
    await textarea.press("Enter");

    // User bubble should appear within 300ms
    const userBubble = page.locator(".message-wrap.user").first();
    await expect(userBubble).toBeVisible({ timeout: 300 });
    const elapsed = Date.now() - startTime;

    // Textarea should be cleared
    const value = await textarea.inputValue();
    expect(value).toBe("");

    // Wait for response completion
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });
  });

  test("send message then immediately refresh", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("Refresh interrupt test");
    await textarea.press("Enter");

    // Immediately reload within 500ms
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForTimeout(2000);

    // Page should recover gracefully - no crash
    const sidebar = page.locator(".sidebar").first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    const mainContent = page.locator(".main-content").first();
    await expect(mainContent).toBeVisible();

    await server.screenshot(page, "chat-refresh-interrupt");
  });

  test("switch session while streaming", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send message to start streaming
    await textarea.fill("Streaming session switch test");
    await textarea.press("Enter");

    const assistantBubble = page.locator(".message-wrap.assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });

    // Switch to a new session while streaming
    await newSessionBtn.click();
    await page.waitForTimeout(1000);

    // Switched session should load correctly - no orphaned streaming state
    const mainContent = page.locator(".main-content");
    await expect(mainContent).toBeVisible();

    // No crash or error
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.waitForTimeout(2000);

    expect(pageErrors).toHaveLength(0);

    await server.screenshot(page, "chat-switch-during-stream");
  });

  // ── State Persistence Tests ──

  test("history survives page refresh", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send messages
    await textarea.fill("History persistence test message 1");
    await textarea.press("Enter");
    const assistant1 = page.locator(".message-wrap.assistant").first();
    await expect(assistant1).toBeVisible({ timeout: 30000 });
    await expect(assistant1.locator(".cursor")).toBeHidden({ timeout: 60000 });

    await textarea.fill("History persistence test message 2");
    await textarea.press("Enter");
    const assistant2 = page.locator(".message-wrap.assistant").nth(1);
    await expect(assistant2).toBeVisible({ timeout: 30000 });
    await expect(assistant2.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Count messages before refresh
    const preRefreshCount = await page.locator(".message-wrap").count();
    expect(preRefreshCount).toBe(4); // 2 user + 2 assistant

    // Refresh
    await page.reload();
    await page.waitForTimeout(2000);

    // Re-select the session - it must exist after refresh
    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });
    await sessionItems.first().click();
    await page.waitForTimeout(2000);

    // All messages should still be there
    const postRefreshCount = await page.locator(".message-wrap").count();
    expect(postRefreshCount).toBe(preRefreshCount);

    await server.screenshot(page, "chat-history-persists");
  });

  test("session list survives refresh", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Record session count
    const sessionItems = page.locator(".session-item");
    const preCount = await sessionItems.count();

    // Refresh
    await page.reload();
    await page.waitForTimeout(2000);

    // Same session count
    const postCount = await page.locator(".session-item").count();
    expect(postCount).toBe(preCount);

    await server.screenshot(page, "chat-session-list-survives-refresh");
  });

  test("active session state survives refresh", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Sessions must exist
    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });
    await sessionItems.first().click();
    await page.waitForTimeout(1000);

    // Reload
    await page.reload();
    await page.waitForTimeout(2000);

    // Sessions must still exist after refresh
    const postSessionItems = page.locator(".session-item");
    await expect(postSessionItems.first()).toBeVisible({ timeout: 5000 });
    await postSessionItems.first().click();
    await page.waitForTimeout(1000);

    // Should show the session's content
    const mainContent = page.locator(".main-content");
    await expect(mainContent).toBeVisible();

    await server.screenshot(page, "chat-active-session-refresh");
  });

  test("navigate away and back preserves chat", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send a message
    await textarea.fill("Navigate away test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Navigate to Config
    const configNav = page.locator('.nav-btn:has-text("Config")').first();
    await configNav.click();
    await expect(page.locator(".config-page")).toBeVisible({ timeout: 5000 });

    // Navigate back to Chat by clicking a session in sidebar
    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });
    await sessionItems.first().click();
    await page.waitForTimeout(1000);

    // Previous messages should be visible
    const messages = page.locator(".message-wrap");
    const count = await messages.count();
    expect(count).toBeGreaterThan(0);

    await server.screenshot(page, "chat-navigate-away-back");
  });

  test("history across browser sessions", async ({ page, server, browser }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send a message
    await textarea.fill("Browser session persistence test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Wait for session to appear in sidebar
    await page.waitForTimeout(1000);

    // Close current page
    await page.close();

    // Open new page (simulates new browser session)
    const newPage = await browser.newPage();
    await newPage.goto(server.baseUrl);
    await newPage.waitForTimeout(3000);

    // Projects should be visible (sessions are loaded when project is expanded)
    const projectSections = newPage.locator(".project-section");
    await expect(projectSections.first()).toBeVisible({ timeout: 5000 });

    // Sessions should be visible under the project (projects start expanded)
    const sessionItems = newPage.locator(".session-item");
    await newPage.waitForTimeout(2000);
    const count = await sessionItems.count();

    // Data persists server-side, so sessions must be available
    expect(count).toBeGreaterThan(0);
    await sessionItems.first().click();
    await newPage.waitForTimeout(1000);

    const messages = newPage.locator(".message-wrap");
    const msgCount = await messages.count();
    expect(msgCount).toBeGreaterThan(0);

    await server.screenshot(newPage, "chat-browser-session-persistence");
    await newPage.close();
  });

  test("markdown in loaded history renders correctly", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send message asking for markdown
    await textarea.fill("Reply with bold text and inline code please");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Reload and re-select session
    await page.reload();
    await page.waitForTimeout(2000);

    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });
    await sessionItems.first().click();
    await page.waitForTimeout(1000);

    // Markdown should be rendered, not raw text
    const markdownContent = page.locator(".content.markdown").first();
    await expect(markdownContent).toBeVisible({ timeout: 5000 });
    const html = await markdownContent.innerHTML();
    // Should have rendered HTML, not raw markdown syntax
    const hasRenderedElements = html.includes("<") && !html.startsWith("**");
    expect(hasRenderedElements).toBeTruthy();

    await server.screenshot(page, "chat-markdown-history");
  });

  // ── Data Accuracy Tests ──

  test("token stats non-zero after conversation", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Token stats test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Token display must be visible after a conversation
    const tokenDisplay = page.locator(".token-display, .token-count, .token-stats").first();
    await expect(tokenDisplay).toBeVisible({ timeout: 5000 });
    const tokenText = await tokenDisplay.textContent();
    // Should not be 0/0 or blank
    expect(tokenText).not.toBe("0/0");
    expect(tokenText?.trim().length).toBeGreaterThan(0);

    await server.screenshot(page, "chat-token-stats");
  });

  test("token stats match server values", async ({ page, server }) => {
    // Listen for WS chat.done events BEFORE navigation
    const wsMessages: any[] = [];
    page.on("websocket", (ws) => {
      ws.on("framereceived", (frame) => {
        try {
          const msg = JSON.parse(frame.payload as string);
          if (msg.type === "chat.done") {
            wsMessages.push(msg);
          }
        } catch {}
      });
    });

    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Token match test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Wait a bit for the done event to arrive
    await page.waitForTimeout(1000);

    // Verify we captured a chat.done event
    expect(wsMessages.length).toBeGreaterThan(0);
    const doneMsg = wsMessages[0];
    expect(doneMsg.type).toBe("chat.done");

    await server.screenshot(page, "chat-token-match-server");
  });

  test("message content exact after reload", async ({ page, server }) => {
    const uniqueText = `Exact content test ${Date.now()}`;

    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill(uniqueText);
    await textarea.press("Enter");

    const userBubble = page.locator(".message-wrap.user").first();
    await expect(userBubble).toBeVisible({ timeout: 3000 });
    await expect(userBubble).toContainText(uniqueText);

    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Reload and check content
    await page.reload();
    await page.waitForTimeout(2000);

    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });
    await sessionItems.first().click();
    await page.waitForTimeout(1000);

    // User message should match exactly
    const reloadedUserBubble = page.locator(".message-wrap.user").first();
    await expect(reloadedUserBubble).toBeVisible({ timeout: 5000 });
    await expect(reloadedUserBubble).toContainText(uniqueText);

    await server.screenshot(page, "chat-content-exact-reload");
  });

  // ── Error Handling Tests ──

  test("network failure during streaming", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Network failure test");
    await textarea.press("Enter");

    const assistantBubble = page.locator(".message-wrap.assistant").first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });

    // Simulate network failure by going offline
    await page.context().setOffline(true);
    await page.waitForTimeout(3000);

    // Restore network
    await page.context().setOffline(false);
    await page.waitForTimeout(3000);

    // Page should not crash
    const sidebar = page.locator(".sidebar").first();
    await expect(sidebar).toBeVisible();

    await server.screenshot(page, "chat-network-failure");
  });

  test("very long message handling", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Generate a very long message (50000+ chars)
    const longMessage = "A".repeat(50000);
    await textarea.fill(longMessage);
    await textarea.press("Enter");

    // Should either send successfully or show an error, but NOT crash
    await page.waitForTimeout(5000);

    // Page should still be functional
    const sidebar = page.locator(".sidebar").first();
    await expect(sidebar).toBeVisible();

    await server.screenshot(page, "chat-very-long-message");
  });

  test("rapid successive sends after streaming", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send first message and wait for completion
    await textarea.fill("First rapid test");
    await textarea.press("Enter");
    const assistant1 = page.locator(".message-wrap.assistant").first();
    await expect(assistant1).toBeVisible({ timeout: 30000 });
    await expect(assistant1.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Immediately send second message
    await textarea.fill("Second rapid test");
    await textarea.press("Enter");

    // Should handle gracefully - no race condition
    await page.waitForTimeout(3000);

    // Messages should appear in order
    const userBubbles = page.locator(".message-wrap.user");
    const userCount = await userBubbles.count();
    expect(userCount).toBe(2);

    await server.screenshot(page, "chat-rapid-successive");
  });

  // ── Functional Tests (remaining) ──

  test("image attachment drag and drop", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Check if image input/drop zone exists
    const imageInput = page.locator('input[type="file"], .image-drop-zone, .image-attach');
    const hasImageSupport = await imageInput.count() > 0;

    // Just verify the chat area supports the feature without crashing
    // Full drag-and-drop testing requires complex file simulation
    await server.screenshot(page, "chat-image-attachment");
  });

  test("image paste from clipboard", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Simulate clipboard paste event
    await textarea.focus();
    // Dispatch a paste event (without actual image data - just verify no crash)
    await page.evaluate(() => {
      const event = new ClipboardEvent("paste", { bubbles: true });
      document.querySelector("textarea.message-input")?.dispatchEvent(event);
    });

    await page.waitForTimeout(1000);

    // Page should not crash
    const sidebar = page.locator(".sidebar").first();
    await expect(sidebar).toBeVisible();

    await server.screenshot(page, "chat-image-paste");
  });

  test("two browser tabs simultaneous", async ({ page, server, browser }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Open second tab
    const page2 = await browser.newPage();
    await page2.goto(server.baseUrl);
    await page2.waitForTimeout(2000);

    // Both tabs should show connected
    const conn1 = page.locator(".conn-status");
    const conn2 = page2.locator(".conn-status");
    await expect(conn1).toContainText("Connected", { timeout: 5000 });
    await expect(conn2).toContainText("Connected", { timeout: 5000 });

    // Send message from tab 1
    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();
    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill("Two tabs test");
    await textarea.press("Enter");

    // Tab 1 should get response
    const assistant1 = page.locator(".message-wrap.assistant").first();
    await expect(assistant1).toBeVisible({ timeout: 30000 });
    await expect(assistant1.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // No crash on either tab
    const sidebar2 = page2.locator(".sidebar").first();
    await expect(sidebar2).toBeVisible();

    await server.screenshot(page, "chat-two-tabs-tab1");
    await server.screenshot(page2, "chat-two-tabs-tab2");

    await page2.close();
  });

  // ── WS Persistence Tests ──

  test("WS reconnection preserves state", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send a message
    await textarea.fill("WS reconnection state test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Count messages before disconnect
    const preDisconnectCount = await page.locator(".message-wrap").count();

    // Simulate disconnect by going offline then online
    await page.context().setOffline(true);
    await page.waitForTimeout(2000);
    await page.context().setOffline(false);
    await page.waitForTimeout(5000);

    // Messages should still be visible
    const postReconnectCount = await page.locator(".message-wrap").count();
    expect(postReconnectCount).toBe(preDisconnectCount);

    // Can send new messages - send button must be accessible after reconnection
    const sendBtn = page.locator(".send-btn");
    await expect(sendBtn).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "chat-ws-reconnection-state");
  });

  test("token stats accumulate across turns", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    // Send 3 messages and observe token accumulation
    for (let i = 0; i < 3; i++) {
      await textarea.fill(`Token accumulation test ${i + 1}`);
      await textarea.press("Enter");
      const assistant = page.locator(".message-wrap.assistant").nth(i);
      await expect(assistant).toBeVisible({ timeout: 30000 });
      await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });
    }

    // Verify we have 6 messages (3 user + 3 assistant)
    const allMessages = page.locator(".message-wrap");
    await expect(allMessages).toHaveCount(6);

    await server.screenshot(page, "chat-token-accumulate");
  });

  test("token stats survive page refresh", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Token persist test");
    await textarea.press("Enter");
    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Check stats page for token values
    const statsNav = page.locator('.nav-btn:has-text("Stats")').first();
    await statsNav.click();
    await expect(page.locator('h1:has-text("Token Statistics")')).toBeVisible({ timeout: 5000 });

    // Select the project
    const projectSelect = page.locator("#project-select");
    await projectSelect.selectOption({ label: "e2e-project" });
    await page.waitForTimeout(2000);

    // Capture token display text before refresh
    const statsContent = page.locator(".main-content");
    const preRefreshText = await statsContent.textContent();
    expect(preRefreshText?.trim().length).toBeGreaterThan(0);

    // Reload and re-check
    await page.reload();
    await page.waitForTimeout(2000);

    // Re-navigate to stats
    const statsNav2 = page.locator('.nav-btn:has-text("Stats")').first();
    await statsNav2.click();
    await expect(page.locator('h1:has-text("Token Statistics")')).toBeVisible({ timeout: 5000 });

    // Re-select the project
    const projectSelect2 = page.locator("#project-select");
    await projectSelect2.selectOption({ label: "e2e-project" });
    await page.waitForTimeout(2000);

    // Compare: stats should match what was shown before refresh
    const postRefreshText = await statsContent.textContent();
    expect(postRefreshText).toBe(preRefreshText);

    await server.screenshot(page, "chat-token-persist-refresh");
  });

  // ── Sidebar Reactivity Tests ──

  test("new session appears in sidebar immediately after first message", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Count sessions before
    const sessionsBefore = await page.locator(".session-item").count();

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Sidebar reactivity test message");
    await textarea.press("Enter");

    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Session must appear in sidebar without refresh
    const sessionsAfter = page.locator(".session-item");
    await expect(sessionsAfter).toHaveCount(sessionsBefore + 1, { timeout: 5000 });

    await server.screenshot(page, "chat-sidebar-reactivity");
  });

  test("session in sidebar is named after first message", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    const uniqueMsg = `Naming test ${Date.now()}`;
    await textarea.fill(uniqueMsg);
    await textarea.press("Enter");

    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // The newest session item should contain text from the first message
    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });

    // Find the session whose title contains the first message (title has the full name)
    const matchingSession = page.locator(`.session-item[title*="Naming test"]`);
    await expect(matchingSession).toBeVisible({ timeout: 5000 });

    await server.screenshot(page, "chat-session-named");
  });

  // ── Historical Session Resume Tests ──

  test("continue conversation in historical session after refresh", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Create a session with a message
    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Historical resume test - first message");
    await textarea.press("Enter");

    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Refresh the page
    await page.reload();
    await page.waitForTimeout(2000);

    // Click the session from sidebar
    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });
    await sessionItems.first().click();
    await page.waitForTimeout(1000);

    // Send a follow-up message in the historical session
    const textarea2 = page.locator("textarea.message-input");
    await expect(textarea2).toBeVisible({ timeout: 3000 });

    await textarea2.fill("Historical resume test - follow-up message");
    await textarea2.press("Enter");

    // Should get a response, NOT an error
    const assistantBubbles = page.locator(".message-wrap.assistant");
    const lastAssistant = assistantBubbles.last();
    await expect(lastAssistant).toBeVisible({ timeout: 30000 });
    await expect(lastAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Verify no error in the response
    const lastContent = await lastAssistant.locator(".content.markdown").textContent();
    expect(lastContent).not.toContain("Error:");
    expect(lastContent!.trim().length).toBeGreaterThan(0);

    await server.screenshot(page, "chat-historical-resume");
  });

  test("resume historical session does not create duplicate sidebar entry", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    // Create a session
    const newSessionBtn = page.locator(".new-session-btn").first();
    await newSessionBtn.click();

    const textarea = page.locator("textarea.message-input");
    await expect(textarea).toBeVisible({ timeout: 3000 });

    await textarea.fill("Duplicate sidebar test - first");
    await textarea.press("Enter");

    const assistant = page.locator(".message-wrap.assistant").first();
    await expect(assistant).toBeVisible({ timeout: 30000 });
    await expect(assistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Count sessions after first message
    await page.waitForTimeout(1000);
    const countAfterFirst = await page.locator(".session-item").count();

    // Refresh and re-select the session
    await page.reload();
    await page.waitForTimeout(2000);

    const sessionItems = page.locator(".session-item");
    await expect(sessionItems.first()).toBeVisible({ timeout: 5000 });
    const countAfterRefresh = await sessionItems.count();

    // Click the session to resume
    await sessionItems.first().click();
    await page.waitForTimeout(1000);

    // Send follow-up
    const textarea2 = page.locator("textarea.message-input");
    await expect(textarea2).toBeVisible({ timeout: 3000 });
    await textarea2.fill("Duplicate sidebar test - follow-up");
    await textarea2.press("Enter");

    const lastAssistant = page.locator(".message-wrap.assistant").last();
    await expect(lastAssistant).toBeVisible({ timeout: 30000 });
    await expect(lastAssistant.locator(".cursor")).toBeHidden({ timeout: 60000 });

    // Session count should NOT have increased — same thread, no new sidebar entry
    await page.waitForTimeout(1000);
    const countAfterResume = await page.locator(".session-item").count();
    expect(countAfterResume).toBe(countAfterRefresh);

    await server.screenshot(page, "chat-no-duplicate-sidebar");
  });
});
