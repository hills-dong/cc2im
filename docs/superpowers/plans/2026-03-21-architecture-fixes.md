# Architecture Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 architectural issues in cc2im, ordered by priority: dual instance state split, broadcast isolation, core/discord coupling, config magic value, hand-written routing, sync file serving.

**Architecture:** Each fix is a self-contained refactor that preserves existing behavior while fixing a specific architectural problem. All fixes are backward-compatible — no API contract changes, no DB migrations.

**Tech Stack:** TypeScript, Node.js http/ws, better-sqlite3, SvelteKit

---

## File Structure

| Fix | Files Modified | Files Created |
|-----|---------------|---------------|
| #1 Dependency Injection | `packages/server/src/server.ts`, `packages/cli/src/cli.ts` | — |
| #2 WS Subscription | `packages/server/src/ws.ts`, `packages/ui/src/lib/stores/connection.ts` | — |
| #3 Move DiscordAdapter | `packages/cli/src/index.ts`, `packages/core/src/index.ts`, `packages/core/package.json`, `packages/cli/package.json` | `packages/cli/src/adapters/discord.ts` |
| #4 Config PUT | `packages/server/src/api.ts` | — |
| #5 Route Matcher | `packages/server/src/api.ts` | — |
| #6 Async Static | `packages/server/src/server.ts` | — |

---

### Task 1: Server Dependency Injection (P1-#2)

**Problem:** `createServer()` in `server.ts` creates its own `Store` and `SessionManager`. When CLI's `main()` also creates them, Discord and Web sides have separate instances — causing state split and inconsistent token tracking.

**Files:**
- Modify: `packages/server/src/server.ts:13-19` (ServerOptions interface), `packages/server/src/server.ts:65-109` (createServer function)
- Modify: `packages/cli/src/cli.ts:45-67` (web command)

- [ ] **Step 1: Extend ServerOptions to accept optional injected deps**

In `packages/server/src/server.ts`, add optional `store` and `sessionManager` fields to the `ServerOptions` interface, and use them in `createServer()` if provided:

```typescript
// In ServerOptions interface, add:
export interface ServerOptions {
  port: number;
  bind: string;
  configPath: string;
  dbPath: string;
  staticDir?: string;
  skipAuth?: boolean;
  store?: Store;              // NEW: injected store (avoids dual instance)
  sessionManager?: SessionManager;  // NEW: injected session manager
}
```

In `createServer()`, change the instance creation to prefer injected deps:

```typescript
// Replace:
//   const config = loadConfig(configPath);
//   const store = new Store(dbPath);
// With:
const config = loadConfig(configPath);
const store = options.store ?? new Store(dbPath);
```

And similarly for `sessionManager`:

```typescript
// Replace:
//   const sessionManager = new SessionManager(config.claude, config.formatter);
// With:
const sessionManager = options.sessionManager ?? new SessionManager(config.claude, config.formatter);
```

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `cd packages/server && npm test`
Expected: All tests pass (they use `createServer()` without injected deps, which now falls back to creating its own — preserving existing behavior).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "refactor(server): accept injected Store/SessionManager in createServer"
```

---

### Task 2: WebSocket Subscription Isolation (P1-#4)

**Problem:** `ws.ts` broadcasts all `chat.stream` / `chat.done` events to every connected WebSocket client. Multi-user scenarios leak messages across sessions.

**Design:** Each client sends a `chat.subscribe` message with a `threadKey`. The server maintains a `Map<threadKey, Set<WebSocket>>`. Stream/done events are sent only to subscribed clients. Global events (`session.update`, `sync.state`) are still broadcast to all.

**Files:**
- Modify: `packages/server/src/ws.ts:36-152` (handleChatSend + attachWebSocket)
- Modify: `packages/ui/src/lib/stores/chat.ts` (send subscribe after chat.send)
- Modify: `packages/ui/src/lib/stores/connection.ts` (no changes needed — generic send/on still works)

- [ ] **Step 1: Add subscription tracking to ws.ts**

In `packages/server/src/ws.ts`, inside `attachWebSocket()`, add a subscriptions map and a `subscribe` helper. Change `broadcast` in `handleChatSend` to only send to subscribed clients. Keep the global `broadcast` for `session.update`.

After `const clients = new Set<WebSocket>();` (line 170), add:

```typescript
// Per-threadKey subscription: only send stream/done/error to subscribers
const subscriptions = new Map<string, Set<WebSocket>>();

