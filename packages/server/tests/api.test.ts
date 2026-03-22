import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import http from "http";
import { loadConfig, Store } from "@cc2im/core";
import { createTestApiServer } from "./test-helpers.js";

// Helper to make HTTP requests
function request(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: addr.port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: raw });
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe("HTTP API", () => {
  let server: http.Server;
  let configPath: string;
  let dbPath: string;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-api-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
    dbPath = join(tmpDir, "test.db");

    // Write a minimal test config YAML
    writeFileSync(
      configPath,
      `lark:
  appId: ""
  appSecret: ""
discord:
  token: ""
projects: []
claude:
  command: "claude"
  defaultArgs: ["--print"]
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`,
    );

    const config = loadConfig(configPath);
    const store = new Store(dbPath);
    server = await createTestApiServer({ config, configPath, store });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { unlinkSync(configPath); } catch {}
    try { unlinkSync(dbPath); } catch {}
  });

  it("GET /api/config returns config with claude and projects properties", async () => {
    const { status, data } = await request(server, "GET", "/api/config");
    expect(status).toBe(200);
    expect(data).toHaveProperty("claude");
    expect(data).toHaveProperty("projects");
  });

  it("GET /api/projects returns array", async () => {
    const { status, data } = await request(server, "GET", "/api/projects");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/projects adds a project (201 with name in response)", async () => {
    const { status, data } = await request(server, "POST", "/api/projects", {
      name: "test-project",
      directory: "/tmp/test-project",
    });
    expect(status).toBe(201);
    expect((data as { name: string }).name).toBe("test-project");
  });

  it("GET /api/stats/tokens?project=xxx returns token stats with totalInput=0", async () => {
    const { status, data } = await request(
      server,
      "GET",
      "/api/stats/tokens?project=nonexistent",
    );
    expect(status).toBe(200);
    expect((data as { totalInput: number }).totalInput).toBe(0);
    expect((data as { daily: unknown[] }).daily).toEqual([]);
  });

  it("GET /api/nonexistent returns 404", async () => {
    const { status } = await request(server, "GET", "/api/nonexistent");
    expect(status).toBe(404);
  });

  it("POST /api/projects with empty body returns 400 with error.code VALIDATION_ERROR", async () => {
    const { status, data } = await request(server, "POST", "/api/projects", {});
    expect(status).toBe(400);
    expect((data as { error: { code: string } }).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });
});
