import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import http from "http";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfig, SessionManager, Store } from "@cc2im/core";
import { attachWebSocket } from "../src/ws.js";
import { signToken } from "../src/auth.js";

/**
 * NOTE: createServer does NOT pass jwtSecret through to attachWebSocket.
 * In server.ts line 103: attachWebSocket(server, { config, store, sessionManager, skipAuth: options.skipAuth })
 * There is no jwtSecret in ServerOptions, so WS auth when skipAuth=false is effectively broken
 * in production unless the caller constructs the server manually.
 *
 * We test the verifyClient logic directly by creating a raw HTTP server
 * and calling attachWebSocket with an explicit jwtSecret.
 */

describe("WebSocket auth (verifyClient)", () => {
  let server: http.Server;
  let port: number;
  let tmpDir: string;
  const jwtSecret = "ws-auth-test-secret";

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-ws-auth-test-${Date.now()}`);
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
projects: []
claude:
  command: "echo"
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

    const config = loadConfig(configPath);
    const store = new Store(dbPath);
    const sessionManager = new SessionManager(config.claude, config.formatter);

    server = http.createServer((_req, res) => {
      res.writeHead(404);
      res.end();
    });

    attachWebSocket(server, {
      config,
      store,
      sessionManager,
      skipAuth: false,
      jwtSecret,
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects connection with no token (401)", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    const result = await new Promise<{ event: string; code?: number }>((resolve) => {
      ws.on("open", () => resolve({ event: "open" }));
      ws.on("unexpected-response", (_req, res) => {
        resolve({ event: "rejected", code: res.statusCode });
      });
      ws.on("error", () => {
        // May fire after unexpected-response
      });
    });

    expect(result.event).toBe("rejected");
    expect(result.code).toBe(401);
  });

  it("accepts connection with valid token", async () => {
    const token = signToken(jwtSecret, 3600);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);

    const result = await new Promise<string>((resolve) => {
      ws.on("open", () => resolve("open"));
      ws.on("unexpected-response", () => resolve("rejected"));
      ws.on("error", () => {});
    });

    expect(result).toBe("open");
    ws.close();
  });

  it("rejects connection with expired token (401)", async () => {
    const token = signToken(jwtSecret, -100);
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);

    const result = await new Promise<{ event: string; code?: number }>((resolve) => {
      ws.on("open", () => resolve({ event: "open" }));
      ws.on("unexpected-response", (_req, res) => {
        resolve({ event: "rejected", code: res.statusCode });
      });
      ws.on("error", () => {});
    });

    expect(result.event).toBe("rejected");
    expect(result.code).toBe(401);
  });
});
