import { test, expect } from "./fixtures.js";

test.describe("Chat Flow", () => {
  test("loads chat page with sidebar and main content", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);
    await server.screenshot(page, "chat-initial-load");

    const sidebar = page.locator(".sidebar").first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    const mainContent = page.locator(".main-content").first();
    await expect(mainContent).toBeVisible();
  });

  test("shows connection status as Connected", async ({ page, server }) => {
    await page.goto(server.baseUrl);
    await page.waitForTimeout(2000);

    const connStatus = page.locator(".conn-status");
    await expect(connStatus).toBeVisible({ timeout: 5000 });
    await expect(connStatus).toContainText("Connected", { timeout: 5000 });

    await server.screenshot(page, "chat-connected-status");
  });

  test("chat.send via WebSocket with unknown project returns error", async ({ server }) => {
    const WebSocket = (await import("ws")).default;
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);

    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({
      type: "chat.send",
      project: "nonexistent-e2e-test",
      message: "hello",
    }));

    const msg = await new Promise<any>((resolve) => {
      ws.on("message", (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.type !== "sync.state") resolve(parsed);
      });
    });

    expect(msg.type).toBe("chat.error");
    expect(msg.error.code).toBe("PROJECT_NOT_FOUND");
    ws.close();
  });
});
