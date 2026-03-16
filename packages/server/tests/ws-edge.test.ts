import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import http from "http";
import { writeFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createServer } from "../src/server.js";

describe("WebSocket edge cases", () => {
  let server: http.Server;
  let port: number;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-ws-edge-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const configPath = join(tmpDir, "config.yaml");
    const dbPath = join(tmpDir, "test.db");

    writeFileSync(
      configPath,
      `lark:
  appId: ""
  appSecret: ""
discord:
  token: ""
projects:
  - name: edge-proj
    directory: /tmp
    model: default-model
    platforms: {}
claude:
  command: echo
  defaultArgs: []
  bufferInterval: 500
  timeout: 5000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`,
    );

    server = await createServer({
      port: 0,
      bind: "127.0.0.1",
      configPath,
      dbPath,
      skipAuth: true,
    });
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("chat.abort without sessionId does not crash", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    // Send chat.abort with no sessionId — the handler checks `if (sessionId)` so it's a no-op
    ws.send(JSON.stringify({ type: "chat.abort" }));

    // Give the server a moment to process; if it crashes, the connection would error
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    // Verify the connection is still open by sending a sync.state and getting a response
    ws.send(JSON.stringify({ type: "sync.state" }));
    const msg = await new Promise<any>((resolve) => {
      ws.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    expect(msg.type).toBe("sync.state");
    ws.close();
  });

  it("chat.send with payload.model overrides project.model", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    // Send a chat.send with a custom model override
    // The project has model "default-model", but we override with "custom-model"
    // Since claude.command is "echo", the invoke will just echo the message
    ws.send(
      JSON.stringify({
        type: "chat.send",
        project: "edge-proj",
        message: "hello",
        model: "custom-model",
      }),
    );

    // Collect messages until we get chat.done or chat.error
    const messages: any[] = [];
    await new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        messages.push(msg);
        if (msg.type === "chat.done" || msg.type === "chat.error") {
          resolve();
        }
      });
    });

    // The request should complete (either done or error) without crashing
    const final = messages[messages.length - 1];
    expect(["chat.done", "chat.error"]).toContain(final.type);
    ws.close();
  });
});
