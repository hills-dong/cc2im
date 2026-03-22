import http from "http";
import { handleApi } from "../src/api.js";
import type { ApiContext } from "../src/api.js";

/**
 * Create a minimal HTTP server that only handles /api/* routes.
 * Replacement for the deleted createServer — used only in tests.
 */
export function createTestApiServer(ctx: ApiContext): Promise<http.Server> {
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
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}
