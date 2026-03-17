import { WebSocketServer, WebSocket } from "ws";
import type http from "http";
import type { AppConfig, StreamEvent } from "@cc2im/core";
import type { Store } from "@cc2im/core";
import type { SessionManager } from "@cc2im/core";
import { verifyToken } from "./auth.js";

export interface WsContext {
  config: AppConfig;
  store: Store;
  sessionManager: SessionManager;
  skipAuth?: boolean;
  jwtSecret?: string;
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
  payload: { project: string; message: string; sessionId?: string; model?: string; threadKey?: string },
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
  let threadKey = payload.threadKey ?? `web:${payload.project}:${Date.now()}`;
  // If client sends a sessionId that looks like a thread_id, use it as threadKey
  if (!payload.threadKey && sessionId && sessionId.startsWith("web:")) {
    threadKey = sessionId;
  }

  try {
    // Save user message and create/update thread
    const userMsgId = `web-${threadKey}-user-${Date.now()}`;
    ctx.store.saveMessage(userMsgId, "web", threadKey, false, payload.message.slice(0, 200));

    // Resolve the real Claude session ID for --resume
    let claudeSessionId: string | null = null;
    const existingThread = ctx.store.getThread(threadKey, "web");
    if (existingThread && existingThread.session_id && !existingThread.session_id.startsWith("web:")) {
      // Existing thread with a real Claude session ID — resume it
      claudeSessionId = existingThread.session_id;
    }

    // Create thread if new (don't overwrite session_id on existing threads)
    if (!existingThread) {
      ctx.store.upsertThread(threadKey, "web", `web:${payload.project}`, "", payload.project, payload.message.slice(0, 50));
    }

    const result = await sessionManager.invoke(
      threadKey,
      project.directory,
      claudeSessionId,
      payload.message,
      (event: StreamEvent) => {
        // Transform raw StreamEvents into the flat format the client expects
        if (event.type === "assistant" && "message" in event) {
          const msg = (event as any).message;
          if (msg?.content) {
            for (const block of msg.content) {
              if (block.type === "text" && block.text) {
                broadcast(clients, {
                  type: "chat.stream",
                  sessionId: threadKey,
                  contentType: "text",
                  content: block.text,
                });
              }
            }
          }
        }
      },
      undefined,
      undefined,
      payload.model ?? project.model,
    );

    // Save token usage to database
    if (result.inputTokens > 0 || result.outputTokens > 0) {
      ctx.store.saveTokenUsage(
        threadKey,
        payload.project,
        payload.model ?? null,
        result.inputTokens,
        result.outputTokens,
        result.cacheReadTokens,
        result.cacheCreationTokens,
      );
    }

    broadcast(clients, {
      type: "chat.done",
      sessionId: threadKey,
      realSessionId: result.sessionId || null,
      result: result.text,
      tokens: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    });

    // Save assistant message and update thread with real session ID
    const botMsgId = `web-${threadKey}-bot-${Date.now()}`;
    ctx.store.saveMessage(botMsgId, "web", threadKey, true, result.text.slice(0, 200), result.inputTokens, result.outputTokens);
    ctx.store.upsertThread(threadKey, "web", `web:${payload.project}`, result.sessionId || "", payload.project);

    // Notify sidebar of new/updated session (deferred to next tick to avoid racing with chat.done handlers)
    setTimeout(() => {
      broadcast(clients, {
        type: "session.update",
        project: payload.project,
        threadKey,
        name: payload.message.slice(0, 50),
      });
    }, 0);
  } catch (err: unknown) {
    broadcast(clients, {
      type: "chat.error",
      sessionId: threadKey,
      error: {
        code: "INVOKE_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

export function attachWebSocket(server: http.Server, ctx: WsContext): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    verifyClient: (info, cb) => {
      if (ctx.skipAuth) return cb(true);
      // Check token from query string: /ws?token=xxx
      const url = new URL(info.req.url ?? "/", "http://localhost");
      const token = url.searchParams.get("token");
      if (token && ctx.jwtSecret && verifyToken(token, ctx.jwtSecret)) {
        cb(true);
      } else {
        cb(false, 401, "Unauthorized");
      }
    },
  });
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
            threadKey: msg.threadKey as string | undefined,
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
