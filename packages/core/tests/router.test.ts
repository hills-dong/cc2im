import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Router } from "../src/router.js";
import type { AppConfig, IncomingMessage } from "../src/types.js";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

const dbPath = `/tmp/cc2im-router-test-${Date.now()}.db`;

const mockConfig: AppConfig = {
  lark: { appId: "", appSecret: "" },
  discord: { token: "" },
  projects: [
    { name: "test-project", directory: "/tmp/test", platforms: { discord: true } },
  ],
  claude: { command: "echo", defaultArgs: [], bufferInterval: 100, timeout: 5000 },
  formatter: { maxMessageLength: { discord: 2000, lark: 30000 }, maxConcurrentProcesses: 5 },
};

describe("Router", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(dbPath);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("resolves project from channel mapping", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("channel-1", "discord", "test-project");
    const project = router.getProject("channel-1", "discord");
    expect(project).not.toBeNull();
    expect(project!.name).toBe("test-project");
  });

  it("returns null for unknown channel", () => {
    const router = new Router(mockConfig, store);
    const project = router.getProject("unknown", "discord");
    expect(project).toBeNull();
  });

  it("detects management commands", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("/im-list-projects")).toBe(true);
    expect(router.isManagementCommand("/im-add-project foo /tmp")).toBe(true);
    expect(router.isManagementCommand("hello world")).toBe(false);
  });

  it("returns null for getSessionId when no thread exists", () => {
    const router = new Router(mockConfig, store);
    expect(router.getSessionId("unknown-thread", "discord")).toBeNull();
  });

  it("returns session ID for existing thread", () => {
    const router = new Router(mockConfig, store);
    // Insert a thread via the store
    store.upsertThread("thread-1", "discord", "channel-1", "session-abc", "test-project");
    expect(router.getSessionId("thread-1", "discord")).toBe("session-abc");
  });

  it("returns updated session ID after upsert", () => {
    const router = new Router(mockConfig, store);
    store.upsertThread("thread-1", "discord", "channel-1", "session-1", "test-project");
    expect(router.getSessionId("thread-1", "discord")).toBe("session-1");
    // Update session
    store.upsertThread("thread-1", "discord", "channel-1", "session-2", "test-project");
    expect(router.getSessionId("thread-1", "discord")).toBe("session-2");
  });
});
