import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import http from "http";
import { createServer } from "../src/server.js";
import { writeFileSync, unlinkSync } from "fs";

const TEST_DB = "test-ws.db";
const TEST_CONFIG = "test-ws-config.yaml";

describe("WebSocket API", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    writeFileSync(TEST_CONFIG, `
lark:
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
`);
    server = await createServer({ port: 0, bind: "127.0.0.1", configPath: TEST_CONFIG, dbPath: TEST_DB, skipAuth: true });
    port = (server.address() as any).port;
  });

  afterAll(() => {
    server.close();
    try { unlinkSync(TEST_CONFIG); } catch {}
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + "-wal"); } catch {}
    try { unlinkSync(TEST_DB + "-shm"); } catch {}
  });

  it("connects and receives sync.state response", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({ type: "sync.state" }));

    const msg = await new Promise<any>((resolve) => {
      ws.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    expect(msg.type).toBe("sync.state");
    expect(msg.activeSessions).toEqual([]);
    ws.close();
  });

  it("returns error for unknown project in chat.send", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({ type: "chat.send", project: "nonexistent", message: "hello" }));

    const msg = await new Promise<any>((resolve) => {
      ws.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    expect(msg.type).toBe("chat.error");
    expect(msg.error.code).toBe("PROJECT_NOT_FOUND");
    ws.close();
  });
});
