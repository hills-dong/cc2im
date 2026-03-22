import http from "http";
import { createReadStream, existsSync, statSync } from "fs";
import { join, extname, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { handleApi } from "@cc2im/server/api";
import type { ApiContext } from "@cc2im/server/api";
import type { Store, AppConfig, TokenStats } from "@cc2im/core";
import type {
  PlatformAdapter, IncomingMessage, Reaction, ProjectConfig, ChannelInfo, Platform,
} from "@cc2im/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface WebAdapterOptions {
  port: number;
  bind: string;
  configPath: string;
  store: Store;
  config: AppConfig;
  staticDir?: string;
}

export class WebAdapter implements PlatformAdapter {
  readonly platform: Platform = "web";

  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private messageHandler?: (msg: IncomingMessage) => void;
  private reactionHandler?: (reaction: Reaction) => void;
  private abortHandler?: (threadKey: string) => void;

  // Per-thread subscriptions: only subscribed clients receive stream events
  private subscriptions = new Map<string, Set<WebSocket>>();

  // Track the latest streaming content per thread for reconnect recovery
  private streamBuffers = new Map<string, string>();

  // Track messageId → threadId for editMessage routing
  private messageThreadMap = new Map<string, string>();

  constructor(private options: WebAdapterOptions) {}

