import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, saveConfig, addProject, removeProject } from "../src/config.js";
import type { AppConfig, ProjectConfig } from "../src/types.js";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function makeConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    lark: { appId: "lark-id", appSecret: "lark-secret" },
    discord: { token: "discord-token" },
    projects: [],
    claude: { command: "claude", defaultArgs: ["--print"], bufferInterval: 500, timeout: 300000 },
    formatter: { maxMessageLength: { discord: 2000, lark: 30000, web: 100000 }, maxConcurrentProcesses: 5 },
    ...overrides,
  };
}

function writeYaml(path: string, content: string): void {
  writeFileSync(path, content, "utf-8");
}

const VALID_YAML_BASE = `
discord:
  token: "test-token"
lark:
  appId: "lark-id"
  appSecret: "lark-secret"
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
    web: 100000
  maxConcurrentProcesses: 5
`;

describe("loadConfig - uncovered cases", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cc2im-uncov-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
    delete process.env.DISCORD_TOKEN;
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
    delete process.env.DISCORD_TOKEN;
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
  });

  // 1. Empty YAML file
  it("throws descriptive error when YAML file is empty", () => {
    writeYaml(configPath, "");
    expect(() => loadConfig(configPath)).toThrow(/empty|invalid/i);
  });

  // 2. YAML with only comments
  it("throws descriptive error when YAML contains only comments", () => {
    writeYaml(configPath, "# comment only\n");
    expect(() => loadConfig(configPath)).toThrow(/empty|invalid/i);
  });

  // 3. Large projects array
  it("loads 1000+ projects without truncation", () => {
    const projects = Array.from({ length: 1000 }, (_, i) => `
  - name: "proj-${i}"
    directory: "/tmp/proj-${i}"
    platforms:
      discord: true`).join("");
    writeYaml(configPath, `
discord:
  token: "t"
lark:
  appId: "id"
  appSecret: "secret"
projects:
${projects}
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.projects).toHaveLength(1000);
    expect(config.projects[999].name).toBe("proj-999");
  });

  // 4. platforms with unknown platform name preserved
  it("preserves unknown platform names in platforms object", () => {
    writeYaml(configPath, `
discord:
  token: "t"
lark:
  appId: "id"
  appSecret: "secret"
projects:
  - name: "proj"
    directory: "/tmp/proj"
    platforms:
      slack: true
      discord: true
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect((config.projects[0].platforms as any).slack).toBe(true);
    expect((config.projects[0].platforms as any).discord).toBe(true);
  });

  // 5. Empty string env var is falsy, doesn't override
  it("does not override config value when env var is empty string", () => {
    writeYaml(configPath, VALID_YAML_BASE);
    process.env.DISCORD_TOKEN = "";
    const config = loadConfig(configPath);
    expect(config.discord.token).toBe("test-token");
  });

  // 6. YAML with unknown top-level field
  it("preserves unknown top-level fields from YAML", () => {
    writeYaml(configPath, `
discord:
  token: "t"
lark:
  appId: "id"
  appSecret: "secret"
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
    web: 100000
  maxConcurrentProcesses: 5
customField: "custom-value"
`);
    const config = loadConfig(configPath);
    expect((config as any).customField).toBe("custom-value");
  });

  // 7. Duplicate project names both preserved
  it("preserves duplicate project names (no dedup)", () => {
    writeYaml(configPath, `
discord:
  token: "t"
lark:
  appId: "id"
  appSecret: "secret"
projects:
  - name: "dup"
    directory: "/tmp/a"
    platforms:
      discord: true
  - name: "dup"
    directory: "/tmp/b"
    platforms:
      lark: true
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.projects).toHaveLength(2);
    expect(config.projects[0].name).toBe("dup");
    expect(config.projects[1].name).toBe("dup");
    expect(config.projects[0].directory).toBe("/tmp/a");
    expect(config.projects[1].directory).toBe("/tmp/b");
  });

  // 8. Return value is a mutable reference
  it("returns a mutable reference (no defensive copy)", () => {
    writeYaml(configPath, VALID_YAML_BASE);
    const config = loadConfig(configPath);
    config.discord.token = "mutated";
    expect(config.discord.token).toBe("mutated");
  });

  // 9. Loading same file twice gives deep-equal but different references
  it("loading same file twice yields deep-equal but distinct objects", () => {
    writeYaml(configPath, VALID_YAML_BASE);
    const config1 = loadConfig(configPath);
    const config2 = loadConfig(configPath);
    expect(config1).toEqual(config2);
    expect(config1).not.toBe(config2);
  });

  // 10. Missing discord section + DISCORD_TOKEN env → safely applies env override
  it("safely handles missing discord section when DISCORD_TOKEN env is set", () => {
    writeYaml(configPath, `
lark:
  appId: "id"
  appSecret: "secret"
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
    web: 100000
  maxConcurrentProcesses: 5
`);
    process.env.DISCORD_TOKEN = "env-token";
    const config = loadConfig(configPath);
    expect(config.discord.token).toBe("env-token");
  });

  // 11. Nested maxMessageLength loaded correctly
  it("loads nested maxMessageLength values", () => {
    writeYaml(configPath, `
discord:
  token: "t"
lark:
  appId: "id"
  appSecret: "secret"
projects: []
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 5000
    lark: 60000
    web: 200000
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.formatter.maxMessageLength.discord).toBe(5000);
    expect(config.formatter.maxMessageLength.lark).toBe(60000);
    expect(config.formatter.maxMessageLength.web).toBe(200000);
  });

  // 12. Negative maxMessageLength preserved without validation
  it("preserves negative maxMessageLength values without validation", () => {
    writeYaml(configPath, `
discord:
  token: "t"
lark:
  appId: "id"
  appSecret: "secret"
projects: []
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: -1
    lark: -100
    web: 0
  maxConcurrentProcesses: 5
`);
    const config = loadConfig(configPath);
    expect(config.formatter.maxMessageLength.discord).toBe(-1);
    expect(config.formatter.maxMessageLength.lark).toBe(-100);
    expect(config.formatter.maxMessageLength.web).toBe(0);
  });
});

