import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

const TEST_DB = "test-tokens.db";

describe("Store token stats from messages", () => {
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

  it("saves and retrieves token usage for a session (thread)", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "my-project");
    store.saveMessage("msg-1", "web", "thread-1", true, "response1", 100, 50, 1000, 200, "claude-opus");
    store.saveMessage("msg-2", "web", "thread-1", true, "response2", 80, 40, 800, 100, "claude-opus");

    const stats = store.getSessionTokens("thread-1");
    expect(stats.inputTokens).toBe(180);
    expect(stats.outputTokens).toBe(90);
    expect(stats.cacheReadTokens).toBe(1800);
    expect(stats.cacheCreationTokens).toBe(300);
  });

  it("aggregates token usage by project", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.upsertThread("thread-2", "web", "ch-2", "sess-2", "proj-a");
    store.upsertThread("thread-3", "web", "ch-3", "sess-3", "proj-b");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");
    store.saveMessage("msg-2", "web", "thread-2", true, "r", 200, 100, 0, 0, "opus");
    store.saveMessage("msg-3", "web", "thread-3", true, "r", 300, 150, 0, 0, "opus");

    const projA = store.getProjectTokens("proj-a");
    expect(projA.inputTokens).toBe(300);
    expect(projA.outputTokens).toBe(150);

    const projB = store.getProjectTokens("proj-b");
    expect(projB.inputTokens).toBe(300);
  });

  it("returns daily token breakdown for a project", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");
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

  it("does not count user messages in token aggregations", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.saveMessage("msg-bot", "web", "thread-1", true, "bot reply", 100, 50, 10, 5, "opus");
    store.saveMessage("msg-user", "web", "thread-1", false, "user msg", 999, 999, 999, 999);

    const stats = store.getSessionTokens("thread-1");
    expect(stats.inputTokens).toBe(100);
    expect(stats.outputTokens).toBe(50);
    expect(stats.cacheReadTokens).toBe(10);
    expect(stats.cacheCreationTokens).toBe(5);
  });
});

