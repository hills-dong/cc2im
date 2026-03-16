import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import http from "http";
import { createServer } from "../src/server.js";

function rawRequest(
  server: http.Server,
  path: string,
): Promise<{ status: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    http
      .get(`http://127.0.0.1:${addr.port}${path}`, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: raw,
            contentType: res.headers["content-type"] ?? "",
          });
        });
      })
      .on("error", reject);
  });
}

describe("server edge cases — no staticDir", () => {
  let server: http.Server;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-server-edge-test-${Date.now()}`);
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

    // Set staticDir to a non-existent path to prevent auto-detection of ui/dist.
    // serveStatic will be called but all reads will fail, resulting in 404.
    const nonExistentStatic = join(tmpDir, "no-such-static-dir");
    server = await createServer({
      port: 0,
      bind: "127.0.0.1",
      configPath,
      dbPath,
      staticDir: nonExistentStatic,
      skipAuth: true,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("non-API request returns 404 when no static dir", async () => {
    const res = await rawRequest(server, "/");
    expect(res.status).toBe(404);
    expect(res.body).toBe("Not found");
  });

  it("non-API path like /foo/bar returns 404 when no static dir", async () => {
    const res = await rawRequest(server, "/foo/bar");
    expect(res.status).toBe(404);
  });
});

describe("server edge cases — static with unknown extension and empty dir", () => {
  let server: http.Server;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-server-edge2-test-${Date.now()}`);
    const staticDir = join(tmpDir, "static");
    mkdirSync(staticDir, { recursive: true });

    // Create a file with an unknown extension
    writeFileSync(join(staticDir, "data.xyz"), "binary-data-here");
    // Do NOT create index.html — empty dir for SPA fallback test

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

    server = await createServer({
      port: 0,
      bind: "127.0.0.1",
      configPath,
      dbPath,
      staticDir,
      skipAuth: true,
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves file with unknown extension as application/octet-stream", async () => {
    const res = await rawRequest(server, "/data.xyz");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("application/octet-stream");
    expect(res.body).toBe("binary-data-here");
  });

  it("returns 404 for SPA fallback when index.html does not exist", async () => {
    const res = await rawRequest(server, "/nonexistent-route");
    expect(res.status).toBe(404);
    expect(res.body).toBe("Not found");
  });

  it("returns 404 for root when index.html does not exist", async () => {
    const res = await rawRequest(server, "/");
    expect(res.status).toBe(404);
    expect(res.body).toBe("Not found");
  });
});
