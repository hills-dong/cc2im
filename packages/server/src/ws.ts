import { WebSocketServer, WebSocket } from "ws";
import type http from "http";
import type { AppConfig, StreamEvent } from "@cc2im/core";
import type { Store } from "@cc2im/core";
import type { SessionManager } from "@cc2im/core";

export interface WsContext {
  config: AppConfig;
  store: Store;
  sessionManager: SessionManager;
}

interface BufferedOutput {
  threadKey: string;
  events: StreamEvent[];
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(clients: Set<WebSocket>, msg: unknown): void {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

async function handleChatSend(
  ws: WebSocket,
  clients: Set<WebSocket>,
  ctx: WsContext,
  payload: { project: string; message: string; sessionId?: string; model?: string },
): Promise<void> {
  const { config, sessionManager } = ctx;

  const project = config.projects.find((p) => p.name === payload.project);
  if (!project) {
    send(ws, {
      type: "chat.error",
      sessionId: payload.sessionId ?? "",
      error: { code: "PROJECT_NOT_FOUND", message: `Project '${payload.project}' not found` },
    });
    return;
  }

  const sessionId = payload.sessionId ?? null;
  const threadKey = `web:${payload.project}:${Date.now()}`;

  try {
    const result = await sessionManager.invoke(
      threadKey,
      project.directory,
      sessionId,
      payload.message,
      (event: StreamEvent) => {
        broadcast(clients, { type: "chat.stream", threadKey, event });
      },
      undefined,
      undefined,
      payload.model ?? project.model,
    );

    broadcast(clients, {
      type: "chat.done",
      threadKey,
      sessionId: result.sessionId,
      text: result.text,
    });
  } catch (err: unknown) {
    broadcast(clients, {
      type: "chat.error",
      threadKey,
      error: {
        code: "INVOKE_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export function attachWebSocket(server: http.Server, ctx: WsContext): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Set<WebSocket>();

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    }
  }, 30_000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  wss.on("connection", (ws: WebSocket) => {
    clients.add(ws);

    ws.on("message", (data) => {
      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        send(ws, { type: "error", error: { code: "INVALID_JSON", message: "Invalid JSON" } });
        return;
      }

      switch (msg.type) {
        case "sync.state": {
          const keys = ctx.sessionManager.activeKeys();
          const activeSessions = keys.map((key) => {
            const parts = key.split(":");
            return { sessionId: parts.slice(1).join(":") || key, project: parts[1] ?? "" };
          });
          send(ws, { type: "sync.state", activeSessions, bufferedOutput: {} });
          break;
        }

        case "chat.send": {
          handleChatSend(ws, clients, ctx, {
            project: msg.project as string,
            message: msg.message as string,
            sessionId: msg.sessionId as string | undefined,
            model: msg.model as string | undefined,
          }).catch((err) => {
            console.error("chat.send error:", err);
          });
          break;
        }

        case "chat.abort": {
          const sessionId = msg.sessionId as string;
          if (sessionId) {
            ctx.sessionManager.abort(sessionId);
          }
          break;
        }

        default:
          send(ws, { type: "error", error: { code: "UNKNOWN_TYPE", message: `Unknown message type: ${msg.type}` } });
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      clients.delete(ws);
    });
  });

  return wss;
}
