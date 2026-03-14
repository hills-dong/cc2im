import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

const TEST_DB = "test-tokens.db";

describe("Store token_usage", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(TEST_DB);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + "-wal"); } catch {}
    try { unlinkSync(TEST_DB + "-shm"); } catch {}
  });

  it("saves and retrieves token usage for a session", () => {
    store.saveTokenUsage("sess-1", "my-project", "claude-opus", 100, 50, 1000, 200);
    store.saveTokenUsage("sess-1", "my-project", "claude-opus", 80, 40, 800, 100);

    const stats = store.getSessionTokens("sess-1");
    expect(stats.inputTokens).toBe(180);
    expect(stats.outputTokens).toBe(90);
    expect(stats.cacheReadTokens).toBe(1800);
    expect(stats.cacheCreationTokens).toBe(300);
  });

  it("aggregates token usage by project", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 0, 0);
    store.saveTokenUsage("sess-2", "proj-a", "opus", 200, 100, 0, 0);
    store.saveTokenUsage("sess-3", "proj-b", "opus", 300, 150, 0, 0);

    const projA = store.getProjectTokens("proj-a");
    expect(projA.inputTokens).toBe(300);
    expect(projA.outputTokens).toBe(150);

    const projB = store.getProjectTokens("proj-b");
    expect(projB.inputTokens).toBe(300);
  });

  it("returns daily token breakdown for a project", () => {
    store.saveTokenUsage("s1", "proj", "opus", 100, 50, 0, 0);
    const daily = store.getDailyTokens("proj");
    expect(daily.length).toBeGreaterThanOrEqual(1);
    expect(daily[0].inputTokens).toBe(100);
    expect(daily[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns zero for unknown session", () => {
    const stats = store.getSessionTokens("nonexistent");
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
  });
});
