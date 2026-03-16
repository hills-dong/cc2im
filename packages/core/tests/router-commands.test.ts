import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Router } from "../src/router.js";
import type { AppConfig } from "../src/types.js";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

const dbPath = `/tmp/cc2im-router-cmd-test-${Date.now()}.db`;

const mockConfig: AppConfig = {
  lark: { appId: "", appSecret: "" },
  discord: { token: "" },
  projects: [
    { name: "test-project", directory: "/tmp/test", platforms: { discord: true } },
  ],
  claude: { command: "echo", defaultArgs: [], bufferInterval: 100, timeout: 5000 },
  formatter: { maxMessageLength: { discord: 2000, lark: 30000 }, maxConcurrentProcesses: 5 },
};

describe("Router.parseManagementCommand", () => {
  let store: Store;
  let router: Router;

  beforeEach(() => {
    store = new Store(dbPath);
    router = new Router(mockConfig, store);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("parses /im-done with no args", () => {
    const result = router.parseManagementCommand("/im-done");
    expect(result).not.toBeNull();
    expect(result!.command).toBe("done");
    expect(result!.args).toEqual([]);
  });

  it("parses /im-add-project with args", () => {
    const result = router.parseManagementCommand("/im-add-project myproj /tmp/dir");
    expect(result).not.toBeNull();
    expect(result!.command).toBe("add-project");
    expect(result!.args).toEqual(["myproj", "/tmp/dir"]);
  });

  it("returns null for non-command text", () => {
    const result = router.parseManagementCommand("hello world");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = router.parseManagementCommand("");
    expect(result).toBeNull();
  });

  it("handles extra whitespace between args", () => {
    const result = router.parseManagementCommand("/im-add-project   myproj   /tmp/dir");
    expect(result).not.toBeNull();
    expect(result!.args).toEqual(["myproj", "/tmp/dir"]);
  });

  it("parses /im-list-projects correctly", () => {
    const result = router.parseManagementCommand("/im-list-projects");
    expect(result).not.toBeNull();
    expect(result!.command).toBe("list-projects");
    expect(result!.args).toEqual([]);
  });
});
