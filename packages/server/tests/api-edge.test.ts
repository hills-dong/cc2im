import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import http from "http";
import { loadConfig, Store } from "@cc2im/core";
import { createTestApiServer } from "./test-helpers.js";

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

function rawRequest(
  server: http.Server,
  method: string,
  path: string,
  rawBody: string,
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: addr.port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(rawBody),
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
    req.write(rawBody);
    req.end();
  });
}

describe("API edge cases", () => {
  let server: http.Server;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-api-edge-test-${Date.now()}`);
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
    server = await createTestApiServer({ config, configPath, store });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("POST /api/projects with model field returns model in response", async () => {
    const { status, data } = await request(server, "POST", "/api/projects", {
      name: "model-proj",
      directory: "/tmp/model-proj",
      model: "claude-sonnet-4-20250514",
    });
    expect(status).toBe(201);
    expect((data as { model: string }).model).toBe("claude-sonnet-4-20250514");
  });

  it("POST /api/projects with empty string body (non-JSON) returns 400", async () => {
    const { status, data } = await rawRequest(server, "POST", "/api/projects", "");
    // Empty string body: readBody returns "", then `body ? JSON.parse(body) : {}` → {}
    // Missing name and directory → 400
    expect(status).toBe(400);
    expect((data as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("PUT /api/projects/:name with invalid JSON returns 400", async () => {
    // First create the project
    await request(server, "POST", "/api/projects", {
      name: "json-test",
      directory: "/tmp/json-test",
    });

    const { status, data } = await rawRequest(
      server,
      "PUT",
      "/api/projects/json-test",
      "{not valid",
    );
    expect(status).toBe(400);
    expect((data as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("PUT /api/projects/:name with URL-encoded name", async () => {
    // Create project with space-like name
    await request(server, "POST", "/api/projects", {
      name: "my project",
      directory: "/tmp/my-project",
    });

    const { status, data } = await request(
      server,
      "PUT",
      "/api/projects/my%20project",
      { directory: "/tmp/my-project-updated" },
    );
    expect(status).toBe(200);
    expect((data as { name: string }).name).toBe("my project");
    expect((data as { directory: string }).directory).toBe("/tmp/my-project-updated");
  });

  it("GET /api/stats/tokens?session=xxx returns session stats", async () => {
    const { status, data } = await request(
      server,
      "GET",
      "/api/stats/tokens?session=nonexistent-session",
    );
    expect(status).toBe(200);
    // Should return TokenStats-like object with zeros
    expect(data).toHaveProperty("inputTokens");
    expect((data as { inputTokens: number }).inputTokens).toBe(0);
  });

  it("GET /api/stats/tokens without params returns 400", async () => {
    const { status, data } = await request(server, "GET", "/api/stats/tokens");
    expect(status).toBe(400);
    expect((data as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH /api/config returns 404 (unknown method on known path)", async () => {
    const { status, data } = await request(server, "PATCH", "/api/config", {});
    expect(status).toBe(404);
    expect((data as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });
});
