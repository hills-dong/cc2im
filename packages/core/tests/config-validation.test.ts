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

  test("converts platforms from array to object format", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "myproject"
    directory: "/tmp/proj"
    platforms:
      - discord
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.projects[0].platforms).toEqual({ discord: true });
    expect(Array.isArray(config.projects[0].platforms)).toBe(false);
  });

  test("converts platforms array with multiple entries", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "multi"
    directory: "/tmp/multi"
    platforms:
      - discord
      - lark
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

  test("leaves correctly-formatted platforms object unchanged", () => {
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

  test("handles empty platforms array", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "empty"
    directory: "/tmp/empty"
    platforms: []
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.projects[0].platforms).toEqual({});
    expect(Array.isArray(config.projects[0].platforms)).toBe(false);
  });

  test("fixes platforms independently per project", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "array-proj"
    directory: "/tmp/a"
    platforms:
      - discord
  - name: "object-proj"
    directory: "/tmp/b"
    platforms:
      lark: true
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.projects[0].platforms).toEqual({ discord: true });
    expect(config.projects[1].platforms).toEqual({ lark: true });
  });
});

describe("config validation: formatter flat keys", () => {
  let configPath: string;

  beforeEach(() => {
    const tmpDir = join(tmpdir(), `cc2im-val-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
  });

  afterEach(() => {
    try { unlinkSync(configPath); } catch {}
  });

  test("converts flat formatter keys to nested maxMessageLength", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "proj"
    directory: "/tmp/proj"
    platforms:
      discord: true
formatter:
  maxMessageLengthDiscord: 1800
  maxMessageLengthLark: 25000
  maxMessageLengthWeb: 50000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.formatter.maxMessageLength).toEqual({
      discord: 1800,
      lark: 25000,
      web: 50000,
    });
  });

  test("uses defaults when flat keys are partially missing", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "proj"
    directory: "/tmp/proj"
    platforms:
      discord: true
formatter:
  maxMessageLengthDiscord: 1500
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.formatter.maxMessageLength.discord).toBe(1500);
    expect(config.formatter.maxMessageLength.lark).toBe(30000);
    expect(config.formatter.maxMessageLength.web).toBe(100000);
  });

  test("uses all defaults when no flat keys are present and maxMessageLength is missing", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "proj"
    directory: "/tmp/proj"
    platforms:
      discord: true
formatter:
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.formatter.maxMessageLength).toEqual({
      discord: 2000,
      lark: 30000,
      web: 100000,
    });
  });

  test("leaves correctly-formatted nested maxMessageLength unchanged", () => {
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
    // formatter is undefined, so the validation block is skipped
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

  // BUG: missing discord section causes TypeError at runtime when env var is set,
  // but silently returns broken config when env var is not set
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
    // No validation — returns config with discord=undefined
    const config = loadConfig(configPath);
    expect(config.discord).toBeUndefined();
  });

  // Missing projects causes "undefined is not iterable" in the for-of loop
  test("crashes when projects section is missing", () => {
    writeFileSync(configPath, `
discord:
  token: "t"
lark:
  appId: ""
  appSecret: ""
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
`);
    expect(() => loadConfig(configPath)).toThrow(/is not iterable/);
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

  // BUG: projects as string silently passes — for-of iterates characters without error
  test("does not validate projects type (known gap)", () => {
    writeFileSync(configPath, `
discord:
  token: "t"
lark:
  appId: ""
  appSecret: ""
projects: "not-an-array"
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
`);
    // No validation — silently iterates string characters
    const config = loadConfig(configPath);
    expect(typeof config.projects).toBe("string");
  });
});

describe("config validation: combined fixes", () => {
  let configPath: string;

  beforeEach(() => {
    const tmpDir = join(tmpdir(), `cc2im-val-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
  });

  afterEach(() => {
    try { unlinkSync(configPath); } catch {}
  });

  test("fixes both platforms array and flat formatter keys in one load", () => {
    writeFileSync(configPath, `${BASE_CONFIG}
projects:
  - name: "combo"
    directory: "/tmp/combo"
    platforms:
      - discord
      - lark
formatter:
  maxMessageLengthDiscord: 1900
  maxMessageLengthLark: 28000
  maxMessageLengthWeb: 90000
  maxConcurrentProcesses: 3
`);
    const config = loadConfig(configPath);
    expect(config.projects[0].platforms).toEqual({ discord: true, lark: true });
    expect(config.formatter.maxMessageLength).toEqual({
      discord: 1900,
      lark: 28000,
      web: 90000,
    });
    expect(config.formatter.maxConcurrentProcesses).toBe(3);
  });
});
