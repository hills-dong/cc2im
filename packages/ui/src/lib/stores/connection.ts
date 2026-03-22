import { writable } from "svelte/store";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export const connectionStatus = writable<ConnectionStatus>("disconnected");

let ws: WebSocket | null = null;
let reconnectAttempt = 0;
const MAX_RECONNECT_DELAY = 30000;
const handlers = new Map<string, Set<(data: any) => void>>();
// Queue messages sent before WebSocket is ready
const pendingQueue: unknown[] = [];
// Callbacks invoked on reconnect (not first connect)
const reconnectCallbacks = new Set<() => void>();
let hasConnectedOnce = false;

export function on(type: string, handler: (data: any) => void): () => void {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => handlers.get(type)?.delete(handler);
}

function dispatch(event: any): void {
  handlers.get(event.type)?.forEach(h => h(event));
}

export function connect(url: string): void {
  connectionStatus.set("connecting");
  ws = new WebSocket(url);

  ws.onopen = () => {
    connectionStatus.set("connected");
    reconnectAttempt = 0;
    send({ type: "sync.state" });
    // Flush any messages queued while disconnected
    while (pendingQueue.length > 0) {
      send(pendingQueue.shift());
    }
    // Re-subscribe to active threads after reconnect
    if (hasConnectedOnce) {
      for (const cb of reconnectCallbacks) cb();
    }
    hasConnectedOnce = true;
    // Expose for E2E testing
    (globalThis as any).__ws = ws;
  };

  ws.onmessage = (e) => {
    try { dispatch(JSON.parse(e.data)); } catch {}
  };

  ws.onclose = () => {
    connectionStatus.set("disconnected");
    ws = null;
    scheduleReconnect(url);
  };
}

/** Register a callback to run on WebSocket reconnection (not first connect) */
export function onReconnect(cb: () => void): () => void {
  reconnectCallbacks.add(cb);
  return () => reconnectCallbacks.delete(cb);
}

export function send(data: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  } else {
    // Queue for delivery once connected
    pendingQueue.push(data);
  }
}

function scheduleReconnect(url: string): void {
  const delays = [0, 1000, 2000, 4000];
  const delay = delays[reconnectAttempt] ?? MAX_RECONNECT_DELAY;
  reconnectAttempt++;
  setTimeout(() => connect(url), delay);
}