describe("saveConfig - uncovered cases", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cc2im-save-uncov-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
    delete process.env.DISCORD_TOKEN;
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
    delete process.env.DISCORD_TOKEN;
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
  });

  // 13. No env vars → original tokens preserved in saved file
  it("preserves original tokens when no env vars are set", () => {
    const config = makeConfig();
    saveConfig(configPath, config);
    const loaded = loadConfig(configPath);
    expect(loaded.discord.token).toBe("discord-token");
    expect(loaded.lark.appId).toBe("lark-id");
    expect(loaded.lark.appSecret).toBe("lark-secret");
  });

  // 14. Target directory does not exist → ENOENT
  it("throws ENOENT when target directory does not exist", () => {
    const config = makeConfig();
    expect(() => saveConfig("/nonexistent/dir/config.yaml", config)).toThrow();
  });

  // 15. Overwriting existing file
  it("overwrites existing file with latest config", () => {
    const config1 = makeConfig({ discord: { token: "token-1" } });
    saveConfig(configPath, config1);

    const config2 = makeConfig({ discord: { token: "token-2" } });
    saveConfig(configPath, config2);

    const loaded = loadConfig(configPath);
    expect(loaded.discord.token).toBe("token-2");
  });

  // 16. Values with special YAML characters
  it("round-trips values containing special YAML characters", () => {
    const config = makeConfig({
      discord: { token: 'tok:en "with\' special\nchars & more: {yes}' },
    });
    saveConfig(configPath, config);
    const loaded = loadConfig(configPath);
    expect(loaded.discord.token).toBe('tok:en "with\' special\nchars & more: {yes}');
  });

  // 17. Empty projects list saves and reloads
  it("saves and reloads empty projects list", () => {
    const config = makeConfig({ projects: [] });
    saveConfig(configPath, config);
    const loaded = loadConfig(configPath);
    expect(loaded.projects).toEqual([]);
  });
});