function subscribe(ws: WebSocket, threadKey: string): void {
  if (!subscriptions.has(threadKey)) subscriptions.set(threadKey, new Set());
  subscriptions.get(threadKey)!.add(ws);
}

function sendToSubscribers(threadKey: string, msg: unknown): void {
  const subs = subscriptions.get(threadKey);
  if (subs) {
    const data = JSON.stringify(msg);
    for (const client of subs) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }
}
```

- [ ] **Step 2: Replace broadcast with sendToSubscribers for chat events**

In `handleChatSend()`, replace all `broadcast(clients, ...)` calls for `chat.stream`, `chat.done`, and `chat.error` with `sendToSubscribers(threadKey, ...)`. Keep the `session.update` broadcast as-is (it goes to all clients for sidebar updates).

The function signature needs to accept `subscriptions` — the simplest approach is to add it to the `handleChatSend` parameters. But since `handleChatSend` is a file-level function, change it to also accept `subscriptions` and `subscribe`:

```typescript
async function handleChatSend(
  ws: WebSocket,
  clients: Set<WebSocket>,
  subscriptions: Map<string, Set<WebSocket>>,
  ctx: WsContext,
  payload: { project: string; message: string; sessionId?: string; model?: string; threadKey?: string },
): Promise<void> {
```

Inside: auto-subscribe the sender at the start:

```typescript
// After threadKey is resolved (line ~55):
if (!subscriptions.has(threadKey)) subscriptions.set(threadKey, new Set());
subscriptions.get(threadKey)!.add(ws);
```

Replace `broadcast(clients, { type: "chat.stream", ... })` with:

```typescript
sendToSubscribers(threadKey, { type: "chat.stream", sessionId: threadKey, contentType: "text", content: block.text });
```

Replace `broadcast(clients, { type: "chat.done", ... })` with:

```typescript
sendToSubscribers(threadKey, { type: "chat.done", ... });
```

Replace `broadcast(clients, { type: "chat.error", ... })` with:

```typescript
sendToSubscribers(threadKey, { type: "chat.error", ... });
```

Keep: `broadcast(clients, { type: "session.update", ... })` — this stays as broadcast.

- [ ] **Step 3: Handle chat.subscribe message type and cleanup on disconnect**

In the `switch (msg.type)` block inside `attachWebSocket`, add a `chat.subscribe` case:

```typescript
case "chat.subscribe": {
  const threadKey = msg.threadKey as string;
  if (threadKey) {
    if (!subscriptions.has(threadKey)) subscriptions.set(threadKey, new Set());
    subscriptions.get(threadKey)!.add(ws);
  }
  break;
}
```

In the `ws.on("close")` handler, clean up subscriptions:

```typescript
ws.on("close", () => {
  clients.delete(ws);
  // Clean up subscriptions
  for (const [key, subs] of subscriptions) {
    subs.delete(ws);
    if (subs.size === 0) subscriptions.delete(key);
  }
});
```

Same cleanup in `ws.on("error")`.

- [ ] **Step 4: Update handleChatSend call site**

In the `case "chat.send"` block, update the call to pass subscriptions:

```typescript
case "chat.send": {
  handleChatSend(ws, clients, subscriptions, ctx, { ... }).catch(...);
  break;
}
```

- [ ] **Step 5: Update UI chat store to subscribe**

In `packages/ui/src/lib/stores/chat.ts`, find where `chat.send` is sent. After sending `chat.send`, also send a `chat.subscribe`:

```typescript
// After send({ type: "chat.send", ... }):
send({ type: "chat.subscribe", threadKey: threadKey });
```

Also send `chat.subscribe` when navigating to an existing session (loading message history):

```typescript
// When entering a session page, subscribe to its threadKey
send({ type: "chat.subscribe", threadKey: currentThreadKey });
```

- [ ] **Step 6: Run tests**

Run: `cd packages/server && npm test`
Expected: Existing WS tests still pass. `handleChatSend` auto-subscribes the sender, so tests that send `chat.send` and read back `chat.done` still work without explicit subscribe.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/ws.ts packages/ui/src/lib/stores/chat.ts
git commit -m "feat(server): scope WS chat events to subscribed clients only"
```

---

### Task 3: Move DiscordAdapter out of core (P2-#1)

**Problem:** `@cc2im/core` has a runtime dependency on `discord.js` (~50MB). Core should be platform-agnostic — it defines `PlatformAdapter` interface, not implementations.

**Design:** Move `packages/core/src/adapters/discord.ts` to `packages/cli/src/adapters/discord.ts`. Remove `discord.js` from core's `dependencies`. Move it to cli's `dependencies`. Update imports.

**Files:**
- Move: `packages/core/src/adapters/discord.ts` → `packages/cli/src/adapters/discord.ts`
- Modify: `packages/core/src/index.ts` (remove DiscordAdapter export)
- Modify: `packages/core/package.json` (remove discord.js from dependencies)
- Modify: `packages/cli/package.json` (move discord.js from devDependencies to dependencies)
- Modify: `packages/cli/src/index.ts` (import from local path instead of @cc2im/core)

- [ ] **Step 1: Copy the adapter file**

Copy `packages/core/src/adapters/discord.ts` to `packages/cli/src/adapters/discord.ts`. Update the import path for types:

```typescript
// Change:
//   import type { PlatformAdapter, ... } from "../types.js";
// To:
import type { PlatformAdapter, IncomingMessage, Reaction, ProjectConfig, ChannelInfo, Platform } from "@cc2im/core";
```

- [ ] **Step 2: Remove from core**

In `packages/core/src/index.ts`, remove the line:
```typescript
export { DiscordAdapter } from "./adapters/discord.js";
```

Delete the file `packages/core/src/adapters/discord.ts`.

In `packages/core/package.json`, remove `"discord.js": "^14.16.0"` from `dependencies`.

- [ ] **Step 3: Update cli package.json**

In `packages/cli/package.json`, move `"discord.js": "^14.16.0"` from `devDependencies` to `dependencies`.

- [ ] **Step 4: Update cli imports**

In `packages/cli/src/index.ts`, change:

```typescript
// From:
import {
  loadConfig, saveConfig, addProject, removeProject,
  Store, THREAD_STATUS_ICONS, type ThreadStatus,
  SessionManager, Formatter, Router, DiscordAdapter,
  type PlatformAdapter, type IncomingMessage, type Reaction,
} from "@cc2im/core";

// To:
import {
  loadConfig, saveConfig, addProject, removeProject,
  Store, THREAD_STATUS_ICONS, type ThreadStatus,
  SessionManager, Formatter, Router,
  type PlatformAdapter, type IncomingMessage, type Reaction,
} from "@cc2im/core";
import { DiscordAdapter } from "./adapters/discord.js";
```

- [ ] **Step 5: Update test imports if any reference DiscordAdapter from core**

Check `packages/core/tests/discord.test.ts` — if it tests DiscordAdapter, move it to `packages/cli/tests/` and update imports. If it only tests the interface/types, leave it.

- [ ] **Step 6: Build and test**

Run: `npm run build && cd packages/core && npm test && cd ../cli && npm test`
Expected: All pass. Core no longer depends on discord.js.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/index.ts packages/core/package.json packages/cli/src/adapters/discord.ts packages/cli/src/index.ts packages/cli/package.json
git rm packages/core/src/adapters/discord.ts
git commit -m "refactor: move DiscordAdapter from core to cli, remove discord.js from core"
```

---

### Task 4: Config PUT — Remove Magic Value (P2-#6)

**Problem:** `api.ts` PUT /api/config checks if `discord.token === "***"` to decide whether to preserve the original secret. This magic value is fragile.

**Design:** Use a merge strategy: for each secret field, if the incoming value is `undefined` (key not present in body), keep the existing value. The frontend should simply omit secret fields it doesn't intend to change, or send `null` to clear them.

**Files:**
- Modify: `packages/server/src/api.ts:82-106`

- [ ] **Step 1: Replace magic value check with undefined-based preservation**

In `packages/server/src/api.ts`, replace the PUT /api/config handler (lines 82-106):

```typescript
// PUT /api/config
if (method === "PUT" && pathname === "/api/config") {
  const body = await readBody(req);
  let parsed: Partial<AppConfig>;
  try {
    parsed = JSON.parse(body) as Partial<AppConfig>;
  } catch {
    return error(res, 400, "VALIDATION_ERROR", "Invalid JSON body");
  }
  const allowedKeys = ["discord", "lark", "projects", "claude", "formatter"] as const;
  for (const key of allowedKeys) {
    if (key in parsed) {
      (ctx.config as any)[key] = (parsed as any)[key];
    }
  }
  // Preserve secrets: if incoming value is "***" or undefined, keep original
  const originalConfig = loadConfig(ctx.configPath);
  if (!parsed.discord?.token || parsed.discord.token === "***") {
    if (ctx.config.discord) ctx.config.discord.token = originalConfig.discord?.token ?? "";
  }
  if (!parsed.lark?.appSecret || parsed.lark.appSecret === "***") {
    if (ctx.config.lark) ctx.config.lark.appSecret = originalConfig.lark?.appSecret ?? "";
  }
  saveConfig(ctx.configPath, ctx.config);
  return json(res, 200, maskConfig(ctx.config));
}
```

This preserves backward compat: `"***"` still works (frontend currently sends it), but also handles `undefined`/missing correctly. Over time the frontend can stop sending `"***"`.

- [ ] **Step 2: Run tests**

Run: `cd packages/server && npm test`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/api.ts
git commit -m "fix(api): preserve secrets when value is missing or masked in PUT /api/config"
```

---

### Task 5: Extract Route Matcher (P3-#3)

**Problem:** `api.ts` duplicates regex patterns. `/api/projects/:name` has the same regex written for both PUT and DELETE.

**Design:** Extract a tiny `matchRoute` helper at the top of `api.ts`. No external deps.

**Files:**
- Modify: `packages/server/src/api.ts`

- [ ] **Step 1: Add matchRoute helper and refactor routes**

Add at the top of `api.ts` (after imports):

```typescript
type RouteParams = Record<string, string>;

function matchRoute(
  method: string, pathname: string,
  expectedMethod: string, pattern: string,
): RouteParams | null {
  if (method !== expectedMethod) return null;
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  const match = pathname.match(new RegExp(`^${regexStr}$`));
  if (!match) return null;
  const params: RouteParams = {};
  paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
  return params;
}
```

Then replace the duplicated regex blocks:

```typescript
// Replace:
//   const projectPutMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
//   if (method === "PUT" && projectPutMatch) {
//     const name = decodeURIComponent(projectPutMatch[1]);
// With:
const putParams = matchRoute(method, pathname, "PUT", "/api/projects/:name");
if (putParams) {
  const name = putParams.name;
  // ... rest unchanged
}

// Replace:
//   const projectDeleteMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
//   if (method === "DELETE" && projectDeleteMatch) {
//     const name = decodeURIComponent(projectDeleteMatch[1]);
// With:
const deleteParams = matchRoute(method, pathname, "DELETE", "/api/projects/:name");
if (deleteParams) {
  const name = deleteParams.name;
  // ... rest unchanged
}
```

Do the same for `/api/sessions/:id/archive` and `/api/sessions/:id/messages`.

- [ ] **Step 2: Run tests**

Run: `cd packages/server && npm test`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/api.ts
git commit -m "refactor(api): extract matchRoute helper, remove duplicate regex patterns"
```

---

### Task 6: Async Static File Serving (P3-#5)

**Problem:** `server.ts` uses `readFileSync` for every static file request, blocking the event loop.

**Design:** Replace with `createReadStream` + pipe. Add a simple in-memory cache for the SPA fallback `index.html` since it's read on every 404.

**Files:**
- Modify: `packages/server/src/server.ts:32-63` (serveStatic function)

- [ ] **Step 1: Replace readFileSync with createReadStream**

In `packages/server/src/server.ts`, replace the `serveStatic` function:

```typescript
import { createReadStream, existsSync, statSync } from "fs";

function serveStatic(
  res: http.ServerResponse,
  staticDir: string,
  urlPath: string,
): void {
  let filePath = resolve(staticDir, urlPath === "/" ? "index.html" : "." + urlPath);
  // Prevent path traversal
  if (!filePath.startsWith(resolve(staticDir) + "/") && filePath !== resolve(staticDir, "index.html")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Try the exact file first, then SPA fallback
  const target = existsSync(filePath) && statSync(filePath).isFile()
    ? filePath
    : join(staticDir, "index.html");

  if (!existsSync(target)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = extname(target);
  const mime = MIME_TYPES[ext] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": mime });
  createReadStream(target).pipe(res);
}
```

Update the import at the top of the file:
```typescript
// Change:
//   import { readFileSync, existsSync } from "fs";
// To:
import { createReadStream, existsSync, statSync } from "fs";
```

- [ ] **Step 2: Run tests**

Run: `cd packages/server && npm test`
Expected: All pass (including server-static.test.ts).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "perf(server): replace readFileSync with createReadStream for static files"
```
