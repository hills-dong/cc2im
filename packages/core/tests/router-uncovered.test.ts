import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Router } from "../src/router.js";
import type { AppConfig } from "../src/types.js";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

const dbPath = `/tmp/cc2im-router-uncovered-test-${Date.now()}.db`;

function createMockConfig(): AppConfig {
  return {
    lark: { appId: "", appSecret: "" },
    discord: { token: "" },
    projects: [
      { name: "test-project", directory: "/tmp/test", platforms: { discord: true } },
      { name: "proj-a", directory: "/tmp/a", platforms: { discord: true, lark: true } },
      { name: "proj-b", directory: "/tmp/b", platforms: { discord: true } },
    ],
    claude: { command: "echo", defaultArgs: [], bufferInterval: 100, timeout: 5000 },
    formatter: { maxMessageLength: { discord: 2000, lark: 30000 }, maxConcurrentProcesses: 5 },
  };
}

describe("Router - uncovered cases", () => {
  let store: Store;
  let mockConfig: AppConfig;

  beforeEach(() => {
    store = new Store(dbPath);
    mockConfig = createMockConfig();
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  // --- registerChannel ---

  // 1. same channelId on different platforms are independent
  it("same channelId on different platforms maps independently", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("ch-1", "discord", "proj-a");
    router.registerChannel("ch-1", "lark", "proj-b");
    expect(router.getProject("ch-1", "discord")!.name).toBe("proj-a");
    expect(router.getProject("ch-1", "lark")!.name).toBe("proj-b");
  });

  // 2. overwrite existing registration
  it("overwrites existing registration for same platform+channel", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("ch-1", "discord", "proj-a");
    router.registerChannel("ch-1", "discord", "proj-b");
    expect(router.getProject("ch-1", "discord")!.name).toBe("proj-b");
  });

  // 3. empty channelId
  it("handles empty channelId", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("", "discord", "proj-a");
    const project = router.getProject("", "discord");
    expect(project).not.toBeNull();
    expect(project!.name).toBe("proj-a");
  });

  // 4. empty projectName - mapping exists but no matching project in config
  it("returns null when projectName is empty (no matching project)", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("ch-1", "discord", "");
    expect(router.getProject("ch-1", "discord")).toBeNull();
  });

  // 5. channelId containing colons
  it("handles channelId containing colons", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("a:b:c", "discord", "proj-a");
    expect(router.getProject("a:b:c", "discord")!.name).toBe("proj-a");
  });

  // --- getProject ---

  // 6. mapping exists but project name not in config
  it("returns null when mapped project name does not exist in config", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("ch-1", "discord", "nonexistent-project");
    expect(router.getProject("ch-1", "discord")).toBeNull();
  });

  // 7. wrong platform returns null
  it("returns null when querying wrong platform", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("ch-1", "discord", "proj-a");
    expect(router.getProject("ch-1", "lark")).toBeNull();
  });

  // 8. returns reference to config project (not a copy)
  it("returns a reference to the config project object", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("ch-1", "discord", "proj-a");
    const project = router.getProject("ch-1", "discord");
    expect(project).not.toBeNull();
    project!.directory = "/modified";
    // Re-fetch should see the modification since it's the same object reference
    const project2 = router.getProject("ch-1", "discord");
    expect(project2!.directory).toBe("/modified");
  });

  // 9. config.projects modified externally after construction
  it("reflects external modifications to config.projects", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("ch-1", "discord", "new-project");
    // Initially no such project
    expect(router.getProject("ch-1", "discord")).toBeNull();
    // Add it externally
    mockConfig.projects.push({ name: "new-project", directory: "/tmp/new", platforms: { discord: true } });
    expect(router.getProject("ch-1", "discord")!.name).toBe("new-project");
  });

  // --- getSessionId ---

  // 10. empty threadId returns null
  it("returns null for empty threadId", () => {
    const router = new Router(mockConfig, store);
    expect(router.getSessionId("", "discord")).toBeNull();
  });

  // 11. store.getThread throws -> error propagates
  it("propagates error when store.getThread throws", () => {
    const router = new Router(mockConfig, store);
    vi.spyOn(store, "getThread").mockImplementation(() => {
      throw new Error("db error");
    });
    expect(() => router.getSessionId("thread-1", "discord")).toThrow("db error");
    vi.restoreAllMocks();
  });

  // --- isManagementCommand ---

  // 12. /im-done
  it("recognizes /im-done as management command", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("/im-done")).toBe(true);
  });

  // 13. /im-remove-project
  it("recognizes /im-remove-project as management command", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("/im-remove-project foo")).toBe(true);
  });

  // 14. /im-reload-config
  it("recognizes /im-reload-config as management command", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("/im-reload-config")).toBe(true);
  });

  // 15. /im-reopen
  it("recognizes /im-reopen as management command", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("/im-reopen")).toBe(true);
  });

  // 16. empty string returns false
  it("returns false for empty string", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("")).toBe(false);
  });

  // 17. /im-unknown returns false (not in regex)
  it("returns false for /im-unknown (not in allowed list)", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("/im-unknown")).toBe(false);
  });

  // 18. command in middle of string returns false
  it("returns false when command is not at start of string", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("hello /im-done")).toBe(false);
  });

  // 19. input with newline
  it("returns true when command is at start followed by newline", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("/im-done\nsome text")).toBe(true);
  });

  // --- parseManagementCommand ---

  // 20. parses non-standard /im-xxx command (parse is more lenient than is)
  it("parses non-standard /im-xxx commands", () => {
    const router = new Router(mockConfig, store);
    const result = router.parseManagementCommand("/im-foobar arg1 arg2");
    expect(result).toEqual({ command: "foobar", args: ["arg1", "arg2"] });
  });

  // 21. trailing whitespace handling
  it("handles trailing whitespace with no args", () => {
    const router = new Router(mockConfig, store);
    const result = router.parseManagementCommand("/im-done   ");
    expect(result).toEqual({ command: "done", args: [] });
  });

  // 22. consistency between isManagementCommand and parseManagementCommand
  it("isManagementCommand returns true iff parseManagementCommand is non-null for valid commands", () => {
    const router = new Router(mockConfig, store);
    const validCommands = [
      "/im-add-project foo /tmp",
      "/im-remove-project foo",
      "/im-list-projects",
      "/im-reload-config",
      "/im-done",
      "/im-reopen",
    ];
    for (const cmd of validCommands) {
      expect(router.isManagementCommand(cmd)).toBe(true);
      expect(router.parseManagementCommand(cmd)).not.toBeNull();
    }
    // /im-unknown: parse returns non-null but isManagementCommand returns false
    // This shows parse is more lenient
    expect(router.isManagementCommand("/im-unknown")).toBe(false);
    expect(router.parseManagementCommand("/im-unknown")).not.toBeNull();
  });

  // --- Cross-function ---

  // 23. register -> get -> re-register override -> get
  it("register, query, re-register override, final getProject returns new project", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("ch-1", "discord", "proj-a");
    expect(router.getProject("ch-1", "discord")!.name).toBe("proj-a");
    router.registerChannel("ch-1", "discord", "proj-b");
    expect(router.getProject("ch-1", "discord")!.name).toBe("proj-b");
  });

  // 24. constructor holds config reference (no defensive copy)
  it("constructor holds config reference - external mutation visible", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("ch-1", "discord", "test-project");
    expect(router.getProject("ch-1", "discord")!.directory).toBe("/tmp/test");
    // Mutate config externally
    mockConfig.projects[0].directory = "/changed";
    expect(router.getProject("ch-1", "discord")!.directory).toBe("/changed");
  });
});