  async start(): Promise<void> {
    const { port, bind, configPath, store, config } = this.options;

    // Auto-detect UI dist directory
    let staticDir = this.options.staticDir;
    if (!staticDir) {
      const candidates = [
        join(__dirname, "../../../ui/dist"),       // from cli/src/adapters/
        join(__dirname, "../../../../ui/dist"),     // fallback
      ];
      for (const candidate of candidates) {
        if (existsSync(candidate)) { staticDir = candidate; break; }
      }
    }

    const ctx: ApiContext = { config, configPath, store };

    this.server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      if (url.startsWith("/api/")) {
        handleApi(req, res, ctx).catch((err: unknown) => {
          console.error("API error:", err);
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }));
          }
        });
        return;
      }
      if (staticDir) {
        serveStatic(res, staticDir, url);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    // Attach WebSocket
    this.wss = new WebSocketServer({ server: this.server, path: "/ws" });

    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);

      ws.on("message", (data) => {
        let msg: { type: string; [key: string]: unknown };
        try {
          msg = JSON.parse(data.toString());
        } catch {
          this.send(ws, { type: "error", error: { code: "INVALID_JSON", message: "Invalid JSON" } });
          return;
        }

        switch (msg.type) {
          case "chat.send": {
            const project = msg.project as string;
            const message = msg.message as string;
            const threadKey = (msg.threadKey as string) || null;
            const channelId = `wb_${project}`;

            // Auto-subscribe sender to this thread's events
            if (threadKey) {
              this.subscribe(ws, threadKey);
            }

            this.messageHandler?.({
              platform: "web",
              channelId,
              threadId: threadKey,
              messageId: `web-user-${Date.now()}`,
              userId: "web-user",
              userName: "web",
              content: message,
              attachments: [],
            });
            break;
          }

          case "chat.subscribe": {
            const threadKey = msg.threadKey as string;
            if (threadKey) {
              this.subscribe(ws, threadKey);

              // If there's an active stream, send buffered content for recovery
              const buffered = this.streamBuffers.get(threadKey);
              if (buffered !== undefined) {
                // Find the messageId for this thread's active stream
                let activeMessageId: string | undefined;
                for (const [mid, tid] of this.messageThreadMap) {
                  if (tid === threadKey) { activeMessageId = mid; break; }
                }
                this.send(ws, {
                  type: "chat.recover",
                  threadId: threadKey,
                  messageId: activeMessageId,
                  content: buffered,
                });
              }
            }
            break;
          }

          case "chat.abort": {
            const threadKey = msg.threadKey as string;
            if (threadKey) {
              this.abortHandler?.(threadKey);
            }
            break;
          }

          case "sync.state": {
            this.send(ws, { type: "sync.state", activeSessions: [], bufferedOutput: {} });
            break;
          }

          default:
            this.send(ws, { type: "error", error: { code: "UNKNOWN_TYPE", message: `Unknown: ${msg.type}` } });
        }
      });

      ws.on("close", () => {
        this.removeClient(ws);
      });

      ws.on("error", () => {
        this.removeClient(ws);
      });
    });

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) client.ping();
      }
    }, 30_000);
    this.wss.on("close", () => clearInterval(heartbeatInterval));

    // Listen
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(port, bind, () => {
        console.log(`cc2im web UI available at http://${bind}:${port}`);
        resolve();
      });
      this.server!.once("error", reject);
    });
  }

  async stop(): Promise<void> {
    this.wss?.close();
    this.server?.close();
  }

  async setupProject(project: ProjectConfig): Promise<ChannelInfo> {
    return { channelId: `wb_${project.name}`, platform: "web", projectName: project.name };
  }

  async createThread(channelId: string, _messageId: string): Promise<string> {
    const project = channelId.replace("wb_", "");
    return `wb_${project}:${Date.now()}`;
  }

  async getThreadName(_threadId: string): Promise<string> {
    return "";
  }

  async renameThread(_threadId: string, _name: string): Promise<void> {
    // No-op for web
  }

  async sendMessage(_channelId: string, threadId: string, content: string): Promise<string> {
    const messageId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.messageThreadMap.set(messageId, threadId);
    // Populate stream buffer immediately so recovery works even before first editMessage
    this.streamBuffers.set(threadId, content);
    this.sendToThread(threadId, {
      type: "chat.message",
      threadId,
      messageId,
      content,
    });
    return messageId;
  }

  async editMessage(_channelId: string, messageId: string, content: string): Promise<void> {
    const threadId = this.messageThreadMap.get(messageId);
    if (threadId) {
      // Update stream buffer for reconnect recovery
      this.streamBuffers.set(threadId, content);

      this.sendToThread(threadId, {
        type: "chat.update",
        threadId,
        messageId,
        content,
      });
    }
  }

  async uploadFile(_channelId: string, threadId: string, filename: string, content: Buffer): Promise<void> {
    this.sendToThread(threadId, {
      type: "chat.file",
      threadId,
      filename,
      content: content.toString("base64"),
    });
  }

  async addReaction(_channelId: string, _messageId: string, _emoji: string): Promise<void> {
    // No-op for web
  }

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  onReaction(handler: (reaction: Reaction) => void): void {
    this.reactionHandler = handler;
  }

  onAbort(handler: (threadKey: string) => void): void {
    this.abortHandler = handler;
  }

  /** Send completion signal with token stats (called after handleMessage finishes) */
  sendDone(threadId: string, tokens: TokenStats): void {
    this.streamBuffers.delete(threadId);
    this.sendToThread(threadId, { type: "chat.done", threadId, tokens });
  }

  /** Notify sidebar of new/updated session */
  sendSessionUpdate(project: string, threadId: string, name: string): void {
    this.broadcast({ type: "session.update", project, threadKey: threadId, name });
  }

  /** Send error signal (called when handleMessage throws) */
  sendError(threadId: string, error: string): void {
    this.streamBuffers.delete(threadId);
    this.sendToThread(threadId, { type: "chat.error", threadId, error: { code: "INVOKE_ERROR", message: error } });
  }

  private subscribe(ws: WebSocket, threadKey: string): void {
    if (!this.subscriptions.has(threadKey)) {
      this.subscriptions.set(threadKey, new Set());
    }
    this.subscriptions.get(threadKey)!.add(ws);
  }

  private removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
    for (const [key, subs] of this.subscriptions) {
      subs.delete(ws);
      if (subs.size === 0) this.subscriptions.delete(key);
    }
  }

  private send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  /** Send to thread subscribers, falling back to broadcast if none subscribed */
  private sendToThread(threadId: string, msg: unknown): void {
    const subs = this.subscriptions.get(threadId);
    if (subs && subs.size > 0) {
      const data = JSON.stringify(msg);
      for (const client of subs) {
        if (client.readyState === WebSocket.OPEN) client.send(data);
      }
    } else {
      this.broadcast(msg);
    }
  }

  private broadcast(msg: unknown): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }
}

function serveStatic(res: http.ServerResponse, staticDir: string, urlPath: string): void {
  let filePath = resolve(staticDir, urlPath === "/" ? "index.html" : "." + urlPath);
  if (!filePath.startsWith(resolve(staticDir) + "/") && filePath !== resolve(staticDir, "index.html")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  let target: string;
  try {
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      target = filePath;
    } else {
      target = join(staticDir, "index.html");
    }
  } catch {
    target = join(staticDir, "index.html");
  }

  if (!existsSync(target)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(target);
  const mime = MIME_TYPES[ext] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  createReadStream(target)
    .on("error", () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    })
    .pipe(res);
}
