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
    http.get(`http://127.0.0.1:${addr.port}${path}`, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body: raw,
          contentType: res.headers["content-type"] ?? "",
        });
      });
    }).on("error", reject);
  });
}

describe("Static File Serving & Path Traversal", () => {
  let server: http.Server;
  let tmpDir: string;
  let staticDir: string;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-static-test-${Date.now()}`);
    staticDir = join(tmpDir, "static");
    mkdirSync(staticDir, { recursive: true });

    // Create test static files
    writeFileSync(join(staticDir, "index.html"), "<html>test</html>");
    writeFileSync(join(staticDir, "app.js"), "console.log('ok')");
    writeFileSync(join(staticDir, "style.css"), "body{}");
    mkdirSync(join(staticDir, "assets"), { recursive: true });
    writeFileSync(join(staticDir, "assets", "logo.svg"), "<svg/>");

    // Create a secret file outside static dir
    writeFileSync(join(tmpDir, "secret.txt"), "TOP_SECRET");

    // Write minimal config
    const configPath = join(tmpDir, "config.yaml");
    const dbPath = join(tmpDir, "test.db");
    writeFileSync(
      configPath,
      `lark:\n  appId: ""\n  appSecret: ""\ndiscord:\n  token: ""\nprojects: []\nclaude:\n  command: "claude"\n  defaultArgs: ["--print"]\n  bufferInterval: 500\n  timeout: 30000\nformatter:\n  maxMessageLength:\n    discord: 2000\n    lark: 30000\n  maxConcurrentProcesses: 3\n`,
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

  afterAll(() => {
    server?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves index.html at /", async () => {
    const res = await rawRequest(server, "/");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("text/html");
    expect(res.body).toContain("<html>test</html>");
  });

  it("serves JS files with correct MIME type", async () => {
    const res = await rawRequest(server, "/app.js");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("application/javascript");
  });

  it("serves CSS files with correct MIME type", async () => {
    const res = await rawRequest(server, "/style.css");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("text/css");
  });

  it("serves files in subdirectories", async () => {
    const res = await rawRequest(server, "/assets/logo.svg");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("image/svg+xml");
  });

  it("does not serve files outside static dir via path traversal", async () => {
    // Node's HTTP module normalizes /../ to / before reaching handler,
    // so the secret file is never accessible. Verify this safety.
    const res = await rawRequest(server, "/../secret.txt");
    // Should NOT contain the secret content regardless of status code
    expect(res.body).not.toContain("TOP_SECRET");
  });

  it("does not serve files via encoded path traversal", async () => {
    const res = await rawRequest(server, "/%2e%2e/secret.txt");
    // Node's http module normalizes %2e%2e to .. before handler
    expect(res.body).not.toContain("TOP_SECRET");
  });

  it("falls back to index.html for unknown paths (SPA)", async () => {
    const res = await rawRequest(server, "/nonexistent/route");
    expect(res.status).toBe(200);
    expect(res.contentType).toContain("text/html");
    expect(res.body).toContain("<html>test</html>");
  });
});
