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

  it("returns aggregated token_usage records for all sessions when since=null", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 10, 5);
    store.saveTokenUsage("sess-1", "proj-a", "opus", 200, 100, 20, 10);
    store.saveTokenUsage("sess-2", "proj-b", "opus", 300, 150, 30, 15);

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
    db.prepare(
      "INSERT INTO token_usage (session_id, project_name, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("sess-old", "proj-a", "opus", 100, 50, 0, 0, "2026-03-17T00:00:00");
    db.prepare(
      "INSERT INTO token_usage (session_id, project_name, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("sess-new", "proj-a", "opus", 200, 100, 0, 0, "2026-03-18T12:00:00");

    const rows = store.getOverviewTokens("2026-03-18T00:00:00");
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("sess-new");
    expect(rows[0].inputTokens).toBe(200);
  });

  it("correctly aggregates multiple token_usage records for the same session", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 10, 5);
    store.saveTokenUsage("sess-1", "proj-a", "opus", 200, 100, 20, 10);
    store.saveTokenUsage("sess-1", "proj-a", "opus", 300, 150, 30, 15);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].inputTokens).toBe(600);
    expect(rows[0].outputTokens).toBe(300);
    expect(rows[0].cacheReadTokens).toBe(60);
    expect(rows[0].cacheCreationTokens).toBe(30);
  });

  it("groups by project_name so sessions from different projects do not mix", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 0, 0);
    store.saveTokenUsage("sess-2", "proj-b", "opus", 200, 100, 0, 0);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    const projectNames = rows.map((r: any) => r.projectName);
    expect(projectNames).toContain("proj-a");
    expect(projectNames).toContain("proj-b");
  });

  it("sorts sessions within the same project by total tokens descending", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 0, 0);
    store.saveTokenUsage("sess-2", "proj-a", "opus", 500, 200, 0, 0);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    // sess-2 (700 total) should come before sess-1 (150 total)
    expect(rows[0].sessionId).toBe("sess-2");
    expect(rows[1].sessionId).toBe("sess-1");
  });

  it("sorts different projects by project_name ascending", () => {
    store.saveTokenUsage("sess-1", "beta", "opus", 100, 50, 0, 0);
    store.saveTokenUsage("sess-2", "alpha", "opus", 200, 100, 0, 0);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    expect(rows[0].projectName).toBe("alpha");
    expect(rows[1].projectName).toBe("beta");
  });

  it("returns platform/sessionName/sessionCreatedAt from thread when thread exists", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a", "my-session");
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 0, 0);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).not.toBeNull();
    expect(rows[0].sessionName).not.toBeNull();
    expect(rows[0].sessionCreatedAt).not.toBeNull();
  });

  it("returns null for platform/sessionName/sessionCreatedAt when no thread exists", () => {
    store.saveTokenUsage("sess-no-thread", "proj-a", "opus", 100, 50, 0, 0);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBeNull();
    expect(rows[0].sessionName).toBeNull();
    expect(rows[0].sessionCreatedAt).toBeNull();
  });

  it("does not duplicate token counts when multiple threads share the same session_id", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a", "chat-1");
    store.upsertThread("thread-2", "discord", "ch-2", "sess-1", "proj-a", "chat-2");
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 10, 5);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].inputTokens).toBe(100);
  });

  it("returns an empty array when the database is empty", () => {
    const rows = store.getOverviewTokens(null);
    expect(rows).toEqual([]);
  });

  it("includes records where created_at equals since (>= semantics)", () => {
    const db = (store as any).db;
    db.prepare(
      "INSERT INTO token_usage (session_id, project_name, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("sess-1", "proj-a", "opus", 100, 50, 0, 0, "2026-03-18T10:00:00");

    const rows = store.getOverviewTokens("2026-03-18T10:00:00");
    expect(rows).toHaveLength(1);
  });

  it("returns an empty array when since is later than all records", () => {
    const db = (store as any).db;
    db.prepare(
      "INSERT INTO token_usage (session_id, project_name, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("sess-1", "proj-a", "opus", 100, 50, 0, 0, "2026-03-17T00:00:00");

    const rows = store.getOverviewTokens("2026-03-19T00:00:00");
    expect(rows).toEqual([]);
  });

  it("returns 0 for all token fields when all values are 0", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 0, 0, 0, 0);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].inputTokens).toBe(0);
    expect(rows[0].outputTokens).toBe(0);
    expect(rows[0].cacheReadTokens).toBe(0);
    expect(rows[0].cacheCreationTokens).toBe(0);
  });

  it("returns objects with all OverviewTokenRow fields", () => {
    store.upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a", "my-session");
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 10, 5);

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
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 10, 5);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(typeof rows[0].inputTokens).toBe("number");
    expect(typeof rows[0].outputTokens).toBe("number");
    expect(typeof rows[0].cacheReadTokens).toBe("number");
    expect(typeof rows[0].cacheCreationTokens).toBe("number");
  });

  it("correctly aggregates across multiple projects with multiple sessions each", () => {
    const projects = ["alpha", "beta", "gamma"];
    for (const proj of projects) {
      for (let s = 1; s <= 2; s++) {
        for (let r = 0; r < 3; r++) {
          store.saveTokenUsage(`${proj}-sess-${s}`, proj, "opus", 10 * s, 5 * s, 1, 1);
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

    // Within each project, sess-2 (higher tokens) should come first
    for (let i = 0; i < 6; i += 2) {
      expect(rows[i].sessionId).toContain("sess-2");
      expect(rows[i + 1].sessionId).toContain("sess-1");
    }

    // Verify aggregation: sess-1 has 3 records * 10 input = 30
    const alphaSess1 = rows.find((r: any) => r.projectName === "alpha" && r.sessionId === "alpha-sess-1");
    expect(alphaSess1!.inputTokens).toBe(30);
    expect(alphaSess1!.outputTokens).toBe(15);
  });

  it("aggregates separately when the same session_id appears under different projects", () => {
    store.saveTokenUsage("shared-sess", "proj-a", "opus", 100, 50, 0, 0);
    store.saveTokenUsage("shared-sess", "proj-b", "opus", 200, 100, 0, 0);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    const projA = rows.find((r: any) => r.projectName === "proj-a");
    const projB = rows.find((r: any) => r.projectName === "proj-b");
    expect(projA!.sessionId).toBe("shared-sess");
    expect(projB!.sessionId).toBe("shared-sess");
    expect(projA!.inputTokens).toBe(100);
    expect(projB!.inputTokens).toBe(200);
  });

  it("selects MIN(platform), MIN(name), MIN(created_at) when multiple threads exist for a session", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj-a", "chat-b");
    store.upsertThread("thread-2", "web", "ch-2", "sess-1", "proj-a", "chat-a");
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 0, 0);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBe("discord"); // MIN of "discord", "web"
    expect(rows[0].sessionName).toBe("chat-a"); // MIN of "chat-a", "chat-b"
  });

  it("returns identical results on consecutive calls (idempotent)", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 10, 5);
    store.saveTokenUsage("sess-2", "proj-b", "opus", 200, 100, 20, 10);

    const result1 = store.getOverviewTokens(null);
    const result2 = store.getOverviewTokens(null);
    expect(result1).toEqual(result2);
  });

  it("does not modify the database (no side effects)", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 10, 5);
    const db = (store as any).db;

    const countBefore = db.prepare("SELECT COUNT(*) as cnt FROM token_usage").get().cnt;
    store.getOverviewTokens(null);
    const countAfter = db.prepare("SELECT COUNT(*) as cnt FROM token_usage").get().cnt;

    expect(countAfter).toBe(countBefore);
  });

  it("reads data written by saveTokenUsage immediately", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 10, 5);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("sess-1");
    expect(rows[0].projectName).toBe("proj-a");
    expect(rows[0].inputTokens).toBe(100);
  });

  it("joins correctly after upsertThread updates the session_id of a thread", () => {
    store.upsertThread("thread-1", "web", "ch-1", "s1", "proj-a", "my-session");
    // Update the same thread to point to s2
    store.upsertThread("thread-1", "web", "ch-1", "s2", "proj-a", "my-session");
    store.saveTokenUsage("s2", "proj-a", "opus", 100, 50, 0, 0);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("s2");
    expect(rows[0].platform).toBe("web");
    expect(rows[0].sessionName).toBe("my-session");
  });
});
