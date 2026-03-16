import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import http from "http";
import { createServer } from "../src/server.js";

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

describe("HTTP API mutations", () => {
  let server: http.Server;
  let configPath: string;
  let dbPath: string;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-api-mut-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
    dbPath = join(tmpDir, "test.db");

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

    server = await createServer({
      port: 0,
      bind: "127.0.0.1",
      configPath,
      dbPath,
      skipAuth: true,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { unlinkSync(configPath); } catch {}
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  });

  // --- PUT /api/config ---

  it("PUT /api/config updates formatter settings", async () => {
    const { status, data } = await request(server, "PUT", "/api/config", {
      formatter: {
        maxMessageLength: { discord: 1500, lark: 25000 },
        maxConcurrentProcesses: 3,
      },
    });
    expect(status).toBe(200);
    const config = data as { formatter: { maxMessageLength: { discord: number }; maxConcurrentProcesses: number } };
    expect(config.formatter.maxMessageLength.discord).toBe(1500);
    expect(config.formatter.maxConcurrentProcesses).toBe(3);
  });

  it("PUT /api/config rejects invalid JSON (400)", async () => {
    const { status, data } = await rawRequest(
      server,
      "PUT",
      "/api/config",
      "{not valid json!!!",
    );
    expect(status).toBe(400);
    expect((data as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
  });

  // --- PUT /api/projects/:name ---

  it("PUT /api/projects/:name updates existing project", async () => {
    // First create a project
    const createRes = await request(server, "POST", "/api/projects", {
      name: "mut-test-project",
      directory: "/tmp/mut-test",
    });
    expect(createRes.status).toBe(201);

    // Now update it
    const { status, data } = await request(
      server,
      "PUT",
      "/api/projects/mut-test-project",
      { directory: "/tmp/mut-test-updated" },
    );
    expect(status).toBe(200);
    expect((data as { name: string; directory: string }).name).toBe("mut-test-project");
    expect((data as { directory: string }).directory).toBe("/tmp/mut-test-updated");
  });

  it("PUT /api/projects/:name returns 404 for non-existent project", async () => {
    const { status, data } = await request(
      server,
      "PUT",
      "/api/projects/does-not-exist",
      { directory: "/tmp/nope" },
    );
    expect(status).toBe(404);
    expect((data as { error: { code: string } }).error.code).toBe("NOT_FOUND");
  });

  // --- DELETE /api/projects/:name ---

  it("DELETE /api/projects/:name removes project (204)", async () => {
    // Create a project to delete
    await request(server, "POST", "/api/projects", {
      name: "delete-me",
      directory: "/tmp/delete-me",
    });

    const { status } = await request(server, "DELETE", "/api/projects/delete-me");
    expect(status).toBe(204);

    // Verify it's gone
    const listRes = await request(server, "GET", "/api/projects");
    const projects = listRes.data as Array<{ name: string }>;
    expect(projects.find((p) => p.name === "delete-me")).toBeUndefined();
  });

  it("DELETE /api/projects/:name on non-existent project returns 204 (idempotent)", async () => {
    const { status } = await request(
      server,
      "DELETE",
      "/api/projects/never-existed",
    );
    expect(status).toBe(204);
  });

  // --- GET /api/sessions ---

  it("GET /api/sessions returns empty array", async () => {
    const { status, data } = await request(server, "GET", "/api/sessions");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBe(0);
  });

  it("GET /api/sessions?project=xxx filters by project", async () => {
    const { status, data } = await request(
      server,
      "GET",
      "/api/sessions?project=nonexistent-proj",
    );
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBe(0);
  });
});
