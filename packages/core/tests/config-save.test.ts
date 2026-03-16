import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { saveConfig, addProject, removeProject, loadConfig } from "../src/config.js";
import type { AppConfig, ProjectConfig } from "../src/types.js";
import { mkdirSync, unlinkSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function makeConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    lark: { appId: "lark-id", appSecret: "lark-secret" },
    discord: { token: "discord-token" },
    projects: [],
    claude: { command: "claude", defaultArgs: ["--print"], bufferInterval: 500, timeout: 300000 },
    formatter: { maxMessageLength: { discord: 2000, lark: 30000 }, maxConcurrentProcesses: 5 },
    ...overrides,
  };
}

describe("saveConfig", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cc2im-save-test-${Date.now()}`);
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

  it("writes YAML file that can be reloaded", () => {
    const config = makeConfig({
      projects: [{ name: "myproj", directory: "/tmp/myproj", platforms: { discord: true } }],
    });
    saveConfig(configPath, config);
    const loaded = loadConfig(configPath);
    expect(loaded.projects).toHaveLength(1);
    expect(loaded.projects[0].name).toBe("myproj");
    expect(loaded.discord.token).toBe("discord-token");
  });

  it("masks discord token when env var set", () => {
    process.env.DISCORD_TOKEN = "from-env";
    const config = makeConfig();
    saveConfig(configPath, config);

    // Reload without env var to see the raw saved value
    delete process.env.DISCORD_TOKEN;
    const loaded = loadConfig(configPath);
    expect(loaded.discord.token).toBe("");
  });

  it("masks lark appId when env var set", () => {
    process.env.LARK_APP_ID = "from-env";
    const config = makeConfig();
    saveConfig(configPath, config);

    delete process.env.LARK_APP_ID;
    const loaded = loadConfig(configPath);
    expect(loaded.lark.appId).toBe("");
  });

  it("masks lark appSecret when env var set", () => {
    process.env.LARK_APP_SECRET = "from-env";
    const config = makeConfig();
    saveConfig(configPath, config);

    delete process.env.LARK_APP_SECRET;
    const loaded = loadConfig(configPath);
    expect(loaded.lark.appSecret).toBe("");
  });

  it("does not mutate the original config object", () => {
    process.env.DISCORD_TOKEN = "from-env";
    const config = makeConfig();
    const originalToken = config.discord.token;
    saveConfig(configPath, config);

    // Original config should be untouched
    expect(config.discord.token).toBe(originalToken);
    delete process.env.DISCORD_TOKEN;
  });
});

describe("addProject", () => {
  it("adds new project to empty list", () => {
    const config = makeConfig();
    const project: ProjectConfig = { name: "new-proj", directory: "/tmp/new", platforms: { discord: true } };
    const result = addProject(config, project);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].name).toBe("new-proj");
  });

  it("replaces existing project with same name", () => {
    const config = makeConfig({
      projects: [{ name: "proj-a", directory: "/old/path", platforms: { discord: true } }],
    });
    const updated: ProjectConfig = { name: "proj-a", directory: "/new/path", platforms: { lark: true } };
    const result = addProject(config, updated);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].directory).toBe("/new/path");
    expect(result.projects[0].platforms.lark).toBe(true);
  });

  it("mutates the original config object", () => {
    const config = makeConfig();
    const project: ProjectConfig = { name: "proj", directory: "/tmp/p", platforms: { discord: true } };
    const result = addProject(config, project);
    // addProject mutates in-place and returns the same reference
    expect(result).toBe(config);
    expect(config.projects).toHaveLength(1);
  });

  it("adds multiple distinct projects", () => {
    const config = makeConfig();
    addProject(config, { name: "a", directory: "/tmp/a", platforms: {} });
    addProject(config, { name: "b", directory: "/tmp/b", platforms: {} });
    addProject(config, { name: "c", directory: "/tmp/c", platforms: {} });
    expect(config.projects).toHaveLength(3);
    expect(config.projects.map(p => p.name)).toEqual(["a", "b", "c"]);
  });

  it("handles project with empty name", () => {
    const config = makeConfig();
    addProject(config, { name: "", directory: "/tmp/empty", platforms: {} });
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("");
  });
});

describe("removeProject", () => {
  it("removes by name", () => {
    const config = makeConfig({
      projects: [
        { name: "keep", directory: "/tmp/keep", platforms: {} },
        { name: "remove", directory: "/tmp/remove", platforms: {} },
      ],
    });
    const result = removeProject(config, "remove");
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].name).toBe("keep");
  });

  it("is no-op for non-existent name", () => {
    const config = makeConfig({
      projects: [{ name: "existing", directory: "/tmp/existing", platforms: {} }],
    });
    const result = removeProject(config, "ghost");
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].name).toBe("existing");
  });

  it("mutates the original config object", () => {
    const config = makeConfig({
      projects: [{ name: "target", directory: "/tmp/t", platforms: {} }],
    });
    const result = removeProject(config, "target");
    expect(result).toBe(config);
    expect(config.projects).toHaveLength(0);
  });

  it("removes from empty projects list without error", () => {
    const config = makeConfig();
    const result = removeProject(config, "anything");
    expect(result.projects).toHaveLength(0);
  });
});
