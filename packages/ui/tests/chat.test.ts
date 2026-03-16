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
        threadKey: "web:proj:1000",
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

  // --- chat.stream handler tests ---

  describe("chat.stream handler", () => {
    it("updates streaming assistant message content", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      registeredHandlers.get("chat.stream")!({
        type: "chat.stream",
        sessionId: threadKey,
        contentType: "text",
        content: "Hello",
      });

      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].content).toBe("Hello");
      vi.restoreAllMocks();
    });

    it("non-text contentType does not update message", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      registeredHandlers.get("chat.stream")!({
        type: "chat.stream",
        sessionId: threadKey,
        contentType: "tool_use",
        content: "something",
      });

      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].content).toBe("");
      vi.restoreAllMocks();
    });

    it("no matching session does not crash", () => {
      expect(() => {
        registeredHandlers.get("chat.stream")!({
          type: "chat.stream",
          sessionId: "nonexistent",
          contentType: "text",
          content: "hello",
        });
      }).not.toThrow();
    });

    it("last message not streaming does not update", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      // First, finish the stream so streaming=false
      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        sessionId: threadKey,
        result: "done",
        tokens: { inputTokens: 10, outputTokens: 20 },
      });

      // Now try to stream again with a direct sessionId (no threadKey mapping since done clears it)
      registeredHandlers.get("chat.stream")!({
        type: "chat.stream",
        sessionId: "new-proj",
        contentType: "text",
        content: "late update",
      });

      const session = get(sessions).get("new-proj")!;
      // Last message should still be "done", not "late update"
      expect(session.messages[1].content).toBe("done");
      vi.restoreAllMocks();
    });

    it("multiple stream events accumulate text", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      const handler = registeredHandlers.get("chat.stream")!;
      handler({ type: "chat.stream", sessionId: threadKey, contentType: "text", content: "Hello" });
      handler({ type: "chat.stream", sessionId: threadKey, contentType: "text", content: " World" });

      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].content).toBe("Hello World");
      vi.restoreAllMocks();
    });
  });

  // --- chat.done handler tests ---

  describe("chat.done handler", () => {
    it("sets streaming=false and updates content to result", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        sessionId: threadKey,
        result: "Final answer",
        tokens: { inputTokens: 10, outputTokens: 20 },
      });

      const session = get(sessions).get("new-proj")!;
      const last = session.messages[1];
      expect(last.streaming).toBe(false);
      expect(last.content).toBe("Final answer");
      vi.restoreAllMocks();
    });

    it("sets session id to realSessionId", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        sessionId: threadKey,
        result: "done",
        realSessionId: "real-sess-99",
        tokens: { inputTokens: 1, outputTokens: 2 },
      });

      const session = get(sessions).get("new-proj")!;
      expect(session.id).toBe("real-sess-99");
      vi.restoreAllMocks();
    });

    it("sets tokens from event", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        sessionId: threadKey,
        result: "ok",
        tokens: { inputTokens: 100, outputTokens: 200 },
      });

      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].tokens).toEqual({ input: 100, output: 200 });
      vi.restoreAllMocks();
    });

    it("realSessionId null keeps original session id", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi", "existing-sess");
      const threadKey = "web:proj:5000";

      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        sessionId: threadKey,
        result: "ok",
        realSessionId: null,
        tokens: { inputTokens: 1, outputTokens: 1 },
      });

      const session = get(sessions).get("existing-sess")!;
      // null ?? session.id => session.id which is "existing-sess"
      expect(session.id).toBe("existing-sess");
      vi.restoreAllMocks();
    });

    it("cleans up threadKeyMap (subsequent events fall through to sessionId)", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        sessionId: threadKey,
        result: "done",
        tokens: { inputTokens: 1, outputTokens: 1 },
      });

      // After done, threadKey should be cleared. A new stream event with the same threadKey
      // would use threadKey as sessKey directly (no mapping), which won't match "new-proj"
      registeredHandlers.get("chat.stream")!({
        type: "chat.stream",
        sessionId: threadKey,
        contentType: "text",
        content: "stale",
      });

      // The session "new-proj" should not be updated since threadKey is no longer mapped
      const session = get(sessions).get("new-proj")!;
      expect(session.messages[1].content).toBe("done");
      vi.restoreAllMocks();
    });

    it("no matching session does not crash", () => {
      expect(() => {
        registeredHandlers.get("chat.done")!({
          type: "chat.done",
          sessionId: "nonexistent",
          result: "ok",
        });
      }).not.toThrow();
    });
  });

  // --- chat.error handler tests ---

  describe("chat.error handler", () => {
    it("sets error message on streaming assistant", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      registeredHandlers.get("chat.error")!({
        type: "chat.error",
        sessionId: threadKey,
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
      const threadKey = "web:proj:5000";

      registeredHandlers.get("chat.error")!({
        type: "chat.error",
        sessionId: threadKey,
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
          sessionId: "nonexistent",
          error: { message: "fail" },
        });
      }).not.toThrow();
    });

    it("last message not streaming does not update", () => {
      vi.spyOn(Date, "now").mockReturnValue(5000);
      sendMessage("proj", "hi");
      const threadKey = "web:proj:5000";

      // First complete the stream
      registeredHandlers.get("chat.done")!({
        type: "chat.done",
        sessionId: threadKey,
        result: "completed",
        tokens: { inputTokens: 1, outputTokens: 1 },
      });

      // Now try error on same session via direct sessKey
      registeredHandlers.get("chat.error")!({
        type: "chat.error",
        sessionId: "new-proj",
        error: { message: "late error" },
      });

      const session = get(sessions).get("new-proj")!;
      // Should still be "completed", not the error
      expect(session.messages[1].content).toBe("completed");
      vi.restoreAllMocks();
    });
  });
});
