import type http from "http";
import type { AppConfig } from "@cc2im/core";
import { loadConfig, saveConfig, addProject, removeProject } from "@cc2im/core";
import type { Store } from "@cc2im/core";
import type { ApiError, ProjectBody } from "./contracts/api.js";

export interface ApiContext {
  config: AppConfig;
  configPath: string;
  store: Store;
}

function json(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function error(
  res: http.ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  const payload: ApiError = { error: { code, message } };
  json(res, status, payload);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function maskConfig(config: AppConfig): unknown {
  const masked = structuredClone(config) as AppConfig & {
    discord?: { token?: string };
    lark?: { appSecret?: string };
  };
  if (masked.discord?.token !== undefined) {
    masked.discord.token = "***";
  }
  if (masked.lark?.appSecret !== undefined) {
    masked.lark.appSecret = "***";
  }
  return masked;
}

export async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: ApiContext,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;
  const method = req.method ?? "GET";

  // GET /api/config
  if (method === "GET" && pathname === "/api/config") {
    return json(res, 200, maskConfig(ctx.config));
  }

  // PUT /api/config
  if (method === "PUT" && pathname === "/api/config") {
    const body = await readBody(req);
    let parsed: Partial<AppConfig>;
    try {
      parsed = JSON.parse(body) as Partial<AppConfig>;
    } catch {
      return error(res, 400, "VALIDATION_ERROR", "Invalid JSON body");
    }
    Object.assign(ctx.config, parsed);
    saveConfig(ctx.configPath, ctx.config);
    return json(res, 200, maskConfig(ctx.config));
  }

  // GET /api/projects
  if (method === "GET" && pathname === "/api/projects") {
    return json(res, 200, ctx.config.projects);
  }

  // POST /api/projects
  if (method === "POST" && pathname === "/api/projects") {
    const body = await readBody(req);
    let parsed: Partial<ProjectBody>;
    try {
      parsed = body ? (JSON.parse(body) as Partial<ProjectBody>) : {};
    } catch {
      return error(res, 400, "VALIDATION_ERROR", "Invalid JSON body");
    }
    if (!parsed.name || !parsed.directory) {
      return error(
        res,
        400,
        "VALIDATION_ERROR",
        "name and directory are required",
      );
    }
    const project = {
      name: parsed.name,
      directory: parsed.directory,
      ...(parsed.model !== undefined ? { model: parsed.model } : {}),
      platforms: parsed.platforms ?? {},
    };
    addProject(ctx.config, project);
    saveConfig(ctx.configPath, ctx.config);
    return json(res, 201, project);
  }

  // PUT /api/projects/:name
  const projectPutMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (method === "PUT" && projectPutMatch) {
    const name = decodeURIComponent(projectPutMatch[1]);
    const idx = ctx.config.projects.findIndex((p) => p.name === name);
    if (idx < 0) {
      return error(res, 404, "NOT_FOUND", `Project '${name}' not found`);
    }
    const body = await readBody(req);
    let parsed: Partial<ProjectBody>;
    try {
      parsed = JSON.parse(body) as Partial<ProjectBody>;
    } catch {
      return error(res, 400, "VALIDATION_ERROR", "Invalid JSON body");
    }
    const updated = { ...ctx.config.projects[idx], ...parsed };
    ctx.config.projects[idx] = updated;
    saveConfig(ctx.configPath, ctx.config);
    return json(res, 200, updated);
  }

  // DELETE /api/projects/:name
  const projectDeleteMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (method === "DELETE" && projectDeleteMatch) {
    const name = decodeURIComponent(projectDeleteMatch[1]);
    removeProject(ctx.config, name);
    saveConfig(ctx.configPath, ctx.config);
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /api/sessions?project=xxx
  if (method === "GET" && pathname === "/api/sessions") {
    const project = url.searchParams.get("project") ?? undefined;
    return json(res, 200, ctx.store.listSessions(project));
  }

  // GET /api/stats/tokens?project=xxx or ?session=xxx
  if (method === "GET" && pathname === "/api/stats/tokens") {
    const project = url.searchParams.get("project");
    const session = url.searchParams.get("session");
    if (session) {
      const stats = ctx.store.getSessionTokens(session);
      return json(res, 200, stats);
    }
    if (project) {
      const stats = ctx.store.getProjectTokens(project);
      return json(res, 200, stats);
    }
    return error(
      res,
      400,
      "VALIDATION_ERROR",
      "project or session query param required",
    );
  }

  // Unknown /api/* routes → 404
  return error(res, 404, "NOT_FOUND", `Route not found: ${method} ${pathname}`);
}
