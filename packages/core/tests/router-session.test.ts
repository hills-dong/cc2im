import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Router } from "../src/router.js";
import { Store } from "../src/store.js";
import type { AppConfig } from "../src/types.js";
import { unlinkSync } from "fs";

const dbPath = `/tmp/cc2im-router-session-test-${Date.now()}.db`;

const mockConfig: AppConfig = {
  lark: { appId: "", appSecret: "" },
  discord: { token: "" },
  projects: [
    { name: "test-project", directory: "/tmp/test", platforms: { discord: true } },
  ],
  claude: { command: "echo", defaultArgs: [], bufferInterval: 100, timeout: 5000 },
  formatter: { maxMessageLength: { discord: 2000, lark: 30000, web: 5000 }, maxConcurrentProcesses: 5 },
};

describe("Router.getSessionId", () => {
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

  test("returns null when no session exists for the thread", () => {
    const result = router.getSessionId("nonexistent-thread", "discord");
    expect(result).toBeNull();
  });

  test("returns the session ID after it has been set via the store", () => {
    store.upsertThread("thread-1", "discord", "channel-1", "session-abc", "test-project");

    const result = router.getSessionId("thread-1", "discord");
    expect(result).toBe("session-abc");
  });

  test("returns null for wrong platform even if thread exists on another", () => {
    store.upsertThread("thread-1", "discord", "channel-1", "session-abc", "test-project");

    const result = router.getSessionId("thread-1", "lark");
    expect(result).toBeNull();
  });

  test("returns updated session ID after upsert overwrites it", () => {
    store.upsertThread("thread-1", "discord", "channel-1", "session-old", "test-project");
    expect(router.getSessionId("thread-1", "discord")).toBe("session-old");

    store.upsertThread("thread-1", "discord", "channel-1", "session-new", "test-project");
    expect(router.getSessionId("thread-1", "discord")).toBe("session-new");
  });
});
