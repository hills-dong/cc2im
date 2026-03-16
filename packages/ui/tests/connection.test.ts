import { describe, it, expect, vi, beforeEach } from "vitest";

// --- MockWebSocket ---
let mockInstances: MockWebSocket[] = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;

  readyState = MockWebSocket.OPEN;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  url: string;

  constructor(url: string) {
    this.url = url;
    mockInstances.push(this);
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);

describe("connection store", () => {
  let connectionStatus: typeof import("../src/lib/stores/connection.js").connectionStatus;
  let on: typeof import("../src/lib/stores/connection.js").on;
  let connect: typeof import("../src/lib/stores/connection.js").connect;
  let send: typeof import("../src/lib/stores/connection.js").send;

  function getStatus(): Promise<string> {
    return new Promise((resolve) => {
      const unsub = connectionStatus.subscribe((v) => {
        resolve(v);
        // defer unsub to avoid issues
        queueMicrotask(() => unsub());
      });
    });
  }

  beforeEach(async () => {
    vi.clearAllTimers();
    vi.useFakeTimers();
    mockInstances = [];
    vi.resetModules();
    const mod = await import("../src/lib/stores/connection.js");
    connectionStatus = mod.connectionStatus;
    on = mod.on;
    connect = mod.connect;
    send = mod.send;
  });

  // --- on() tests ---

  describe("on", () => {
    it("registers handler and receives dispatched events via onmessage", () => {
      const handler = vi.fn();
      on("test.event", handler);

      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.onmessage!({ data: JSON.stringify({ type: "test.event", payload: 42 }) });

      expect(handler).toHaveBeenCalledWith({ type: "test.event", payload: 42 });
    });

    it("returns unsubscribe function that removes handler", () => {
      const handler = vi.fn();
      const unsub = on("test.event", handler);
      unsub();

      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.onmessage!({ data: JSON.stringify({ type: "test.event" }) });

      expect(handler).not.toHaveBeenCalled();
    });

    it("supports multiple handlers for same type", () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      on("test.event", h1);
      on("test.event", h2);

      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.onmessage!({ data: JSON.stringify({ type: "test.event" }) });

      expect(h1).toHaveBeenCalledOnce();
      expect(h2).toHaveBeenCalledOnce();
    });

    it("non-matching type does not trigger handler", () => {
      const handler = vi.fn();
      on("test.event", handler);

      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.onmessage!({ data: JSON.stringify({ type: "other.event" }) });

      expect(handler).not.toHaveBeenCalled();
    });

    it("dispatch with no registered handlers does not crash", () => {
      connect("ws://localhost");
      const ws = mockInstances[0];
      expect(() => {
        ws.onmessage!({ data: JSON.stringify({ type: "unhandled" }) });
      }).not.toThrow();
    });
  });

  // --- connect() tests ---

  describe("connect", () => {
    it("sets status to connecting immediately", async () => {
      connect("ws://localhost");
      const status = await getStatus();
      expect(status).toBe("connecting");
    });

    it("on open sets status to connected and sends sync.state", async () => {
      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.onopen!({});

      const status = await getStatus();
      expect(status).toBe("connected");
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "sync.state" }));
    });

    it("on close sets status to disconnected", async () => {
      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.onopen!({});
      ws.onclose!({});

      const status = await getStatus();
      expect(status).toBe("disconnected");
    });

    it("on close triggers reconnect via setTimeout", () => {
      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.onclose!({});

      // First reconnect delay is 0ms
      vi.advanceTimersByTime(0);
      expect(mockInstances).toHaveLength(2);
      expect(mockInstances[1].url).toBe("ws://localhost");
    });

    it("on message dispatches parsed JSON to handlers", () => {
      const handler = vi.fn();
      on("msg.type", handler);

      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.onmessage!({ data: JSON.stringify({ type: "msg.type", val: "hello" }) });

      expect(handler).toHaveBeenCalledWith({ type: "msg.type", val: "hello" });
    });

    it("on message with invalid JSON does not crash", () => {
      connect("ws://localhost");
      const ws = mockInstances[0];
      expect(() => {
        ws.onmessage!({ data: "not json{{{" });
      }).not.toThrow();
    });
  });

  // --- send() tests ---

  describe("send", () => {
    it("when ws is OPEN sends JSON", () => {
      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.readyState = MockWebSocket.OPEN;

      send({ type: "test", data: 123 });
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "test", data: 123 }));
    });

    it("when ws is null does not crash", () => {
      // No connect() called, ws is null
      expect(() => send({ type: "test" })).not.toThrow();
    });

    it("when ws is not OPEN does not send", () => {
      connect("ws://localhost");
      const ws = mockInstances[0];
      ws.readyState = MockWebSocket.CLOSED;

      send({ type: "test" });
      // send was called once during connect's onopen, but we haven't triggered that
      // Since readyState is CLOSED, our send() should not call ws.send
      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