describe("addProject - uncovered cases", () => {
  // 18. Replace preserves array position
  it("replaces project at correct index, preserving other positions", () => {
    const config = makeConfig({
      projects: [
        { name: "a", directory: "/tmp/a", platforms: { discord: true } },
        { name: "b", directory: "/tmp/b", platforms: { lark: true } },
        { name: "c", directory: "/tmp/c", platforms: { web: true } },
      ],
    });
    const updated: ProjectConfig = { name: "b", directory: "/tmp/b-new", platforms: { discord: true } };
    addProject(config, updated);
    expect(config.projects).toHaveLength(3);
    expect(config.projects[0].name).toBe("a");
    expect(config.projects[1].name).toBe("b");
    expect(config.projects[1].directory).toBe("/tmp/b-new");
    expect(config.projects[2].name).toBe("c");
  });

  // 19. Adding same project twice is idempotent
  it("adding same project twice keeps length at 1", () => {
    const config = makeConfig();
    const project: ProjectConfig = { name: "p", directory: "/tmp/p", platforms: { discord: true } };
    addProject(config, project);
    addProject(config, { ...project });
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].directory).toBe("/tmp/p");
  });

  // 20. Add → replace → add different
  it("add, replace, then add different project", () => {
    const config = makeConfig();
    addProject(config, { name: "a", directory: "/tmp/a", platforms: {} });
    addProject(config, { name: "a", directory: "/tmp/a-updated", platforms: { discord: true } });
    addProject(config, { name: "b", directory: "/tmp/b", platforms: {} });
    expect(config.projects).toHaveLength(2);
    expect(config.projects[0].name).toBe("a");
    expect(config.projects[0].directory).toBe("/tmp/a-updated");
    expect(config.projects[1].name).toBe("b");
  });

  // 21. Added project is a shallow reference
  it("added project shares reference (shallow copy)", () => {
    const config = makeConfig();
    const project: ProjectConfig = { name: "ref", directory: "/tmp/ref", platforms: {} };
    addProject(config, project);
    // Mutating the original object affects the config
    project.directory = "/tmp/mutated";
    expect(config.projects[0].directory).toBe("/tmp/mutated");
  });
});

describe("removeProject - uncovered cases", () => {
  // 22. Multiple same-name projects all removed
  it("removes all projects with duplicate name (filter semantics)", () => {
    const config = makeConfig({ projects: [] });
    config.projects.push(
      { name: "dup", directory: "/tmp/a", platforms: {} },
      { name: "dup", directory: "/tmp/b", platforms: {} },
      { name: "keep", directory: "/tmp/c", platforms: {} },
    );
    removeProject(config, "dup");
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("keep");
  });

  // 23. Remove project with empty name
  it("removes project with empty string name", () => {
    const config = makeConfig({
      projects: [{ name: "", directory: "/tmp/empty", platforms: {} }],
    });
    removeProject(config, "");
    expect(config.projects).toHaveLength(0);
  });

  // 24. Remove same name twice is idempotent
  it("removing same name twice is idempotent (second is no-op)", () => {
    const config = makeConfig({
      projects: [
        { name: "x", directory: "/tmp/x", platforms: {} },
        { name: "y", directory: "/tmp/y", platforms: {} },
      ],
    });
    removeProject(config, "x");
    expect(config.projects).toHaveLength(1);
    removeProject(config, "x");
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("y");
  });
});

describe("cross-function - uncovered cases", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cc2im-cross-uncov-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
    delete process.env.DISCORD_TOKEN;
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
  });

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
    delete process.env.DISCORD_TOKEN;
    delete process.env.LARK_APP_ID;
    delete process.env.LARK_APP_SECRET;
  });

  // 25. Add then remove restores original state
  it("add then remove restores original project count", () => {
    const config = makeConfig({
      projects: [{ name: "existing", directory: "/tmp/e", platforms: {} }],
    });
    const initialLength = config.projects.length;
    addProject(config, { name: "temp", directory: "/tmp/temp", platforms: {} });
    expect(config.projects).toHaveLength(initialLength + 1);
    removeProject(config, "temp");
    expect(config.projects).toHaveLength(initialLength);
    expect(config.projects[0].name).toBe("existing");
  });

  // 26. Add → save → load round-trip
  it("add, save, load round-trip preserves data", () => {
    const config = makeConfig();
    addProject(config, {
      name: "roundtrip",
      directory: "/tmp/rt",
      model: "claude-opus-4-6",
      platforms: { discord: true, lark: true },
    });
    saveConfig(configPath, config);
    const loaded = loadConfig(configPath);
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].name).toBe("roundtrip");
    expect(loaded.projects[0].directory).toBe("/tmp/rt");
    expect(loaded.projects[0].model).toBe("claude-opus-4-6");
    expect(loaded.projects[0].platforms.discord).toBe(true);
    expect(loaded.projects[0].platforms.lark).toBe(true);
  });
});
