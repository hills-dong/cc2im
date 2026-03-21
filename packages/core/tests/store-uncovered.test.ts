import { describe, it, expect, afterEach } from "vitest";
import { Store } from "../src/store.js";
import type { Platform } from "../src/types.js";
import Database from "better-sqlite3";
import * as fs from "node:fs";

function tmpDb(): string {
  return `/tmp/cc2im-store-unc-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
}

const cleanups: string[] = [];

function createStore(dbPath?: string): Store {
  const p = dbPath ?? tmpDb();
  cleanups.push(p);
  return new Store(p);
}

afterEach(() => {
  while (cleanups.length) {
    const f = cleanups.pop()!;
    try { fs.unlinkSync(f); } catch {}
    try { fs.unlinkSync(f + "-wal"); } catch {}
    try { fs.unlinkSync(f + "-shm"); } catch {}
  }
});

// ── constructor ──────────────────────────────────────────────────────

describe("constructor", () => {
  it("1: invalid path throws error", () => {
    expect(() => new Store("/nonexistent/dir/test.db")).toThrow();
  });

  it("2: reopen existing db is idempotent and preserves data", () => {
    const p = tmpDb();
    cleanups.push(p);
    const s1 = new Store(p);
    s1.upsertThread("t1", "discord" as Platform, "ch1", "s1", "proj");
    s1.close();

    const s2 = new Store(p);
    const row = s2.getThread("t1", "discord" as Platform);
    expect(row).not.toBeNull();
    expect(row!.thread_id).toBe("t1");
    s2.close();
  });

});

// ── upsertThread ─────────────────────────────────────────────────────

describe("upsertThread", () => {
  it("4: same thread_id on different platforms creates two rows", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch1", "s1", "proj");
    store.upsertThread("t1", "lark" as Platform, "ch2", "s2", "proj");

    const r1 = store.getThread("t1", "discord" as Platform);
    const r2 = store.getThread("t1", "lark" as Platform);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.platform).toBe("discord");
    expect(r2!.platform).toBe("lark");
    store.close();
  });

  it("5: empty string thread_id can be saved and retrieved", () => {
    const store = createStore();
    store.upsertThread("", "discord" as Platform, "ch", "s", "p");
    const row = store.getThread("", "discord" as Platform);
    expect(row).not.toBeNull();
    expect(row!.thread_id).toBe("");
    store.close();
  });

  it("6: default status is active", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "p");
    const row = store.getThread("t1", "discord" as Platform);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("active");
    store.close();
  });

  it("7: SQL injection string is stored as literal", () => {
    const store = createStore();
    const evil = "'; DROP TABLE threads; --";
    store.upsertThread(evil, "discord" as Platform, "ch", "s", "p");
    const row = store.getThread(evil, "discord" as Platform);
    expect(row).not.toBeNull();
    expect(row!.thread_id).toBe(evil);
    // Verify threads table still works
    store.upsertThread("t2", "discord" as Platform, "ch2", "s2", "p2");
    expect(store.getThread("t2", "discord" as Platform)).not.toBeNull();
    store.close();
  });
});

// ── getThread ────────────────────────────────────────────────────────

describe("getThread", () => {
  it("8: wrong platform returns null", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "p");
    const row = store.getThread("t1", "lark" as Platform);
    expect(row).toBeNull();
    store.close();
  });
});

// ── updateThreadStatus ───────────────────────────────────────────────

describe("updateThreadStatus", () => {
  it("9: change back to active after done", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "p");
    store.updateThreadStatus("t1", "discord" as Platform, "done");
    expect(store.getThread("t1", "discord" as Platform)!.status).toBe("done");
    store.updateThreadStatus("t1", "discord" as Platform, "active");
    expect(store.getThread("t1", "discord" as Platform)!.status).toBe("active");
    store.close();
  });

  it("10: nonexistent thread is a no-op", () => {
    const store = createStore();
    expect(() => store.updateThreadStatus("nope", "discord" as Platform, "done")).not.toThrow();
    store.close();
  });
});

// ── deleteThread ─────────────────────────────────────────────────────

describe("deleteThread", () => {
  it("11: deleting nonexistent thread is a no-op", () => {
    const store = createStore();
    expect(() => store.deleteThread("nope", "discord" as Platform)).not.toThrow();
    store.close();
  });

  it("12: deleting one thread preserves other thread's messages", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "p");
    store.upsertThread("t2", "discord" as Platform, "ch", "s", "p");
    store.saveMessage("m1", "discord" as Platform, "t1", false, "hello");
    store.saveMessage("m2", "discord" as Platform, "t2", false, "world");

    store.deleteThread("t1", "discord" as Platform);

    expect(store.getThread("t1", "discord" as Platform)).toBeNull();
    expect(store.getMessage("m1", "discord" as Platform)).toBeFalsy();
    expect(store.getThread("t2", "discord" as Platform)).not.toBeNull();
    expect(store.getMessage("m2", "discord" as Platform)).not.toBeNull();
    store.close();
  });
});

// ── saveMessage ──────────────────────────────────────────────────────

describe("saveMessage", () => {
  it("13: user message has is_bot === 0", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "p");
    store.saveMessage("m1", "discord" as Platform, "t1", false, "hi");
    const row = store.getMessage("m1", "discord" as Platform);
    expect(row).not.toBeNull();
    expect(row!.is_bot).toBe(0);
    store.close();
  });

  it("14: undefined contentSummary stored as null", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "p");
    store.saveMessage("m1", "discord" as Platform, "t1", false);
    const row = store.getMessage("m1", "discord" as Platform);
    expect(row).not.toBeNull();
    expect(row!.content_summary).toBeNull();
    store.close();
  });

  it("15: same messageId+platform replaces content", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "p");
    store.saveMessage("m1", "discord" as Platform, "t1", false, "first");
    store.saveMessage("m1", "discord" as Platform, "t1", true, "second");
    const row = store.getMessage("m1", "discord" as Platform);
    expect(row).not.toBeNull();
    expect(row!.content_summary).toBe("second");
    expect(row!.is_bot).toBe(1);
    store.close();
  });
});

// ── getMessage ───────────────────────────────────────────────────────

describe("getMessage", () => {
  it("16: nonexistent returns null (not undefined)", () => {
    const store = createStore();
    expect(store.getMessage("nope", "discord" as Platform)).toBeNull();
    store.close();
  });
});

// ── getLastBotMessage ────────────────────────────────────────────────

describe("getLastBotMessage", () => {
  it("17: only user messages returns null (not undefined)", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "p");
    store.saveMessage("m1", "discord" as Platform, "t1", false, "user msg");
    store.saveMessage("m2", "discord" as Platform, "t1", false, "another user");
    const result = store.getLastBotMessage("t1", "discord" as Platform);
    expect(result).toBeNull();
    store.close();
  });
});

// ── markPendingRestart ───────────────────────────────────────────────

describe("markPendingRestart", () => {
  it("18: idempotent - same thread twice no error", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "p");
    store.markPendingRestart("t1", "discord" as Platform);
    expect(() => store.markPendingRestart("t1", "discord" as Platform)).not.toThrow();
    // Should still only produce one entry in getPendingRestarts
    const restarts = store.getPendingRestarts();
    expect(restarts.length).toBe(1);
    store.close();
  });
});

// ── getPendingRestarts ───────────────────────────────────────────────

describe("getPendingRestarts", () => {
  it("19: no marks returns empty array", () => {
    const store = createStore();
    expect(store.getPendingRestarts()).toEqual([]);
    store.close();
  });
});

// ── clearPendingRestarts ─────────────────────────────────────────────

describe("clearPendingRestarts", () => {
  it("20: clearing when already empty is no-op", () => {
    const store = createStore();
    expect(() => store.clearPendingRestarts()).not.toThrow();
    store.close();
  });
});

// ── listSessions ─────────────────────────────────────────────────────

describe("listSessions", () => {
  it("21: no threads returns empty array", () => {
    const store = createStore();
    expect(store.listSessions()).toEqual([]);
    store.close();
  });

  it("22: nonexistent project returns empty array", () => {
    const store = createStore();
    store.upsertThread("t1", "discord" as Platform, "ch", "s", "proj-a");
    expect(store.listSessions("nonexistent")).toEqual([]);
    store.close();
  });
});

// ── getSessionTokens ─────────────────────────────────────────────────

describe("getSessionTokens", () => {
  it("23: does not leak tokens from other threads", () => {
    const store = createStore();
    store.upsertThread("thread-1", "web" as Platform, "ch-1", "sess-1", "p");
    store.upsertThread("thread-2", "web" as Platform, "ch-2", "sess-2", "p");
    store.saveMessage("msg-1", "web" as Platform, "thread-1", true, "r", 100, 200, 300, 400, "m");
    store.saveMessage("msg-2", "web" as Platform, "thread-2", true, "r", 1000, 2000, 3000, 4000, "m");
    const stats = store.getSessionTokens("thread-1");
    expect(stats.inputTokens).toBe(100);
    expect(stats.outputTokens).toBe(200);
    expect(stats.cacheReadTokens).toBe(300);
    expect(stats.cacheCreationTokens).toBe(400);
    store.close();
  });

  it("24: zero token values accepted via saveMessage", () => {
    const store = createStore();
    store.upsertThread("thread-1", "web" as Platform, "ch-1", "sess-1", "p");
    store.saveMessage("msg-1", "web" as Platform, "thread-1", true, "r", 0, 0, 0, 0, "gpt");
    const stats = store.getSessionTokens("thread-1");
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.cacheReadTokens).toBe(0);
    expect(stats.cacheCreationTokens).toBe(0);
    store.close();
  });
});

// ── getProjectTokens ─────────────────────────────────────────────────

describe("getProjectTokens", () => {
  it("26: unknown project returns all zeros", () => {
    const store = createStore();
    const stats = store.getProjectTokens("nonexistent");
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.cacheReadTokens).toBe(0);
    expect(stats.cacheCreationTokens).toBe(0);
    store.close();
  });
});

// ── getDailyTokens ──────────────────────────────────────────────────

describe("getDailyTokens", () => {
  it("27: unknown project returns empty array", () => {
    const store = createStore();
    expect(store.getDailyTokens("nonexistent")).toEqual([]);
    store.close();
  });

  it("28: groups by date and model", () => {
    const store = createStore();
    store.upsertThread("thread-1", "web" as Platform, "ch-1", "sess-1", "proj");
    store.saveMessage("msg-1", "web" as Platform, "thread-1", true, "r", 10, 20, 30, 40, "model-a");
    store.saveMessage("msg-2", "web" as Platform, "thread-1", true, "r", 50, 60, 70, 80, "model-b");
    const daily = store.getDailyTokens("proj");
    expect(daily.length).toBe(2);
    const models = daily.map((d) => d.model).sort();
    expect(models).toEqual(["model-a", "model-b"]);
    store.close();
  });
});

// ── close ────────────────────────────────────────────────────────────

describe("close", () => {
  it("29: subsequent operations throw after close", () => {
    const store = createStore();
    store.close();
    expect(() => store.upsertThread("t1", "discord" as Platform, "ch", "s", "p")).toThrow();
  });

  it("30: double close behavior", () => {
    const store = createStore();
    store.close();
    // better-sqlite3 allows double close (no-op)
    expect(() => store.close()).not.toThrow();
  });
});

// ── lifecycle ────────────────────────────────────────────────────────

describe("lifecycle", () => {
  it("31: construct, use, close, reopen preserves data", () => {
    const p = tmpDb();
    cleanups.push(p);

    const s1 = createStore(p);
    s1.upsertThread("t1", "discord" as Platform, "ch", "sess", "myproj");
    s1.saveMessage("m1", "discord" as Platform, "t1", true, "bot reply", 100, 200, 50, 25, "claude");
    s1.close();

    const s2 = new Store(p);
    expect(s2.getThread("t1", "discord" as Platform)).not.toBeNull();
    expect(s2.getMessage("m1", "discord" as Platform)!.content_summary).toBe("bot reply");
    const tokens = s2.getSessionTokens("t1");
    expect(tokens.inputTokens).toBe(100);
    expect(tokens.outputTokens).toBe(200);
    s2.close();
  });
});
