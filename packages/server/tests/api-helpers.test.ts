import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import http from "http";
import { createServer } from "../src/server.js";

function request(
  server: http.Server,
  method: string,
  path: string,
  body?: string | Buffer,
  headers?: Record<string, string>,
): Promise<{ status: number; data: unknown; raw: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: addr.port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };
    const req = http.request(options, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw), raw });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: null, raw });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

describe("API Helpers", () => {
  let server: http.Server;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = join(tmpdir(), `cc2im-api-helpers-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, "config.yaml");
    const dbPath = join(tmpDir, "test.db");
    writeFileSync(
      configPath,
      `lark:\n  appId: "test-id"\n  appSecret: "secret-value"\ndiscord:\n  token: "test-token-123"\nprojects: []\nclaude:\n  command: "claude"\n  defaultArgs: ["--print"]\n  bufferInterval: 500\n  timeout: 30000\nformatter:\n  maxMessageLength:\n    discord: 2000\n    lark: 30000\n  maxConcurrentProcesses: 3\n`,
    );
    server = await createServer({
      port: 0,
      bind: "127.0.0.1",
      configPath,
      dbPath,
      skipAuth: true,
    });
  });

  afterAll(() => {
    server?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("maskConfig", () => {
    it("masks discord token in GET /api/config", async () => {
      const res = await request(server, "GET", "/api/config");
      expect(res.status).toBe(200);
      const config = res.data as any;
      expect(config.discord.token).toBe("***");
    });

    it("masks lark appSecret in GET /api/config", async () => {
      const res = await request(server, "GET", "/api/config");
      const config = res.data as any;
      expect(config.lark.appSecret).toBe("***");
    });

    it("does not mask lark appId", async () => {
      const res = await request(server, "GET", "/api/config");
      const config = res.data as any;
      // appId should remain visible (it's not a secret)
      expect(config.lark.appId).not.toBe("***");
    });
  });

  describe("readBody size limit", () => {
    it("rejects request body larger than 1MB", async () => {
      // Create a body larger than 1MB
      const largeBody = "x".repeat(1024 * 1024 + 1);
      // Server calls req.destroy() which causes socket hang up on client
      try {
        const res = await request(server, "PUT", "/api/config", largeBody);
        // If we get a response, it should be an error
        expect([400, 500]).toContain(res.status);
      } catch (err: any) {
        // Socket hang up is expected when server destroys the connection
        expect(err.message).toMatch(/socket hang up|ECONNRESET/);
      }
    });

    it("accepts request body under 1MB", async () => {
      const body = JSON.stringify({ projects: [] });
      const res = await request(server, "PUT", "/api/config", body);
      expect(res.status).toBe(200);
    });
  });

  describe("prototype pollution prevention", () => {
    it("ignores __proto__ in config update", async () => {
      const body = JSON.stringify({
        __proto__: { polluted: true },
        constructor: { polluted: true },
      });
      const res = await request(server, "PUT", "/api/config", body);
      expect(res.status).toBe(200);
      // Verify no pollution
      expect(({} as any).polluted).toBeUndefined();
    });
  });

  describe("unknown routes", () => {
    it("returns 404 for unknown API routes", async () => {
      const res = await request(server, "GET", "/api/nonexistent");
      expect(res.status).toBe(404);
      const data = res.data as any;
      expect(data.error.code).toBe("NOT_FOUND");
    });
  });
});
