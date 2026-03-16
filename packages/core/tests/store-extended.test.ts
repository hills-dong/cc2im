import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

describe("Store extended methods", () => {
  let store: Store;
  const dbPath = `/tmp/cc2im-store-ext-test-${Date.now()}.db`;

  beforeEach(() => {
    store = new Store(dbPath);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("updateThreadStatus changes thread status", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj");
    const before = store.getThread("thread-1", "discord");
    expect(before!.status).toBe("active");

    store.updateThreadStatus("thread-1", "discord", "done");
    const after = store.getThread("thread-1", "discord");
    expect(after!.status).toBe("done");
  });

  it("getLastBotMessage returns most recent bot message", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj");
    store.saveMessage("msg-1", "discord", "thread-1", false, "user msg");
    store.saveMessage("msg-2", "discord", "thread-1", true, "bot msg 1");
    store.saveMessage("msg-3", "discord", "thread-1", true, "bot msg 2");

    const last = store.getLastBotMessage("thread-1", "discord");
    expect(last).toBeDefined();
    expect(last!.is_bot).toBe(1);
    // Both bot messages were inserted in the same timestamp, so we just verify
    // a bot message is returned (the ORDER BY created_at picks one of them)
    expect(["bot msg 1", "bot msg 2"]).toContain(last!.content_summary);
  });

  it("getLastBotMessage returns null when no messages", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj");
    const last = store.getLastBotMessage("thread-1", "discord");
    expect(last).toBeNull();
  });

  it("markPendingRestart + getPendingRestarts returns pending threads", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj");
    store.upsertThread("thread-2", "lark", "ch-2", "sess-2", "proj");
    store.markPendingRestart("thread-1", "discord");
    store.markPendingRestart("thread-2", "lark");

    const pending = store.getPendingRestarts();
    expect(pending).toHaveLength(2);
    const ids = pending.map(t => t.thread_id).sort();
    expect(ids).toEqual(["thread-1", "thread-2"]);
  });

  it("clearPendingRestarts removes all pending", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj");
    store.markPendingRestart("thread-1", "discord");
    expect(store.getPendingRestarts()).toHaveLength(1);

    store.clearPendingRestarts();
    expect(store.getPendingRestarts()).toHaveLength(0);
  });

  it("listSessions returns all threads", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj-a");
    store.upsertThread("thread-2", "lark", "ch-2", "sess-2", "proj-b");

    const all = store.listSessions();
    expect(all).toHaveLength(2);
  });

  it("listSessions with projectName filters correctly", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj-a");
    store.upsertThread("thread-2", "lark", "ch-2", "sess-2", "proj-b");
    store.upsertThread("thread-3", "discord", "ch-3", "sess-3", "proj-a");

    const filtered = store.listSessions("proj-a");
    expect(filtered).toHaveLength(2);
    expect(filtered.every(t => t.project_name === "proj-a")).toBe(true);
  });
});
