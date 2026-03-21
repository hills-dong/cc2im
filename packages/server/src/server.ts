import http from "http";
import { createReadStream, existsSync, statSync } from "fs";
import { join, extname, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { loadConfig } from "@cc2im/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { Store } from "@cc2im/core";
import { handleApi } from "./api.js";
import type { ApiContext } from "./api.js";

export interface ServerOptions {
  port: number;
  bind: string;
  configPath: string;
  dbPath: string;
  staticDir?: string;
  store?: Store;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(
  res: http.ServerResponse,
  staticDir: string,
  urlPath: string,
): void {
  let filePath = resolve(staticDir, urlPath === "/" ? "index.html" : "." + urlPath);
  // Prevent path traversal: ensure resolved path stays within staticDir
  if (!filePath.startsWith(resolve(staticDir) + "/") && filePath !== resolve(staticDir, "index.html")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Try the exact file first, then SPA fallback to index.html
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
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end();
    })
    .pipe(res);
}

export function createServer(options: ServerOptions): Promise<http.Server> {
  const { port, bind, configPath, dbPath } = options;

  // Auto-detect UI dist directory if not explicitly set
  let staticDir = options.staticDir;
  if (!staticDir) {
    const uiDist = join(__dirname, "../../ui/dist");
    if (existsSync(uiDist)) staticDir = uiDist;
  }

  const config = loadConfig(configPath);
  const store = options.store ?? new Store(dbPath);

  const ctx: ApiContext = { config, configPath, store };

  const server = http.createServer((req, res) => {
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

  return new Promise((resolve, reject) => {
    server.listen(port, bind, () => resolve(server));
    server.once("error", reject);
  });
}