describe("getOverviewTokens", () => {
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

  it("returns aggregated token records for all threads when since=null", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.upsertThread("thread-2", "web", "ch-2", "sess-2", "proj-b");
    store.saveMessage("msg-1", "web", "thread-1", true, "r1", 100, 50, 10, 5, "opus");
    store.saveMessage("msg-2", "web", "thread-1", true, "r2", 200, 100, 20, 10, "opus");
    store.saveMessage("msg-3", "web", "thread-2", true, "r3", 300, 150, 30, 15, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);

    const projA = rows.find((r: any) => r.projectName === "proj-a");
    const projB = rows.find((r: any) => r.projectName === "proj-b");
    expect(projA!.inputTokens).toBe(300);
    expect(projA!.outputTokens).toBe(150);
    expect(projA!.cacheReadTokens).toBe(30);
    expect(projA!.cacheCreationTokens).toBe(15);
    expect(projB!.inputTokens).toBe(300);
    expect(projB!.outputTokens).toBe(150);
  });

  it("returns only records after the specified since time", () => {
    const db = (store as any).db;
    // Insert threads with explicit created_at
    db.prepare(
      "INSERT INTO threads (thread_id, platform, channel_id, session_id, project_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("thread-old", "web", "ch-1", "sess-old", "proj-a", "2026-03-17T00:00:00");
    db.prepare(
      "INSERT INTO threads (thread_id, platform, channel_id, session_id, project_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("thread-new", "web", "ch-2", "sess-new", "proj-a", "2026-03-18T12:00:00");
    store.saveMessage("msg-old", "web", "thread-old", true, "r", 100, 50, 0, 0, "opus");
    store.saveMessage("msg-new", "web", "thread-new", true, "r", 200, 100, 0, 0, "opus");

    const rows = store.getOverviewTokens("2026-03-18T00:00:00");
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("thread-new");
    expect(rows[0].inputTokens).toBe(200);
  });

  it("correctly aggregates multiple bot messages for the same thread", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.saveMessage("msg-1", "web", "thread-1", true, "r1", 100, 50, 10, 5, "opus");
    store.saveMessage("msg-2", "web", "thread-1", true, "r2", 200, 100, 20, 10, "opus");
    store.saveMessage("msg-3", "web", "thread-1", true, "r3", 300, 150, 30, 15, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].inputTokens).toBe(600);
    expect(rows[0].outputTokens).toBe(300);
    expect(rows[0].cacheReadTokens).toBe(60);
    expect(rows[0].cacheCreationTokens).toBe(30);
  });

  it("groups by project_name so threads from different projects do not mix", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.upsertThread("thread-2", "web", "ch-2", "sess-2", "proj-b");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");
    store.saveMessage("msg-2", "web", "thread-2", true, "r", 200, 100, 0, 0, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    const projectNames = rows.map((r: any) => r.projectName);
    expect(projectNames).toContain("proj-a");
    expect(projectNames).toContain("proj-b");
  });

  it("sorts threads within the same project by total tokens descending", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.upsertThread("thread-2", "web", "ch-2", "sess-2", "proj-a");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");
    store.saveMessage("msg-2", "web", "thread-2", true, "r", 500, 200, 0, 0, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    // thread-2 (700 total) should come before thread-1 (150 total)
    expect(rows[0].sessionId).toBe("thread-2");
    expect(rows[1].sessionId).toBe("thread-1");
  });

  it("sorts different projects by project_name ascending", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "beta");
    store.upsertThread("thread-2", "web", "ch-2", "sess-2", "alpha");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");
    store.saveMessage("msg-2", "web", "thread-2", true, "r", 200, 100, 0, 0, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    expect(rows[0].projectName).toBe("alpha");
    expect(rows[1].projectName).toBe("beta");
  });

  it("returns platform/sessionName/sessionCreatedAt from thread", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a", "my-session");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBe("web");
    expect(rows[0].sessionName).toBe("my-session");
    expect(rows[0].sessionCreatedAt).not.toBeNull();
  });

  it("returns thread with zero tokens when no bot messages exist", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].inputTokens).toBe(0);
    expect(rows[0].outputTokens).toBe(0);
    expect(rows[0].cacheReadTokens).toBe(0);
    expect(rows[0].cacheCreationTokens).toBe(0);
  });

  it("returns separate rows for same thread_id on different platforms", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a", "chat-1");
    store.upsertThread("thread-1", "discord", "ch-2", "sess-1", "proj-a", "chat-2");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 10, 5, "opus");
    store.saveMessage("msg-2", "discord", "thread-1", true, "r", 200, 100, 20, 10, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    // Each row should have its own token counts
    const webRow = rows.find((r: any) => r.platform === "web");
    const discordRow = rows.find((r: any) => r.platform === "discord");
    expect(webRow!.inputTokens).toBe(100);
    expect(discordRow!.inputTokens).toBe(200);
  });

  it("returns an empty array when the database is empty", () => {
    const rows = store.getOverviewTokens(null);
    expect(rows).toEqual([]);
  });

  it("includes records where created_at equals since (>= semantics)", () => {
    const db = (store as any).db;
    db.prepare(
      "INSERT INTO threads (thread_id, platform, channel_id, session_id, project_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("thread-1", "web", "ch-1", "sess-1", "proj-a", "2026-03-18T10:00:00");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");

    const rows = store.getOverviewTokens("2026-03-18T10:00:00");
    expect(rows).toHaveLength(1);
  });

  it("returns an empty array when since is later than all records", () => {
    const db = (store as any).db;
    db.prepare(
      "INSERT INTO threads (thread_id, platform, channel_id, session_id, project_name, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("thread-1", "web", "ch-1", "sess-1", "proj-a", "2026-03-17T00:00:00");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");

    const rows = store.getOverviewTokens("2026-03-19T00:00:00");
    expect(rows).toEqual([]);
  });

  it("returns 0 for all token fields when all values are 0", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 0, 0, 0, 0, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].inputTokens).toBe(0);
    expect(rows[0].outputTokens).toBe(0);
    expect(rows[0].cacheReadTokens).toBe(0);
    expect(rows[0].cacheCreationTokens).toBe(0);
  });

  it("returns objects with all OverviewTokenRow fields", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a", "my-session");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 10, 5, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toHaveProperty("projectName");
    expect(row).toHaveProperty("sessionId");
    expect(row).toHaveProperty("platform");
    expect(row).toHaveProperty("sessionName");
    expect(row).toHaveProperty("sessionCreatedAt");
    expect(row).toHaveProperty("inputTokens");
    expect(row).toHaveProperty("outputTokens");
    expect(row).toHaveProperty("cacheReadTokens");
    expect(row).toHaveProperty("cacheCreationTokens");
  });

  it("returns token fields as numbers not strings", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 10, 5, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].inputTokens).toBe("number");
    expect(typeof rows[0].outputTokens).toBe("number");
    expect(typeof rows[0].cacheReadTokens).toBe("number");
    expect(typeof rows[0].cacheCreationTokens).toBe("number");
  });

  it("correctly aggregates across multiple projects with multiple threads each", () => {
    const projects = ["alpha", "beta", "gamma"];
    let msgId = 0;
    for (const proj of projects) {
      for (let s = 1; s <= 2; s++) {
        store.upsertThread(`${proj}-thread-${s}`, "web", `ch-${proj}-${s}`, `sess-${proj}-${s}`, proj);
        for (let r = 0; r < 3; r++) {
          msgId++;
          store.saveMessage(`msg-${msgId}`, "web", `${proj}-thread-${s}`, true, "r", 10 * s, 5 * s, 1, 1, "opus");
        }
      }
    }

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(6);

    // Verify project ordering (ascending)
    expect(rows[0].projectName).toBe("alpha");
    expect(rows[1].projectName).toBe("alpha");
    expect(rows[2].projectName).toBe("beta");
    expect(rows[3].projectName).toBe("beta");
    expect(rows[4].projectName).toBe("gamma");
    expect(rows[5].projectName).toBe("gamma");

    // Within each project, thread-2 (higher tokens) should come first
    for (let i = 0; i < 6; i += 2) {
      expect(rows[i].sessionId).toContain("thread-2");
      expect(rows[i + 1].sessionId).toContain("thread-1");
    }

    // Verify aggregation: thread-1 has 3 messages * 10 input = 30
    const alphaSess1 = rows.find((r: any) => r.projectName === "alpha" && r.sessionId === "alpha-thread-1");
    expect(alphaSess1!.inputTokens).toBe(30);
    expect(alphaSess1!.outputTokens).toBe(15);
  });

  it("sessionId is now thread_id, not session_id from token_usage", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("thread-1"); // thread_id, not sess-1
  });

  it("returns identical results on consecutive calls (idempotent)", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.upsertThread("thread-2", "web", "ch-2", "sess-2", "proj-b");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 10, 5, "opus");
    store.saveMessage("msg-2", "web", "thread-2", true, "r", 200, 100, 20, 10, "opus");

    const result1 = store.getOverviewTokens(null);
    const result2 = store.getOverviewTokens(null);
    expect(result1).toEqual(result2);
  });

  it("does not modify the database (no side effects)", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 10, 5, "opus");
    const db = (store as any).db;

    const countBefore = db.prepare("SELECT COUNT(*) as cnt FROM messages").get().cnt;
    store.getOverviewTokens(null);
    const countAfter = db.prepare("SELECT COUNT(*) as cnt FROM messages").get().cnt;

    expect(countAfter).toBe(countBefore);
  });

  it("reads data written by saveMessage immediately", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 10, 5, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("thread-1");
    expect(rows[0].projectName).toBe("proj-a");
    expect(rows[0].inputTokens).toBe(100);
  });

  it("reflects thread metadata updates after upsertThread", () => {
    store.upsertThread("thread-1", "web", "ch-1", "s1", "proj-a", "my-session");
    // Update the same thread to change session_id
    store.upsertThread("thread-1", "web", "ch-1", "s2", "proj-a", "my-session");
    store.saveMessage("msg-1", "web", "thread-1", true, "r", 100, 50, 0, 0, "opus");

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("thread-1"); // always thread_id
    expect(rows[0].platform).toBe("web");
    expect(rows[0].sessionName).toBe("my-session");
  });
});
