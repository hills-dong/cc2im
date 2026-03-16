import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import http from "http";
import { createServer } from "../src/server.js";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("WebSocket message handling", () => {
  let server: http.Server;
  let port: number;
  let tmpDir: string;
  let configPath: string;
  let dbPath: string;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-ws-msg-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "ws-msg-config.yaml");
    dbPath = join(tmpDir, "ws-msg.db");

    writeFileSync(
      configPath,
      `lark:
  appId: ""
  appSecret: ""
discord:
  token: ""
projects:
  - name: test-proj
    directory: /tmp
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
    try { unlinkSync(configPath); } catch {}
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      ws.on("open", () => resolve(ws));
    });
  }

  function nextMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve) => {
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
    });
  }

  it("returns error for invalid JSON message", async () => {
    const ws = await connect();
    ws.send("this is not json{{{");
    const msg = await nextMessage(ws);
    expect(msg.type).toBe("error");
    expect(msg.error.code).toBe("INVALID_JSON");
    ws.close();
  });

  it("returns error for unknown message type", async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ type: "totally.unknown" }));
    const msg = await nextMessage(ws);
    expect(msg.type).toBe("error");
    expect(msg.error.code).toBe("UNKNOWN_TYPE");
    expect(msg.error.message).toContain("totally.unknown");
    ws.close();
  });

  it("chat.abort with valid sessionId does not crash", async () => {
    const ws = await connect();
    // Send abort for a non-existent session - should not error or crash
    ws.send(JSON.stringify({ type: "chat.abort", sessionId: "fake-session-id" }));

    // Verify the connection is still alive by sending sync.state
    ws.send(JSON.stringify({ type: "sync.state" }));
    const msg = await nextMessage(ws);
    expect(msg.type).toBe("sync.state");
    ws.close();
  });

  it("multiple clients receive broadcast messages from chat.send", async () => {
    const ws1 = await connect();
    const ws2 = await connect();

    // Collect all messages on ws2
    const ws2Messages: any[] = [];
    const gotBroadcast = new Promise<void>((resolve) => {
      ws2.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        ws2Messages.push(msg);
        // chat.done or chat.error means the session finished
        if (msg.type === "chat.done" || msg.type === "chat.error") {
          resolve();
        }
      });
    });

    // Send chat.send from ws1 to test-proj (echo command will exit quickly)
    ws1.send(
      JSON.stringify({
        type: "chat.send",
        project: "test-proj",
        message: "hello",
      }),
    );

    // Wait for completion broadcast (with timeout)
    await Promise.race([
      gotBroadcast,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout waiting for broadcast")), 10000),
      ),
    ]);

    // ws2 should have received at least a chat.done or chat.error
    const terminalMsg = ws2Messages.find(
      (m) => m.type === "chat.done" || m.type === "chat.error",
    );
    expect(terminalMsg).toBeDefined();
    expect(terminalMsg.sessionId).toBeDefined();

    ws1.close();
    ws2.close();
  });
});
