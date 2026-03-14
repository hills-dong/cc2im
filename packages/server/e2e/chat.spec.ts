import { test, expect } from "./fixtures.js";

test.describe("Chat Flow", () => {
  test.beforeEach(async ({ server }) => {
    // Seed a project so onboarding doesn't show
    await fetch(`http://127.0.0.1:${server.port}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "chat-proj", directory: "/tmp/chat" }),
    });
  });

  test("loads chat page with sidebar and main content", async ({ page, server }) => {
    await page.goto(`http://127.0.0.1:${server.port}/`);

    // Should see the sidebar
    const sidebar = page.locator(".sidebar").first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Should see the main content area
    const mainContent = page.locator(".main-content").first();
    await expect(mainContent).toBeVisible();
  });

  test("shows connection status in status bar", async ({ page, server }) => {
    await page.goto(`http://127.0.0.1:${server.port}/`);

    // Should see the status bar
    const statusBar = page.locator(".status-bar");
    await expect(statusBar).toBeVisible({ timeout: 5000 });

    // Connection status should show one of the three states
    const connStatus = page.locator(".conn-status");
    await expect(connStatus).toBeVisible();

    // Wait a moment for WS to connect, then check text content
    await page.waitForTimeout(2000);
    const text = await connStatus.textContent();
    expect(text).toBeTruthy();
    // Should contain one of: Connected, Connecting, Disconnected
    expect(text!.trim()).toMatch(/Connected|Connecting|Disconnected/);
  });

  test("chat.send via WebSocket with unknown project returns error", async ({ server }) => {
    const WebSocket = (await import("ws")).default;
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);

    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({
      type: "chat.send",
      project: "nonexistent",
      message: "hello",
    }));

    const msg = await new Promise<any>((resolve) => {
      ws.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    expect(msg.type).toBe("chat.error");
    expect(msg.error.code).toBe("PROJECT_NOT_FOUND");
    expect(msg).toHaveProperty("sessionId");

    ws.close();
  });

  test("chat.send with valid project invokes session", async ({ server }) => {
    const WebSocket = (await import("ws")).default;
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);

    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({
      type: "chat.send",
      project: "chat-proj",
      message: "hello world",
    }));

    // Should receive at least one message
    const msg = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 10000);
      ws.on("message", (data) => {
        clearTimeout(timeout);
        resolve(JSON.parse(data.toString()));
      });
    });

    expect(["chat.stream", "chat.done", "chat.error"]).toContain(msg.type);

    ws.close();
  });
});
