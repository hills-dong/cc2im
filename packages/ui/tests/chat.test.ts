import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "../src/lib/stores/chat.js";

// Capture handlers registered by chat.ts via on()
const registeredHandlers = new Map<string, (data: any) => void>();
const mockSend = vi.fn();

vi.mock("../src/lib/stores/connection.js", () => ({
  on: vi.fn((type: string, handler: (data: any) => void) => {
    registeredHandlers.set(type, handler);
    return () => registeredHandlers.delete(type);
  }),
  send: mockSend,
}));

// Helper to read current value from a svelte store
function get<T>(store: { subscribe: (fn: (val: T) => void) => () => void }): T {
  let value: T;
  const unsub = store.subscribe((v) => (value = v));
  unsub();
  return value!;
}

describe("chat store", () => {
  let sessions: typeof import("../src/lib/stores/chat.js").sessions;
  let sendMessage: typeof import("../src/lib/stores/chat.js").sendMessage;

  beforeEach(async () => {
    registeredHandlers.clear();
    mockSend.mockClear();
    vi.resetModules();

    // Stub crypto.randomUUID
    vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-1234" });

    const mod = await import("../src/lib/stores/chat.js");
    sessions = mod.sessions;
    sendMessage = mod.sendMessage;
  });

  // --- sendMessage tests ---

  describe("sendMessage", () => {
    it("creates new session with user + streaming assistant messages", () => {
      sendMessage("myproject", "hello");
      const s = get(sessions);
      const session = s.get("new-myproject")!;
      expect(session).toBeDefined();
      expect(session.messages).toHaveLength(2);
      expect(session.messages[0].role).toBe("user");
      expect(session.messages[1].role).toBe("assistant");
    });

    it("user message content matches input", () => {
      sendMessage("proj", "my question");
      const session = get(sessions).get("new-proj")!;
      expect(session.messages[0].content).toBe("my question");
    });

    it("assistant message starts empty with streaming=true", () => {
      sendMessage("proj", "hi");
      const session = get(sessions).get("new-proj")!;
      const assistantMsg = session.messages[1];
      expect(assistantMsg.content).toBe("");
      expect(assistantMsg.streaming).toBe(true);
    });

    it("with sessionId uses it as sessKey", () => {
      sendMessage("proj", "hi", "sess-42");
      const s = get(sessions);
      expect(s.has("sess-42")).toBe(true);
      expect(s.get("sess-42")!.id).toBe("sess-42");
    });

    it("without sessionId uses new-{project} as sessKey and null id", () => {
      sendMessage("proj", "hi");
      const s = get(sessions);
      expect(s.has("new-proj")).toBe(true);
      expect(s.get("new-proj")!.id).toBeNull();
    });

    it("calls connection.send with chat.send payload", () => {
      vi.spyOn(Date, "now").mockReturnValue(1000);
      sendMessage("proj", "hello", "sess-1");
      expect(mockSend).toHaveBeenCalledWith({
        type: "chat.send",
        project: "proj",
        sessionId: "sess-1",
        message: "hello",
        threadKey: "wb_proj:1000",
      });
      vi.restoreAllMocks();
    });

    it("appending to existing session preserves old messages", () => {
      sendMessage("proj", "first");
      sendMessage("proj", "second");
      const session = get(sessions).get("new-proj")!;
      // 2 user + 2 assistant messages
      expect(session.messages).toHaveLength(4);
      expect(session.messages[0].content).toBe("first");
      expect(session.messages[2].content).toBe("second");
    });
  });

  // --- chat.message handler tests ---

  describe("chat.message handler", () => {
    it("updates streaming assistant message with initial content", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      registeredHandlers.get("chat.message")!({
        type: "chat.message",
        threadId: threadKey,
        messageId: "server-msg-1",
        content: "Hello",
      });

      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].content).toBe("Hello");
      vi.restoreAllMocks();
    });

    it("no matching session does not crash", () => {
      expect(() => {
        registeredHandlers.get("chat.message")!({
          type: "chat.message",
          threadId: "nonexistent",
          messageId: "msg-1",
          content: "hello",
        });
      }).not.toThrow();
    });

    it("last message not streaming does not update", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      // First set content via chat.message
      registeredHandlers.get("chat.message")!({
        type: "chat.message",
        threadId: threadKey,
        messageId: "server-msg-1",
        content: "done content",
      });

      // Complete the stream
      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        threadId: threadKey,
        tokens: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
      });

      // Now try chat.message again on the same sessKey directly (threadKey mapping cleared by done)
      registeredHandlers.get("chat.message")!({
        type: "chat.message",
        threadId: threadKey,
        messageId: "server-msg-2",
        content: "late update",
      });

      const session = get(sessions).get("new-proj")!;
      // Should still be "done content", not "late update"
      expect(session.messages[1].content).toBe("done content");
      vi.restoreAllMocks();
    });
  });

  // --- chat.update handler tests ---

  describe("chat.update handler", () => {
    it("replaces streaming message content", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      // First create the message mapping via chat.message
      registeredHandlers.get("chat.message")!({
        type: "chat.message",
        threadId: threadKey,
        messageId: "server-msg-1",
        content: "Initial",
      });

      // Then update via chat.update
      registeredHandlers.get("chat.update")!({
        type: "chat.update",
        threadId: threadKey,
        messageId: "server-msg-1",
        content: "Updated content",
      });

      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].content).toBe("Updated content");
      vi.restoreAllMocks();
    });

    it("multiple chat.update events replace (not accumulate)", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      // Create message mapping
      registeredHandlers.get("chat.message")!({
        type: "chat.message",
        threadId: threadKey,
        messageId: "server-msg-1",
        content: "First",
      });

      const handler = registeredHandlers.get("chat.update")!;
      handler({ type: "chat.update", threadId: threadKey, messageId: "server-msg-1", content: "Hello" });
      handler({ type: "chat.update", threadId: threadKey, messageId: "server-msg-1", content: "World" });

      const session = get(sessions).get("new-proj")!;
      // Should be "World" (replaced), not "HelloWorld" (accumulated)
      expect(session.messages[1].content).toBe("World");
      vi.restoreAllMocks();
    });

    it("no matching session does not crash", () => {
      expect(() => {
        registeredHandlers.get("chat.update")!({
          type: "chat.update",
          threadId: "nonexistent",
          messageId: "msg-1",
          content: "hello",
        });
      }).not.toThrow();
    });
  });

  // --- chat.done handler tests ---

  describe("chat.done handler", () => {
    it("sets streaming=false and preserves content from prior chat.update", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      // Content set by chat.message + chat.update before done
      registeredHandlers.get("chat.message")!({
        type: "chat.message",
        threadId: threadKey,
        messageId: "server-msg-1",
        content: "Initial",
      });
      registeredHandlers.get("chat.update")!({
        type: "chat.update",
        threadId: threadKey,
        messageId: "server-msg-1",
        content: "Final answer",
      });

      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        threadId: threadKey,
        tokens: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
      });

      const session = get(sessions).get("new-proj")!;
      const last = session.messages[1];
      expect(last.streaming).toBe(false);
      expect(last.content).toBe("Final answer");
      vi.restoreAllMocks();
    });

    it("sets tokens from event", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        threadId: threadKey,
        tokens: { inputTokens: 100, outputTokens: 200, cacheReadTokens: 0, cacheCreationTokens: 0 },
      });

      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].tokens).toEqual({ input: 100, output: 200, cacheRead: 0, cacheCreation: 0 });
      vi.restoreAllMocks();
    });

    it("cleans up threadKeyMap (subsequent events fall through)", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      // Set content before done
      registeredHandlers.get("chat.message")!({
        type: "chat.message",
        threadId: threadKey,
        messageId: "server-msg-1",
        content: "done content",
      });

      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        threadId: threadKey,
        tokens: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      });

      // After done, threadKey should be cleared. A new update event with the same threadKey
      // would not find the mapping, so it won't update our session
      registeredHandlers.get("chat.update")!({
        type: "chat.update",
        threadId: threadKey,
        messageId: "server-msg-2",
        content: "stale",
      });

      // The session "new-proj" should not be updated since threadKey is no longer mapped
      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].content).toBe("done content");
      vi.restoreAllMocks();
    });

    it("no matching session does not crash", () => {
      expect(() => {
        registeredHandlers.get("chat.done")!({
          type: "chat.done",
          threadId: "nonexistent",
          tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
        });
      }).not.toThrow();
    });
  });

  // --- chat.error handler tests ---

  describe("chat.error handler", () => {
    it("sets error message on streaming assistant", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      registeredHandlers.get("chat.error")!({
        type: "chat.error",
        threadId: threadKey,
        error: { message: "Rate limited" },
      });

      const session = get(sessions).get("new-proj")!;
      const last = session.messages[1];
      expect(last.content).toBe("Error: Rate limited");
      expect(last.streaming).toBe(false);
      vi.restoreAllMocks();
    });

    it("undefined error message shows Unknown error", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      registeredHandlers.get("chat.error")!({
        type: "chat.error",
        threadId: threadKey,
        error: {},
      });

      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].content).toBe("Error: Unknown error");
      vi.restoreAllMocks();
    });

    it("no matching session does not crash", () => {
      expect(() => {
        registeredHandlers.get("chat.error")!({
          type: "chat.error",
          threadId: "nonexistent",
          error: { message: "fail" },
        });
      }).not.toThrow();
    });

    it("last message not streaming does not update", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "wb_proj:5000";

      // First complete the stream
      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        threadId: threadKey,
        tokens: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      });

      // Now try error on same session via direct sessKey (threadKey mapping cleared)
      registeredHandlers.get("chat.error")!({
        type: "chat.error",
        threadId: "new-proj",
        error: { message: "late error" },
      });

      const session = get(sessions).get("new-proj")!;
      // Should still be empty (done didn't set content), not the error
      expect(session.messages[1].content).toBe("");
      expect(session.messages[1].streaming).toBe(false);
      vi.restoreAllMocks();
    });
  });
});
