import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

describe("Store", () => {
  let store: Store;
  const dbPath = `/tmp/cc2im-test-${Date.now()}.db`;

  beforeEach(() => {
    store = new Store(dbPath);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("creates and retrieves a thread", () => {
    store.upsertThread("thread-1", "discord", "channel-1", "session-abc", "my-project");
    const thread = store.getThread("thread-1", "discord");
    expect(thread).not.toBeNull();
    expect(thread!.session_id).toBe("session-abc");
    expect(thread!.project_name).toBe("my-project");
  });

  it("updates session_id for existing thread", () => {
    store.upsertThread("thread-1", "discord", "channel-1", "session-old", "proj");
    store.upsertThread("thread-1", "discord", "channel-1", "session-new", "proj");
    const thread = store.getThread("thread-1", "discord");
    expect(thread!.session_id).toBe("session-new");
  });

  it("returns null for unknown thread", () => {
    const thread = store.getThread("nonexistent", "discord");
    expect(thread).toBeNull();
  });

  it("saves and retrieves messages", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj");
    store.saveMessage("msg-1", "discord", "thread-1", true, "hello world");
    const msg = store.getMessage("msg-1", "discord");
    expect(msg).not.toBeNull();
    expect(msg!.is_bot).toBe(1);
    expect(msg!.content_summary).toBe("hello world");
  });

  it("deletes thread and cascade", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj");
    store.saveMessage("msg-1", "discord", "thread-1", false, "test");
    store.deleteThread("thread-1", "discord");
    expect(store.getThread("thread-1", "discord")).toBeNull();
  });
});
