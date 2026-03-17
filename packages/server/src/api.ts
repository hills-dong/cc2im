import type http from "http";
import { execFile } from "child_process";
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

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      data += chunk;
    });
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
    // Only allow known top-level config keys to prevent prototype pollution
    const allowedKeys = ["discord", "lark", "projects", "claude", "formatter"] as const;
    for (const key of allowedKeys) {
      if (key in parsed) {
        (ctx.config as any)[key] = (parsed as any)[key];
      }
    }
    // Preserve masked secrets — don't overwrite real values with "***"
    if (ctx.config.discord?.token === "***") {
      ctx.config.discord.token = loadConfig(ctx.configPath).discord?.token ?? "";
    }
    if (ctx.config.lark?.appSecret === "***") {
      ctx.config.lark.appSecret = loadConfig(ctx.configPath).lark?.appSecret ?? "";
    }
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

  // GET /api/stats/overview?window=24h|7d|all
  if (method === "GET" && pathname === "/api/stats/overview") {
    const windowParam = url.searchParams.get("window");
    if (!windowParam || !["24h", "7d", "all"].includes(windowParam)) {
      return error(res, 400, "VALIDATION_ERROR", "window must be 24h, 7d, or all");
    }
    let since: string | null = null;
    if (windowParam === "24h") {
      since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    } else if (windowParam === "7d") {
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    const rows = ctx.store.getOverviewTokens(since);

    const zeroTotals = () => ({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });
    const projectMap = new Map<string, { total: ReturnType<typeof zeroTotals>; sessions: Array<{
      sessionId: string; platform: string | null; name: string | null;
      createdAt: string | null; total: ReturnType<typeof zeroTotals>;
    }> }>();

    const grandTotal = zeroTotals();
    for (const row of rows) {
      if (!projectMap.has(row.projectName)) {
        projectMap.set(row.projectName, { total: zeroTotals(), sessions: [] });
      }
      const proj = projectMap.get(row.projectName)!;
      const sessionTotal = {
        input: row.inputTokens,
        output: row.outputTokens,
        cacheRead: row.cacheReadTokens,
        cacheCreation: row.cacheCreationTokens,
      };
      proj.sessions.push({
        sessionId: row.sessionId,
        platform: row.platform,
        name: row.sessionName,
        createdAt: row.sessionCreatedAt,
        total: sessionTotal,
      });
      proj.total.input += row.inputTokens;
      proj.total.output += row.outputTokens;
      proj.total.cacheRead += row.cacheReadTokens;
      proj.total.cacheCreation += row.cacheCreationTokens;
      grandTotal.input += row.inputTokens;
      grandTotal.output += row.outputTokens;
      grandTotal.cacheRead += row.cacheReadTokens;
      grandTotal.cacheCreation += row.cacheCreationTokens;
    }

    const projects = [...projectMap.entries()]
      .sort((a, b) => (b[1].total.input + b[1].total.output) - (a[1].total.input + a[1].total.output))
      .map(([name, data]) => ({ name, ...data }));

    return json(res, 200, { window: windowParam, total: grandTotal, projects });
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
      const aggregate = ctx.store.getProjectTokens(project);
      const dailyRaw = ctx.store.getDailyTokens(project);
      const stats = {
        totalInput: aggregate.inputTokens,
        totalOutput: aggregate.outputTokens,
        totalCache: aggregate.cacheReadTokens + aggregate.cacheCreationTokens,
        daily: dailyRaw.map(d => ({
          date: d.date,
          model: d.model,
          input: d.inputTokens,
          output: d.outputTokens,
          cache: d.cacheReadTokens + d.cacheCreationTokens,
        })),
      };
      return json(res, 200, stats);
    }
    return error(
      res,
      400,
      "VALIDATION_ERROR",
      "project or session query param required",
    );
  }

  // GET /api/sessions/:id/messages
  const sessMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
  if (method === "GET" && sessMatch) {
    const threadId = decodeURIComponent(sessMatch[1]);
    const messages = ctx.store.getMessagesByThread(threadId, "web");
    return json(res, 200, messages);
  }

  // POST /api/claude/test — verify the claude CLI command works
  if (method === "POST" && pathname === "/api/claude/test") {
    const body = await readBody(req);
    let parsed: { command?: string };
    try {
      parsed = JSON.parse(body) as { command?: string };
    } catch {
      return error(res, 400, "VALIDATION_ERROR", "Invalid JSON body");
    }
    const cmd = ctx.config.claude?.command || parsed.command || "claude";
    return new Promise<void>((resolve) => {
      execFile(cmd, ["--print-system-prompt"], { timeout: 10000 }, (err, stdout) => {
        if (err) {
          error(res, 500, "CLAUDE_TEST_FAILED", `Command failed: ${err.message}`);
        } else {
          json(res, 200, { ok: true, output: stdout.slice(0, 200) });
        }
        resolve();
      });
    });
  }

  // Unknown /api/* routes → 404
  return error(res, 404, "NOT_FOUND", `Route not found: ${method} ${pathname}`);
}
