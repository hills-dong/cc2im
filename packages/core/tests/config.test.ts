import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ConfigManager", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cc2im-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
  });

  afterEach(() => {
    try { unlinkSync(configPath); } catch {}
  });

  it("loads a valid config file", () => {
    writeFileSync(configPath, `
discord:
  token: "test-token"
lark:
  appId: ""
  appSecret: ""
projects:
  - name: "test"
    directory: "/tmp/test"
    platforms:
      discord: true
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
`);
    const config = loadConfig(configPath);
    expect(config.discord.token).toBe("test-token");
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("test");
  });

  it("env vars override config file values", () => {
    writeFileSync(configPath, `
discord:
  token: "file-token"
lark:
  appId: ""
  appSecret: ""
projects: []
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`);
    process.env.DISCORD_TOKEN = "env-token";
    const config = loadConfig(configPath);
    expect(config.discord.token).toBe("env-token");
    delete process.env.DISCORD_TOKEN;
  });

  it("throws on missing config file", () => {
    expect(() => loadConfig("/nonexistent/config.yaml")).toThrow();
  });

  it("env var overrides lark appId", () => {
    writeFileSync(configPath, `
discord:
  token: "t"
lark:
  appId: "file-id"
  appSecret: "file-secret"
projects: []
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`);
    process.env.LARK_APP_ID = "env-id";
    const config = loadConfig(configPath);
    expect(config.lark.appId).toBe("env-id");
    expect(config.lark.appSecret).toBe("file-secret");
    delete process.env.LARK_APP_ID;
  });

  it("env var overrides lark appSecret", () => {
    writeFileSync(configPath, `
discord:
  token: "t"
lark:
  appId: "file-id"
  appSecret: "file-secret"
projects: []
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`);
    process.env.LARK_APP_SECRET = "env-secret";
    const config = loadConfig(configPath);
    expect(config.lark.appSecret).toBe("env-secret");
    expect(config.lark.appId).toBe("file-id");
    delete process.env.LARK_APP_SECRET;
  });

  it("all three env vars override simultaneously", () => {
    writeFileSync(configPath, `
discord:
  token: "file-token"
lark:
  appId: "file-id"
  appSecret: "file-secret"
projects: []
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`);
    process.env.DISCORD_TOKEN = "env-token";
    process.env.LARK_APP_ID = "env-id";
    process.env.LARK_APP_SECRET = "env-secret";
    const config = loadConfig(configPath);
    expect(config.discord.token).toBe("env-token");
    expect(config.lark.appId).toBe("env-id");
    expect(config.lark.appSecret).toBe("env-secret");
    delete process.env.DISCORD_TOKEN;
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
  });

  it("loads project with optional model field", () => {
    writeFileSync(configPath, `
discord:
  token: "test-token"
lark:
  appId: ""
  appSecret: ""
projects:
  - name: "test"
    directory: "/tmp/test"
    model: "claude-opus-4-6"
    platforms:
      discord: true
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
`);
    const config = loadConfig(configPath);
    expect(config.projects[0].model).toBe("claude-opus-4-6");
  });

  it("project without model field has undefined model", () => {
    writeFileSync(configPath, `
discord:
  token: "test-token"
lark:
  appId: ""
  appSecret: ""
projects:
  - name: "test"
    directory: "/tmp/test"
    platforms:
      discord: true
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
`);
    const config = loadConfig(configPath);
    expect(config.projects[0].model).toBeUndefined();
  });
});
