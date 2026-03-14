import { test as base } from "@playwright/test";
import http from "http";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export interface ServerFixture {
  port: number;
  configPath: string;
  dbPath: string;
}

export const test = base.extend<{ server: ServerFixture }>({
  server: async ({}, use) => {
    const tmpDir = join(tmpdir(), `cc2im-e2e-${Date.now()}`);
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

    // Dynamic import of the compiled server
    const { createServer } = await import("../dist/server.js");
    const server: http.Server = await createServer({
      port: 0,
      bind: "127.0.0.1",
      configPath,
      dbPath,
      skipAuth: true,
    });

    const addr = server.address() as { port: number };

    await use({ port: addr.port, configPath, dbPath });

    // Cleanup
    server.close();
    try { unlinkSync(configPath); } catch {}
    try { unlinkSync(dbPath); } catch {}
    try { unlinkSync(dbPath + "-wal"); } catch {}
    try { unlinkSync(dbPath + "-shm"); } catch {}
  },
});

export { expect } from "@playwright/test";
