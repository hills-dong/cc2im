import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const BASE_CONFIG = `
discord:
  token: "test-token"
lark:
  appId: ""
  appSecret: ""
claude:
  command: "claude"
  defaultArgs: ["--print"]
  bufferInterval: 500
  timeout: 300000
`;

describe("config validation: platforms format", () => {
  let configPath: string;

  beforeEach(() => {
    const tmpDir = join(tmpdir(), `cc2im-val-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
  });

  afterEach(() => {
    try { unlinkSync(configPath); } catch {}
  });

  test("loads platforms as object", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "correct"
    directory: "/tmp/correct"
    platforms:
      discord: true
      lark: true
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.projects[0].platforms).toEqual({ discord: true, lark: true });
  });
});

describe("config validation: formatter", () => {
  let configPath: string;

  beforeEach(() => {
    const tmpDir = join(tmpdir(), `cc2im-val-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
  });

  afterEach(() => {
    try { unlinkSync(configPath); } catch {}
  });

  test("loads nested maxMessageLength", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "proj"
    directory: "/tmp/proj"
    platforms:
      discord: true
formatter:
  maxMessageLength:
    discord: 3000
    lark: 40000
    web: 200000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.formatter.maxMessageLength).toEqual({
      discord: 3000,
      lark: 40000,
      web: 200000,
    });
  });

  test("missing formatter section does not crash", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "proj"
    directory: "/tmp/proj"
    platforms:
      discord: true
`);
    const config = loadConfig(configPath);
    expect(config.formatter).toBeUndefined();
  });
});

describe("config validation: error handling", () => {
  let configPath: string;

  beforeEach(() => {
    const tmpDir = join(tmpdir(), `cc2im-val-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
  });

  afterEach(() => {
    try { unlinkSync(configPath); } catch {}
  });

  test("throws on invalid YAML syntax", () => {
    writeFileSync(configPath, `
discord:
  token: "t"
  bad indentation here
projects: [
`);
    expect(() => loadConfig(configPath)).toThrow();
  });

  test("does not validate missing discord section (known gap)", () => {
    writeFileSync(configPath, `
lark:
  appId: ""
  appSecret: ""
projects: []
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
`);
    const config = loadConfig(configPath);
    expect(config.discord).toBeUndefined();
  });

  test("safely handles missing lark section when LARK env vars are set", () => {
    writeFileSync(configPath, `
discord:
  token: "t"
projects: []
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
`);
    process.env.LARK_APP_ID = "env-id";
    const config = loadConfig(configPath);
    expect(config.lark.appId).toBe("env-id");
    delete process.env.LARK_APP_ID;
  });
});
