# cc2im 桌面/Web 客户端实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 cc2im 从纯 CLI 服务扩展为 Tauri 桌面 + Web + CLI 三模式应用，共享同一套 Svelte UI 和 Node.js 核心。

**Architecture:** Monorepo 5 包结构（core/server/ui/cli/desktop）。core 包含纯业务逻辑，server 提供 HTTP/WS API 并托管 Svelte 静态文件，cli 保持现有命令行行为并新增 `web` 命令，desktop 是 Tauri 壳启动 Node 子进程。

**Tech Stack:** TypeScript, Tauri 2 (Rust), Svelte 5, Vite, better-sqlite3, ws, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-03-14-desktop-web-client-design.md`

---

## Chunk 1: Monorepo 初始化与 Core 包提取

将现有单包结构重构为 npm workspaces monorepo，把业务逻辑提取为 `@cc2im/core` 包。完成后现有测试全部通过，CLI 行为不变。

### File Structure

```
cc2im/
├── package.json                    # 修改: 添加 workspaces
├── tsconfig.base.json              # 新建: 共享 TS 配置
├── packages/
│   ├── core/
│   │   ├── package.json            # 新建: @cc2im/core
│   │   ├── tsconfig.json           # 新建: 继承 base
│   │   ├── src/
│   │   │   ├── session.ts          # 移动自 src/session.ts
│   │   │   ├── store.ts            # 移动自 src/store.ts
│   │   │   ├── config.ts           # 移动自 src/config.ts
│   │   │   ├── router.ts           # 移动自 src/router.ts
│   │   │   ├── formatter.ts        # 移动自 src/formatter.ts
│   │   │   ├── types.ts            # 移动自 src/types.ts
│   │   │   ├── adapters/
│   │   │   │   ├── adapter.ts      # 移动自 src/adapters/adapter.ts
│   │   │   │   └── discord.ts      # 移动自 src/adapters/discord.ts
│   │   │   └── index.ts            # 新建: barrel export
│   │   └── tests/
│   │       ├── config.test.ts      # 移动自 tests/config.test.ts
│   │       ├── store.test.ts       # 移动自 tests/store.test.ts
│   │       ├── session.test.ts     # 移动自 tests/session.test.ts
│   │       ├── formatter.test.ts   # 移动自 tests/formatter.test.ts
│   │       ├── router.test.ts      # 移动自 tests/router.test.ts
│   │       └── discord.test.ts     # 移动自 tests/discord.test.ts
│   └── cli/
│       ├── package.json            # 新建: cc2im (bin 包)
│       ├── tsconfig.json           # 新建
│       ├── src/
│       │   ├── cli.ts              # 移动自 src/cli.ts
│       │   ├── service.ts          # 移动自 src/service.ts
│       │   └── index.ts            # 移动自 src/index.ts
│       └── tests/
│           ├── service.test.ts     # 移动自 tests/service.test.ts
│           └── title.test.ts       # 移动自 tests/title.test.ts
```

### Task 1: 初始化 monorepo 根配置

**Files:**
- Modify: `package.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: 备份并修改根 package.json**

```json
{
  "name": "cc2im-monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present",
    "dev": "npm run dev --workspace=packages/cli"
  }
}
```

注意: 移除 `main`, `bin`, `type`, `version`, `description`, `dependencies`, `devDependencies` — 这些将迁入子包。

- [ ] **Step 2: 创建 tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json tsconfig.base.json
git commit -m "chore: initialize monorepo root with workspaces"
```

### Task 2: 创建 @cc2im/core 包

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: 创建 core package.json**

```json
{
  "name": "@cc2im/core",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./*": "./dist/*.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "discord.js": "^14.16.0",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 创建 core tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: 移动源文件到 packages/core/src/**

```bash
mkdir -p packages/core/src/adapters
mv src/session.ts packages/core/src/
mv src/store.ts packages/core/src/
mv src/config.ts packages/core/src/
mv src/router.ts packages/core/src/
mv src/formatter.ts packages/core/src/
mv src/types.ts packages/core/src/
mv src/adapters/adapter.ts packages/core/src/adapters/
mv src/adapters/discord.ts packages/core/src/adapters/
```

- [ ] **Step 4: 更新 core 内部 import 路径**

所有 `from "./xxx.js"` 保持不变（相对路径在同包内不变）。
但 `types.ts` 中 `Platform` 类型需更新:

```typescript
// packages/core/src/types.ts — 更新 Platform 类型
export type Platform = "lark" | "discord" | "web";
```

- [ ] **Step 5: 创建 barrel export (packages/core/src/index.ts)**

```typescript
export { SessionManager, type SessionResult } from "./session.js";
export { Store, THREAD_STATUS_ICONS, type ThreadRow, type MessageRow, type ThreadStatus } from "./store.js";
export { loadConfig, saveConfig, addProject, removeProject } from "./config.js";
export { Router } from "./router.js";
export { Formatter } from "./formatter.js";
export { DiscordAdapter } from "./adapters/discord.js";
export type * from "./types.js";
```

- [ ] **Step 6: 移动测试文件到 packages/core/tests/**

```bash
mkdir -p packages/core/tests
mv tests/config.test.ts packages/core/tests/
mv tests/store.test.ts packages/core/tests/
mv tests/session.test.ts packages/core/tests/
mv tests/formatter.test.ts packages/core/tests/
mv tests/router.test.ts packages/core/tests/
mv tests/discord.test.ts packages/core/tests/
```

- [ ] **Step 7: 更新测试文件 import 路径**

每个测试文件: 将 `from "../src/xxx.js"` 改为 `from "../src/xxx.js"`（路径可能不变，但需确认相对路径正确）。

例如 `packages/core/tests/store.test.ts`:
```typescript
// 旧: import { Store } from "../src/store.js";
// 新（相同，因为 tests/ 和 src/ 是兄弟目录）:
import { Store } from "../src/store.js";
```

- [ ] **Step 8: 运行 core 构建和测试**

```bash
cd packages/core
npx tsc --noEmit   # 类型检查
npx vitest run      # 运行测试
```

Expected: 编译零错误，所有测试通过。

- [ ] **Step 9: Commit**

```bash
git add packages/core/
git commit -m "refactor: extract @cc2im/core package"
```

### Task 3: 创建 CLI 包

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Move: `src/cli.ts`, `src/service.ts`, `src/index.ts` → `packages/cli/src/`
- Move: `tests/service.test.ts`, `tests/title.test.ts` → `packages/cli/tests/`

- [ ] **Step 1: 创建 cli package.json**

```json
{
  "name": "cc2im",
  "version": "0.1.0",
  "description": "Claude Code to IM bridge — chat with Claude Code via Lark and Discord",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "cc2im": "dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@cc2im/core": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 创建 cli tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: 移动 CLI 源文件**

```bash
mkdir -p packages/cli/src packages/cli/tests
mv src/cli.ts packages/cli/src/
mv src/service.ts packages/cli/src/
mv src/index.ts packages/cli/src/
mv tests/service.test.ts packages/cli/tests/
mv tests/title.test.ts packages/cli/tests/
```

- [ ] **Step 4: 更新 packages/cli/src/index.ts 的 import**

将所有从 `"./xxx.js"` 导入的核心模块改为从 `"@cc2im/core"` 导入:

```typescript
// 旧:
import { loadConfig, saveConfig, addProject, removeProject } from "./config.js";
import { Store, THREAD_STATUS_ICONS, type ThreadStatus } from "./store.js";
import { SessionManager } from "./session.js";
import { Formatter } from "./formatter.js";
import { Router } from "./router.js";
import { DiscordAdapter } from "./adapters/discord.js";
import type { PlatformAdapter, IncomingMessage, Reaction } from "./types.js";

// 新:
import {
  loadConfig, saveConfig, addProject, removeProject,
  Store, THREAD_STATUS_ICONS, type ThreadStatus,
  SessionManager, Formatter, Router, DiscordAdapter,
  type PlatformAdapter, type IncomingMessage, type Reaction,
} from "@cc2im/core";
```

保留 `import type { ChatInputCommandInteraction } from "discord.js";` — 这个从 discord.js 直接导入。注意 cli 包不直接依赖 discord.js，但 @cc2im/core 导出的类型中包含它。如果 TS 报错，需在 cli 的 devDependencies 中加上 `discord.js`。

- [ ] **Step 5: 更新 packages/cli/src/cli.ts 的 import**

```typescript
// 旧:
import { install, uninstall, start, stop, restart, status, logs } from "./service.js";
// 新（不变，service.ts 在同包内）:
import { install, uninstall, start, stop, restart, status, logs } from "./service.js";
```

- [ ] **Step 6: 更新 packages/cli/tests/ 的 import 路径**

`title.test.ts` 中导入 `generateThreadTitle` 来自 `../src/index.ts` — 确保路径正确:
```typescript
import { generateThreadTitle } from "../src/index.js";
```

`service.test.ts` 导入来自 `../src/service.ts`:
```typescript
import { generateSystemdUnit, generateLaunchdPlist, resolveConfigPath } from "../src/service.js";
```

- [ ] **Step 7: 运行 CLI 构建和测试**

```bash
cd /home/hills/projects/cc2im
npm install  # 安装 workspace 依赖
cd packages/cli
npx tsc --noEmit
npx vitest run
```

Expected: 编译零错误，所有测试通过。

- [ ] **Step 8: Commit**

```bash
git add packages/cli/
git commit -m "refactor: extract cli package, imports from @cc2im/core"
```

### Task 4: 清理根目录

**Files:**
- Remove: `src/` (已空)
- Remove: `tests/` (已空)
- Remove: `tsconfig.json` (被 tsconfig.base.json 替代)
- Modify: `package.json` (确认 workspaces 配置)

- [ ] **Step 1: 删除已空的 src/ 和 tests/ 目录**

```bash
rm -rf src/ tests/ tsconfig.json dist/
```

- [ ] **Step 2: 从根运行全部测试**

```bash
cd /home/hills/projects/cc2im
npm run build
npm run test
```

Expected: core 和 cli 的测试全部通过。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: clean up root after monorepo migration"
```

---

## Chunk 2: Core 增强 — Token 统计与 Store 扩展

在 core 包中新增 `token_usage` 表，扩展 SessionManager 提取 token 数据，扩展 Store 提供 token 统计查询。TDD: 先写测试再写实现。

### Task 5: token_usage 表 — 测试先行

**Files:**
- Create: `packages/core/tests/store-tokens.test.ts`

- [ ] **Step 1: 编写 token_usage Store 测试**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

const TEST_DB = "test-tokens.db";

describe("Store token_usage", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(TEST_DB);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + "-wal"); } catch {}
    try { unlinkSync(TEST_DB + "-shm"); } catch {}
  });

  it("saves and retrieves token usage for a session", () => {
    store.saveTokenUsage("sess-1", "my-project", "claude-opus", 100, 50, 1000, 200);
    store.saveTokenUsage("sess-1", "my-project", "claude-opus", 80, 40, 800, 100);

    const stats = store.getSessionTokens("sess-1");
    expect(stats.inputTokens).toBe(180);
    expect(stats.outputTokens).toBe(90);
    expect(stats.cacheReadTokens).toBe(1800);
    expect(stats.cacheCreationTokens).toBe(300);
  });

  it("aggregates token usage by project", () => {
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 0, 0);
    store.saveTokenUsage("sess-2", "proj-a", "opus", 200, 100, 0, 0);
    store.saveTokenUsage("sess-3", "proj-b", "opus", 300, 150, 0, 0);

    const projA = store.getProjectTokens("proj-a");
    expect(projA.inputTokens).toBe(300);
    expect(projA.outputTokens).toBe(150);

    const projB = store.getProjectTokens("proj-b");
    expect(projB.inputTokens).toBe(300);
  });

  it("returns daily token breakdown for a project", () => {
    store.saveTokenUsage("s1", "proj", "opus", 100, 50, 0, 0);
    const daily = store.getDailyTokens("proj");
    expect(daily.length).toBeGreaterThanOrEqual(1);
    expect(daily[0].inputTokens).toBe(100);
    expect(daily[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns zero for unknown session", () => {
    const stats = store.getSessionTokens("nonexistent");
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/core && npx vitest run tests/store-tokens.test.ts
```

Expected: FAIL — `store.saveTokenUsage is not a function`

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/core/tests/store-tokens.test.ts
git commit -m "test: add token_usage store tests (red)"
```

### Task 6: token_usage 表 — 实现

**Files:**
- Modify: `packages/core/src/store.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 在 Store.migrate() 中添加 token_usage 表**

在 `packages/core/src/store.ts` 的 `migrate()` 方法的 `this.db.exec(...)` 中追加:

```sql
CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: 添加 TokenStats 接口和 Store 方法**

在 `packages/core/src/store.ts` 中添加:

```typescript
export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface DailyTokenStats extends TokenStats {
  date: string;
  model: string | null;
}
```

添加 Store 方法:

```typescript
saveTokenUsage(
  sessionId: string, projectName: string, model: string | null,
  inputTokens: number, outputTokens: number,
  cacheReadTokens: number, cacheCreationTokens: number,
): void {
  this.db.prepare(`
    INSERT INTO token_usage (session_id, project_name, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sessionId, projectName, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);
}

getSessionTokens(sessionId: string): TokenStats {
  const row = this.db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as inputTokens,
      COALESCE(SUM(output_tokens), 0) as outputTokens,
      COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
      COALESCE(SUM(cache_creation_tokens), 0) as cacheCreationTokens
    FROM token_usage WHERE session_id = ?
  `).get(sessionId) as TokenStats;
  return row;
}

getProjectTokens(projectName: string): TokenStats {
  const row = this.db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as inputTokens,
      COALESCE(SUM(output_tokens), 0) as outputTokens,
      COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
      COALESCE(SUM(cache_creation_tokens), 0) as cacheCreationTokens
    FROM token_usage WHERE project_name = ?
  `).get(projectName) as TokenStats;
  return row;
}

getDailyTokens(projectName: string): DailyTokenStats[] {
  return this.db.prepare(`
    SELECT
      DATE(created_at) as date,
      model,
      COALESCE(SUM(input_tokens), 0) as inputTokens,
      COALESCE(SUM(output_tokens), 0) as outputTokens,
      COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
      COALESCE(SUM(cache_creation_tokens), 0) as cacheCreationTokens
    FROM token_usage
    WHERE project_name = ?
    GROUP BY DATE(created_at), model
    ORDER BY date DESC
  `).all(projectName) as DailyTokenStats[];
}
```

- [ ] **Step 3: 更新 barrel export**

在 `packages/core/src/index.ts` 中增加:

```typescript
export { type TokenStats, type DailyTokenStats } from "./store.js";
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd packages/core && npx vitest run
```

Expected: 全部通过（含新增 token 测试）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/store.ts packages/core/src/index.ts
git commit -m "feat: add token_usage table and query methods to Store"
```

---

## Chunk 3: Server 包 — HTTP/WS API

创建 `@cc2im/server` 包，实现 HTTP REST API、WebSocket 事件处理、Web 认证和静态文件托管。TDD: 契约先定义，测试先写。

### Task 7: 创建 server 包骨架

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/contracts/api.ts` (JSON Schema 契约)

- [ ] **Step 1: 创建 server package.json**

```json
{
  "name": "@cc2im/server",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/server.js",
  "exports": {
    ".": "./dist/server.js",
    "./*": "./dist/*.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@cc2im/core": "workspace:*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 创建 server tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: 创建 API 契约定义**

`packages/server/src/contracts/api.ts`:

```typescript
/** API response envelope for errors */
export interface ApiError {
  error: { code: string; message: string };
}

/** Project CRUD */
export interface ProjectBody {
  name: string;
  directory: string;
  model?: string;
  platforms?: Partial<Record<"lark" | "discord", boolean>>;
}

/** Auth */
export interface LoginRequest { password: string }
export interface LoginResponse { token: string; expiresIn: number }

/** Token stats */
export interface TokenStatsResponse {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** WS events — client to server */
export interface WsChatSend {
  type: "chat.send";
  project: string;
  sessionId?: string;
  message: string;
  images?: string[];
}

export interface WsChatAbort {
  type: "chat.abort";
  project: string;
  sessionId: string;
}

export interface WsSyncState {
  type: "sync.state";
}

export type WsClientEvent = WsChatSend | WsChatAbort | WsSyncState;

/** WS events — server to client */
export interface WsChatStream {
  type: "chat.stream";
  sessionId: string;
  contentType: "text" | "tool_use";
  content: string;
}

export interface WsChatDone {
  type: "chat.done";
  sessionId: string;
  result: string;
  tokens: TokenStatsResponse;
}

export interface WsChatError {
  type: "chat.error";
  sessionId: string;
  error: { code: string; message: string };
}

export interface WsStatusUpdate {
  type: "status.update";
  activeCount: number;
  queued: number;
}

export interface WsSyncStateResponse {
  type: "sync.state";
  activeSessions: Array<{ sessionId: string; project: string }>;
  bufferedOutput: Record<string, string>;
}

export type WsServerEvent = WsChatStream | WsChatDone | WsChatError | WsStatusUpdate | WsSyncStateResponse;
```

- [ ] **Step 4: Commit**

```bash
cd /home/hills/projects/cc2im
npm install
git add packages/server/
git commit -m "chore: create @cc2im/server package skeleton with API contracts"
```

### Task 8: HTTP API — 测试先行

**Files:**
- Create: `packages/server/tests/api.test.ts`
- Create: `packages/server/src/api.ts`
- Create: `packages/server/src/server.ts`

- [ ] **Step 1: 编写 HTTP API 测试**

`packages/server/tests/api.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { createServer } from "../src/server.js";
import { Store } from "@cc2im/core";
import { unlinkSync } from "fs";

const TEST_DB = "test-api.db";
const TEST_CONFIG_PATH = "test-config.yaml";

// Helper to make HTTP requests to the test server
function request(server: http.Server, method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${(server.address() as any).port}`);
    const req = http.request(url, { method, headers: body ? { "Content-Type": "application/json" } : {} }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode!, data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("HTTP API", () => {
  let server: http.Server;

  beforeAll(async () => {
    server = await createServer({
      port: 0,
      bind: "127.0.0.1",
      configPath: TEST_CONFIG_PATH,
      dbPath: TEST_DB,
      skipAuth: true,
    });
  });

  afterAll(async () => {
    server.close();
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + "-wal"); } catch {}
    try { unlinkSync(TEST_DB + "-shm"); } catch {}
  });

  it("GET /api/config returns config", async () => {
    const { status, data } = await request(server, "GET", "/api/config");
    expect(status).toBe(200);
    expect(data).toHaveProperty("claude");
    expect(data).toHaveProperty("projects");
  });

  it("GET /api/projects returns project list", async () => {
    const { status, data } = await request(server, "GET", "/api/projects");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
  });

  it("POST /api/projects adds a project", async () => {
    const { status, data } = await request(server, "POST", "/api/projects", {
      name: "test-proj",
      directory: "/tmp/test",
    });
    expect(status).toBe(201);
    expect(data.name).toBe("test-proj");
  });

  it("GET /api/stats/tokens?project=xxx returns token stats", async () => {
    const { status, data } = await request(server, "GET", "/api/stats/tokens?project=test-proj");
    expect(status).toBe(200);
    expect(data).toHaveProperty("inputTokens");
    expect(data.inputTokens).toBe(0);
  });

  it("returns 404 for unknown routes", async () => {
    const { status } = await request(server, "GET", "/api/nonexistent");
    expect(status).toBe(404);
  });

  it("returns 400 for invalid project body", async () => {
    const { status, data } = await request(server, "POST", "/api/projects", {});
    expect(status).toBe(400);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/server && npx vitest run tests/api.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/server/tests/api.test.ts
git commit -m "test: add HTTP API tests (red)"
```

### Task 9: HTTP API — 实现

**Files:**
- Create: `packages/server/src/server.ts`
- Create: `packages/server/src/api.ts`

- [ ] **Step 1: 实现 api.ts (REST 路由处理)**

`packages/server/src/api.ts`:

```typescript
import type { IncomingMessage, ServerResponse } from "http";
import type { AppConfig } from "@cc2im/core";
import { loadConfig, saveConfig, addProject, removeProject, Store } from "@cc2im/core";
import type { ApiError, ProjectBody } from "./contracts/api.js";

export interface ApiContext {
  config: AppConfig;
  configPath: string;
  store: Store;
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function error(res: ServerResponse, status: number, code: string, message: string): void {
  json(res, status, { error: { code, message } } satisfies ApiError);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => data += chunk);
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  // GET /api/config
  if (method === "GET" && path === "/api/config") {
    const safeConfig = structuredClone(ctx.config);
    safeConfig.discord.token = safeConfig.discord.token ? "***" : "";
    safeConfig.lark.appSecret = safeConfig.lark.appSecret ? "***" : "";
    json(res, 200, safeConfig);
    return;
  }

  // PUT /api/config
  if (method === "PUT" && path === "/api/config") {
    const body = JSON.parse(await readBody(req));
    Object.assign(ctx.config, body);
    saveConfig(ctx.configPath, ctx.config);
    json(res, 200, { ok: true });
    return;
  }

  // GET /api/projects
  if (method === "GET" && path === "/api/projects") {
    json(res, 200, ctx.config.projects);
    return;
  }

  // POST /api/projects
  if (method === "POST" && path === "/api/projects") {
    const body = JSON.parse(await readBody(req)) as Partial<ProjectBody>;
    if (!body.name || !body.directory) {
      error(res, 400, "VALIDATION_ERROR", "name and directory are required");
      return;
    }
    const project = {
      name: body.name,
      directory: body.directory,
      model: body.model,
      platforms: body.platforms ?? {},
    };
    addProject(ctx.config, project);
    saveConfig(ctx.configPath, ctx.config);
    json(res, 201, project);
    return;
  }

  // PUT /api/projects/:name
  const projectPutMatch = method === "PUT" && path.match(/^\/api\/projects\/(.+)$/);
  if (projectPutMatch) {
    const name = decodeURIComponent(projectPutMatch[1]);
    const body = JSON.parse(await readBody(req)) as Partial<ProjectBody>;
    const existing = ctx.config.projects.find(p => p.name === name);
    if (!existing) { error(res, 404, "NOT_FOUND", `Project ${name} not found`); return; }
    Object.assign(existing, body);
    saveConfig(ctx.configPath, ctx.config);
    json(res, 200, existing);
    return;
  }

  // DELETE /api/projects/:name
  const projectDelMatch = method === "DELETE" && path.match(/^\/api\/projects\/(.+)$/);
  if (projectDelMatch) {
    const name = decodeURIComponent(projectDelMatch[1]);
    removeProject(ctx.config, name);
    saveConfig(ctx.configPath, ctx.config);
    json(res, 200, { ok: true });
    return;
  }

  // GET /api/sessions?project=xxx
  if (method === "GET" && path === "/api/sessions") {
    // TODO: 实现会话列表查询 — 需要从 Store 的 threads 表中按 project 查询
    json(res, 200, []);
    return;
  }

  // GET /api/stats/tokens?project=xxx&session=xxx
  if (method === "GET" && path === "/api/stats/tokens") {
    const project = url.searchParams.get("project");
    const session = url.searchParams.get("session");
    if (session) {
      json(res, 200, ctx.store.getSessionTokens(session));
    } else if (project) {
      json(res, 200, ctx.store.getProjectTokens(project));
    } else {
      error(res, 400, "VALIDATION_ERROR", "project or session parameter required");
    }
    return;
  }

  error(res, 404, "NOT_FOUND", `${method} ${path} not found`);
}
```

- [ ] **Step 2: 实现 server.ts (HTTP 服务器)**

`packages/server/src/server.ts`:

```typescript
import http from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { loadConfig, Store } from "@cc2im/core";
import { handleApi, type ApiContext } from "./api.js";

export interface ServerOptions {
  port: number;
  bind: string;
  configPath: string;
  dbPath: string;
  staticDir?: string;
  skipAuth?: boolean;
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

export async function createServer(options: ServerOptions): Promise<http.Server> {
  const config = loadConfig(options.configPath);
  const store = new Store(options.dbPath);
  const ctx: ApiContext = { config, configPath: options.configPath, store };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    // API routes
    if (url.pathname.startsWith("/api/")) {
      try {
        await handleApi(req, res, ctx);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: String(err) } }));
      }
      return;
    }

    // Static file serving (Svelte UI build output)
    if (options.staticDir) {
      let filePath = join(options.staticDir, url.pathname === "/" ? "index.html" : url.pathname);
      if (!existsSync(filePath)) {
        filePath = join(options.staticDir, "index.html"); // SPA fallback
      }
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        const mime = MIME_TYPES[ext] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": mime });
        res.end(readFileSync(filePath));
        return;
      }
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return new Promise((resolve) => {
    server.listen(options.port, options.bind, () => {
      const addr = server.address() as { port: number };
      console.log(`cc2im server listening on ${options.bind}:${addr.port}`);
      resolve(server);
    });
  });
}

export { type ApiContext } from "./api.js";
```

- [ ] **Step 3: 为测试创建最小 config 文件**

在 `packages/server/tests/` 中需要一个 test config。在 `api.test.ts` 的 `beforeAll` 中创建:

```typescript
import { writeFileSync } from "fs";

beforeAll(async () => {
  writeFileSync(TEST_CONFIG_PATH, `
lark:
  appId: ""
  appSecret: ""
discord:
  token: ""
projects: []
claude:
  command: "claude"
  defaultArgs: ["--print"]
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`);
  server = await createServer({ port: 0, bind: "127.0.0.1", configPath: TEST_CONFIG_PATH, dbPath: TEST_DB, skipAuth: true });
});

afterAll(async () => {
  server.close();
  try { unlinkSync(TEST_CONFIG_PATH); } catch {}
  // ... db cleanup
});
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd packages/server && npx vitest run
```

Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ packages/server/tests/
git commit -m "feat: implement HTTP REST API for @cc2im/server"
```

### Task 10: WebSocket 事件处理

**Files:**
- Create: `packages/server/src/ws.ts`
- Create: `packages/server/tests/ws.test.ts`

- [ ] **Step 1: 编写 WS 测试**

`packages/server/tests/ws.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import http from "http";
import { createServer } from "../src/server.js";
import { writeFileSync, unlinkSync } from "fs";

const TEST_DB = "test-ws.db";
const TEST_CONFIG = "test-ws-config.yaml";

describe("WebSocket API", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    writeFileSync(TEST_CONFIG, `
lark: { appId: "", appSecret: "" }
discord: { token: "" }
projects:
  - name: test-proj
    directory: /tmp
    platforms: {}
claude:
  command: echo
  defaultArgs: []
  bufferInterval: 500
  timeout: 5000
formatter:
  maxMessageLength: { discord: 2000, lark: 30000 }
  maxConcurrentProcesses: 5
`);
    server = await createServer({ port: 0, bind: "127.0.0.1", configPath: TEST_CONFIG, dbPath: TEST_DB, skipAuth: true });
    port = (server.address() as any).port;
  });

  afterAll(() => {
    server.close();
    try { unlinkSync(TEST_CONFIG); } catch {}
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + "-wal"); } catch {}
    try { unlinkSync(TEST_DB + "-shm"); } catch {}
  });

  it("connects and receives sync.state response", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({ type: "sync.state" }));

    const msg = await new Promise<any>((resolve) => {
      ws.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    expect(msg.type).toBe("sync.state");
    expect(msg.activeSessions).toEqual([]);
    ws.close();
  });

  it("returns error for unknown project in chat.send", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve) => ws.on("open", resolve));

    ws.send(JSON.stringify({ type: "chat.send", project: "nonexistent", message: "hello" }));

    const msg = await new Promise<any>((resolve) => {
      ws.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    expect(msg.type).toBe("chat.error");
    expect(msg.error.code).toBe("PROJECT_NOT_FOUND");
    ws.close();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/server && npx vitest run tests/ws.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 ws.ts**

`packages/server/src/ws.ts`:

```typescript
import { WebSocketServer, WebSocket } from "ws";
import type http from "http";
import { SessionManager, type AppConfig, Store } from "@cc2im/core";
import type { WsClientEvent, WsServerEvent, WsChatSend } from "./contracts/api.js";

export interface WsContext {
  config: AppConfig;
  store: Store;
  sessionManager: SessionManager;
}

export function attachWebSocket(server: http.Server, ctx: WsContext): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Set<WebSocket>();
  // Buffer output per session for reconnect recovery
  const outputBuffers = new Map<string, string>();

  function broadcast(event: WsServerEvent): void {
    const data = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  wss.on("connection", (ws) => {
    clients.add(ws);

    // Heartbeat
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30000);

    ws.on("message", async (raw) => {
      let event: WsClientEvent;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "chat.error", sessionId: "", error: { code: "PARSE_ERROR", message: "Invalid JSON" } }));
        return;
      }

      if (event.type === "sync.state") {
        const activeSessions = ctx.sessionManager.activeKeys().map(key => {
          const [, sessionId] = key.split(":");
          return { sessionId: sessionId ?? key, project: "" };
        });
        const buffered: Record<string, string> = {};
        for (const [k, v] of outputBuffers) buffered[k] = v;
        ws.send(JSON.stringify({ type: "sync.state", activeSessions, bufferedOutput: buffered } satisfies WsServerEvent));
        return;
      }

      if (event.type === "chat.send") {
        await handleChatSend(event, ws, ctx, outputBuffers, broadcast);
        return;
      }

      if (event.type === "chat.abort") {
        ctx.sessionManager.abort(event.sessionId);
        return;
      }
    });

    ws.on("close", () => {
      clearInterval(pingInterval);
      clients.delete(ws);
    });
  });
}

async function handleChatSend(
  event: WsChatSend,
  ws: WebSocket,
  ctx: WsContext,
  outputBuffers: Map<string, string>,
  broadcast: (e: WsServerEvent) => void,
): Promise<void> {
  const project = ctx.config.projects.find(p => p.name === event.project);
  if (!project) {
    ws.send(JSON.stringify({
      type: "chat.error",
      sessionId: "",
      error: { code: "PROJECT_NOT_FOUND", message: `Project ${event.project} not found` },
    }));
    return;
  }

  const threadKey = `web:${event.sessionId ?? "new-" + Date.now()}`;
  outputBuffers.set(threadKey, "");

  try {
    const result = await ctx.sessionManager.invoke(
      threadKey,
      project.directory,
      event.sessionId ?? null,
      event.message,
      (streamEvent) => {
        const evt = streamEvent as any;
        if (evt.type === "assistant" && evt.message?.content) {
          for (const block of evt.message.content) {
            if (block.type === "text" && block.text) {
              outputBuffers.set(threadKey, (outputBuffers.get(threadKey) ?? "") + block.text);
              broadcast({ type: "chat.stream", sessionId: result?.sessionId ?? threadKey, contentType: "text", content: block.text });
            } else if (block.type === "tool_use") {
              broadcast({ type: "chat.stream", sessionId: threadKey, contentType: "tool_use", content: block.name ?? "tool" });
            }
          }
        }
      },
      event.images,
      () => {
        broadcast({ type: "status.update", activeCount: ctx.sessionManager.activeCount, queued: 0 });
      },
      project.model,
    );

    outputBuffers.delete(threadKey);
    broadcast({
      type: "chat.done",
      sessionId: result.sessionId,
      result: result.text,
      tokens: ctx.store.getSessionTokens(result.sessionId),
    });
    broadcast({ type: "status.update", activeCount: ctx.sessionManager.activeCount, queued: 0 });

  } catch (err) {
    outputBuffers.delete(threadKey);
    broadcast({
      type: "chat.error",
      sessionId: event.sessionId ?? "",
      error: { code: "SESSION_ERROR", message: err instanceof Error ? err.message : String(err) },
    });
  }
}
```

- [ ] **Step 4: 在 server.ts 中集成 WebSocket**

在 `createServer` 中添加:

```typescript
import { attachWebSocket } from "./ws.js";
import { SessionManager } from "@cc2im/core";

// 在 server 创建后、listen 之前:
const sessionManager = new SessionManager(config.claude, config.formatter);
attachWebSocket(server, { config, store, sessionManager });
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd packages/server && npx vitest run
```

Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add packages/server/
git commit -m "feat: implement WebSocket event handling for @cc2im/server"
```

### Task 11: Web 认证

**Files:**
- Create: `packages/server/src/auth.ts`
- Create: `packages/server/tests/auth.test.ts`

- [ ] **Step 1: 编写认证测试**

```typescript
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../src/auth.js";

describe("auth", () => {
  const secret = "test-secret-key-for-jwt";

  it("hashes and verifies password", async () => {
    const hash = await hashPassword("mypassword");
    expect(await verifyPassword("mypassword", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("signs and verifies JWT token", () => {
    const token = signToken(secret, 3600);
    const valid = verifyToken(token, secret);
    expect(valid).toBe(true);
  });

  it("rejects expired token", () => {
    const token = signToken(secret, -1); // already expired
    const valid = verifyToken(token, secret);
    expect(valid).toBe(false);
  });

  it("rejects tampered token", () => {
    const token = signToken(secret, 3600) + "x";
    const valid = verifyToken(token, secret);
    expect(valid).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败，Commit**

```bash
cd packages/server && npx vitest run tests/auth.test.ts
git add packages/server/tests/auth.test.ts
git commit -m "test: add auth tests (red)"
```

- [ ] **Step 3: 实现 auth.ts**

`packages/server/src/auth.ts`:

使用 Node.js 内置 `crypto` 实现简单的密码哈希和 JWT（避免引入 bcrypt 和 jsonwebtoken 两个重依赖）:

```typescript
import { createHmac, randomBytes, timingSafeEqual, scryptSync } from "crypto";

/** Hash password using scrypt (Node built-in, no native deps) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

/** Minimal JWT implementation using HMAC-SHA256 */
function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

export function signToken(secret: string, expiresInSec: number): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSec,
  }));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  if (expected !== signature) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: 运行测试确认通过，Commit**

```bash
cd packages/server && npx vitest run
git add packages/server/src/auth.ts
git commit -m "feat: implement password hashing and JWT auth"
```

---

## Chunk 4: CLI 更新 — 新增 `web` 命令

### Task 12: 添加 `cc2im web` 命令

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/package.json` (添加 @cc2im/server 依赖)

- [ ] **Step 1: 更新 cli package.json 依赖**

```json
"dependencies": {
  "@cc2im/core": "workspace:*",
  "@cc2im/server": "workspace:*"
}
```

- [ ] **Step 2: 在 cli.ts 中添加 web 命令**

在 `packages/cli/src/cli.ts` 的 switch 中添加:

```typescript
case "web": {
  const portIdx = process.argv.indexOf("--port");
  const port = portIdx !== -1 ? parseInt(process.argv[portIdx + 1], 10) : 8080;
  const bindIdx = process.argv.indexOf("--bind");
  const bind = bindIdx !== -1 ? process.argv[bindIdx + 1] : "0.0.0.0";
  const configIdx = process.argv.indexOf("--config");
  const configPath = configIdx !== -1 ? process.argv[configIdx + 1] : undefined;
  const { resolve } = await import("path");
  const { resolveConfigPath } = await import("./service.js");
  const { createServer } = await import("@cc2im/server");

  const resolvedConfig = resolveConfigPath(configPath);
  const dbPath = resolve(process.env.CC2IM_DB ?? "cc2im.db");

  await createServer({
    port,
    bind,
    configPath: resolvedConfig,
    dbPath,
  });
  console.log(`cc2im web UI available at http://${bind}:${port}`);
  break;
}
```

- [ ] **Step 3: 更新 USAGE 字符串**

```typescript
const USAGE = `cc2im - Claude Code to IM bridge

Usage:
  cc2im install [--config <path>]   Install as system service and start
  cc2im uninstall                   Stop and remove system service
  cc2im start                       Start the service
  cc2im stop                        Stop the service
  cc2im restart                     Restart the service
  cc2im status                      Show service status
  cc2im logs                        Tail service logs
  cc2im web [--port N] [--bind H]   Start web UI server
  cc2im run                         Run in foreground (default)
`;
```

- [ ] **Step 4: 构建并验证**

```bash
cd /home/hills/projects/cc2im
npm install
npm run build
node packages/cli/dist/cli.js --help
```

Expected: 输出包含 `web` 命令。

- [ ] **Step 5: Commit**

```bash
git add packages/cli/
git commit -m "feat: add 'cc2im web' command for web UI mode"
```

---

## Chunk 5: Svelte UI 前端

创建 `@cc2im/ui` 包，使用 Svelte 5 + Vite 构建聊天界面、配置管理和 Token 统计三个页面。

### Task 13: 初始化 Svelte 项目

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/vite.config.ts`
- Create: `packages/ui/svelte.config.js`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/app.html`
- Create: `packages/ui/src/App.svelte`
- Create: `packages/ui/src/main.ts`

- [ ] **Step 1: 在 packages/ui 中初始化 Svelte + Vite 项目**

```bash
cd /home/hills/projects/cc2im/packages
npm create vite@latest ui -- --template svelte-ts
cd ui
npm install
```

- [ ] **Step 2: 安装额外依赖**

```bash
cd packages/ui
npm install marked highlight.js
npm install -D @testing-library/svelte vitest jsdom
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/
git commit -m "chore: initialize Svelte 5 + Vite UI package"
```

### Task 14: WebSocket 连接 Store

**Files:**
- Create: `packages/ui/src/lib/stores/connection.ts`
- Create: `packages/ui/src/lib/stores/chat.ts`

- [ ] **Step 1: 实现 WS 连接管理 (connection.ts)**

```typescript
import { writable, get } from "svelte/store";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export const connectionStatus = writable<ConnectionStatus>("disconnected");

let ws: WebSocket | null = null;
let reconnectAttempt = 0;
const MAX_RECONNECT_DELAY = 30000;
const handlers = new Map<string, Set<(data: any) => void>>();

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

export function send(data: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function scheduleReconnect(url: string): void {
  const delays = [0, 1000, 2000, 4000];
  const delay = delays[reconnectAttempt] ?? MAX_RECONNECT_DELAY;
  reconnectAttempt++;
  setTimeout(() => connect(url), delay);
}
```

- [ ] **Step 2: 实现聊天状态 Store (chat.ts)**

```typescript
import { writable, derived } from "svelte/store";
import { on, send } from "./connection.js";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokens?: { input: number; output: number };
  streaming?: boolean;
}

export interface Session {
  id: string | null;
  project: string;
  messages: ChatMessage[];
}

export const currentProject = writable<string | null>(null);
export const currentSessionId = writable<string | null>(null);
export const sessions = writable<Map<string, Session>>(new Map());

// Streaming buffer
let streamBuffer = "";

on("chat.stream", (event) => {
  if (event.contentType === "text") {
    streamBuffer += event.content;
    sessions.update(s => {
      const key = event.sessionId;
      const session = s.get(key);
      if (session) {
        const last = session.messages[session.messages.length - 1];
        if (last?.streaming) {
          last.content = streamBuffer;
        }
      }
      return s;
    });
  }
});

on("chat.done", (event) => {
  streamBuffer = "";
  sessions.update(s => {
    const session = s.get(event.sessionId);
    if (session) {
      const last = session.messages[session.messages.length - 1];
      if (last) {
        last.content = event.result;
        last.streaming = false;
        last.tokens = { input: event.tokens.inputTokens, output: event.tokens.outputTokens };
      }
    }
    return s;
  });
});

export function sendMessage(project: string, message: string, sessionId?: string): void {
  const msgId = crypto.randomUUID();
  const sessKey = sessionId ?? `new-${Date.now()}`;

  sessions.update(s => {
    if (!s.has(sessKey)) {
      s.set(sessKey, { id: sessionId ?? null, project, messages: [] });
    }
    const session = s.get(sessKey)!;
    session.messages.push({ id: msgId, role: "user", content: message });
    session.messages.push({ id: msgId + "-reply", role: "assistant", content: "", streaming: true });
    return s;
  });

  streamBuffer = "";
  send({ type: "chat.send", project, sessionId, message });
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/stores/
git commit -m "feat: add WS connection and chat state stores"
```

### Task 15: 主布局与聊天页面

**Files:**
- Create: `packages/ui/src/App.svelte`
- Create: `packages/ui/src/lib/Sidebar.svelte`
- Create: `packages/ui/src/lib/Chat.svelte`
- Create: `packages/ui/src/lib/MessageBubble.svelte`
- Create: `packages/ui/src/lib/ChatInput.svelte`

- [ ] **Step 1: 实现 App.svelte (主布局)**

根据设计文档 8.1 的布局: 侧边栏 + 主内容区。使用运行时检测 `'__TAURI__' in window` 区分 Desktop/Web。

- [ ] **Step 2: 实现 Sidebar.svelte**

项目列表 + 会话列表。从 `/api/projects` 获取项目，点击切换。

- [ ] **Step 3: 实现 Chat.svelte + MessageBubble.svelte**

消息列表，支持 Markdown 渲染（使用 `marked` + `highlight.js`），流式输出实时追加。

- [ ] **Step 4: 实现 ChatInput.svelte**

文本输入框 + 图片拖拽上传 + 发送按钮 + 中断按钮。

- [ ] **Step 5: 构建验证**

```bash
cd packages/ui && npm run build
ls dist/  # 应有 index.html, assets/
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/
git commit -m "feat: implement chat UI with sidebar, messages, and input"
```

### Task 16: 配置页面

**Files:**
- Create: `packages/ui/src/lib/Config.svelte`

- [ ] **Step 1: 实现 Config.svelte**

从 `GET /api/config` 加载配置，编辑后 `PUT /api/config` 保存。表单分组:
- Claude 设置（command, defaultArgs, timeout）
- Discord/Lark 凭据
- 项目管理（增删改列表）
- Web 认证密码
- 格式化选项

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/lib/Config.svelte
git commit -m "feat: implement config management page"
```

### Task 17: Token 统计页面

**Files:**
- Create: `packages/ui/src/lib/Stats.svelte`

- [ ] **Step 1: 实现 Stats.svelte**

从 `GET /api/stats/tokens` 获取数据，展示:
- 项目筛选下拉框
- 日期范围选择
- 简单柱状图（使用 SVG，不引入图表库）
- 按项目/会话维度的表格

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/lib/Stats.svelte
git commit -m "feat: implement token statistics page"
```

### Task 18: 首次引导向导

**Files:**
- Create: `packages/ui/src/lib/Onboarding.svelte`

- [ ] **Step 1: 实现 Onboarding.svelte**

按设计文档 Section 10 实现 5 步引导。App.svelte 中检测 config 是否为空来决定是否显示引导。

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/lib/Onboarding.svelte
git commit -m "feat: implement onboarding wizard for first-time setup"
```

### Task 19: Server 集成 UI 静态文件

**Files:**
- Modify: `packages/server/src/server.ts`

- [ ] **Step 1: 更新 createServer 默认 staticDir**

```typescript
// 自动检测 UI 构建产物位置
if (!options.staticDir) {
  const uiDist = join(__dirname, "../../ui/dist");
  if (existsSync(uiDist)) options.staticDir = uiDist;
}
```

- [ ] **Step 2: 端到端验证**

```bash
cd /home/hills/projects/cc2im
npm run build  # 构建 core + server + ui + cli
node packages/cli/dist/cli.js web --port 3000 --bind 127.0.0.1
# 浏览器访问 http://127.0.0.1:3000 应显示 UI
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat: serve Svelte UI static files from server"
```

---

## Chunk 6: Tauri Desktop 应用

### Task 20: 初始化 Tauri 项目

**Files:**
- Create: `packages/desktop/` (Tauri 项目)

- [ ] **Step 1: 初始化 Tauri**

```bash
cd /home/hills/projects/cc2im/packages
cargo install create-tauri-app
npm create tauri-app@latest desktop -- --template vanilla-ts --manager npm
```

或手动初始化:

```bash
mkdir -p packages/desktop/src-tauri/src
cd packages/desktop
npm init -y
npm install @tauri-apps/cli @tauri-apps/api
```

- [ ] **Step 2: 配置 tauri.conf.json**

关键配置:
- `build.devUrl`: `http://127.0.0.1:5173` (开发时用 Vite dev server)
- `app.windows[0]`: 宽 1200，高 800
- `app.security.csp`: 允许连接 localhost WS
- `bundle.identifier`: `com.cc2im.desktop`

- [ ] **Step 3: Commit**

```bash
git add packages/desktop/
git commit -m "chore: initialize Tauri desktop package"
```

### Task 21: Rust 壳 — Node 子进程管理 + 系统托盘

**Files:**
- Modify: `packages/desktop/src-tauri/src/main.rs`

- [ ] **Step 1: 实现 main.rs**

```rust
use std::process::{Command, Child};
use tauri::{Manager, SystemTray, SystemTrayMenu, SystemTrayMenuItem, SystemTrayEvent};
use tauri::CustomMenuItem;

fn start_node_server() -> Child {
    let node = if cfg!(target_os = "windows") { "node.exe" } else { "node" };
    // 在 Resources 目录中查找打包的 Node 和 server 代码
    Command::new(node)
        .args(&["packages/cli/dist/cli.js", "web", "--port", "0", "--bind", "127.0.0.1"])
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("Failed to start Node.js server")
}

fn main() {
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("open", "Open cc2im"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    let tray = SystemTray::new().with_menu(tray_menu);

    tauri::Builder::default()
        .system_tray(tray)
        .on_system_tray_event(|app, event| {
            match event {
                SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                    "open" => {
                        if let Some(window) = app.get_window("main") {
                            window.show().unwrap();
                            window.set_focus().unwrap();
                        }
                    }
                    "quit" => std::process::exit(0),
                    _ => {}
                },
                SystemTrayEvent::DoubleClick { .. } => {
                    if let Some(window) = app.get_window("main") {
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                }
                _ => {}
            }
        })
        .on_window_event(|event| {
            // 关闭按钮 → 最小化到托盘
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                event.window().hide().unwrap();
                api.prevent_close();
            }
        })
        .setup(|_app| {
            // Start Node.js server
            let _child = start_node_server();
            // TODO: 读取 stdout 获取实际端口号，传递给 WebView
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

注意: 这是初始实现，后续需细化端口通信和进程生命周期管理。

- [ ] **Step 2: 验证 Tauri 开发模式**

```bash
cd packages/desktop
cargo tauri dev
```

Expected: Tauri 窗口启动，显示 UI。

- [ ] **Step 3: Commit**

```bash
git add packages/desktop/
git commit -m "feat: implement Tauri shell with system tray and Node subprocess"
```

---

## Chunk 7: CI/CD 与 Smoke Test

### Task 22: CI 工作流

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: 创建 CI 工作流 (.github/workflows/ci.yml)**

```yaml
name: CI
on: [push, pull_request]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install
      - run: npm run build
      - run: npm run test

  smoke-test:
    runs-on: ubuntu-latest
    needs: lint-and-test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install && npm run build
      - name: Smoke test
        run: |
          node packages/cli/dist/cli.js web --port 9999 --bind 127.0.0.1 &
          sleep 3
          curl -f http://127.0.0.1:9999/api/projects
          curl -f http://127.0.0.1:9999/api/config
          curl -f http://127.0.0.1:9999/ | grep -q "<html"
          kill %1
```

- [ ] **Step 2: 创建 Release 工作流 (.github/workflows/release.yml)**

```yaml
name: Release
on:
  push:
    tags: ["v*"]

jobs:
  build-and-release:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: universal-apple-darwin
          - os: windows-latest
            target: x86_64-pc-windows-msvc
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: dtolnay/rust-toolchain@stable
      - run: npm install && npm run build
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "cc2im ${{ github.ref_name }}"
          releaseBody: "Desktop release for cc2im"
```

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: add CI and release workflows"
```

### Task 23: Smoke Test 脚本

**Files:**
- Create: `scripts/smoke-test.sh`

- [ ] **Step 1: 创建可复用的 smoke test 脚本**

```bash
#!/usr/bin/env bash
set -euo pipefail

PORT=${1:-9999}
CONFIG="smoke-test-config.yaml"
DB="smoke-test.db"

# Create minimal config
cat > "$CONFIG" <<EOF
lark: { appId: "", appSecret: "" }
discord: { token: "" }
projects: []
claude:
  command: echo
  defaultArgs: []
  bufferInterval: 500
  timeout: 5000
formatter:
  maxMessageLength: { discord: 2000, lark: 30000 }
  maxConcurrentProcesses: 5
EOF

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$CONFIG" "$DB" "$DB-wal" "$DB-shm"
}
trap cleanup EXIT

CC2IM_CONFIG="$CONFIG" CC2IM_DB="$DB" node packages/cli/dist/cli.js web --port "$PORT" --bind 127.0.0.1 &
SERVER_PID=$!
sleep 3

echo "Testing HTTP API..."
curl -sf http://127.0.0.1:$PORT/api/projects > /dev/null
echo "  GET /api/projects OK"
curl -sf http://127.0.0.1:$PORT/api/config > /dev/null
echo "  GET /api/config OK"
echo "Testing static files..."
curl -sf http://127.0.0.1:$PORT/ | grep -q "<html"
echo "  GET / OK"

echo "All smoke tests passed!"
```

- [ ] **Step 2: Commit**

```bash
chmod +x scripts/smoke-test.sh
git add scripts/smoke-test.sh
git commit -m "test: add smoke test script for CI"
```

---

## 验收清单

每个功能点关联一个自动化测试。功能"完成"= 对应测试在 CI 中通过:

- [ ] Monorepo 迁移完成，现有测试全部通过
- [ ] Token 统计: Store 存储和查询 (core 单元测试)
- [ ] HTTP API: 项目 CRUD、配置管理、token 统计端点 (server API 测试)
- [ ] WebSocket: 连接、sync.state、chat.send 流式输出 (server WS 测试)
- [ ] Web 认证: 密码验证、JWT 签发/校验 (server auth 测试)
- [ ] CLI `cc2im web` 命令可启动 web 服务
- [ ] Svelte UI: 聊天发送 → 流式输出 → 完成 (E2E Playwright)
- [ ] Svelte UI: 配置页可编辑并持久化 (E2E Playwright)
- [ ] Svelte UI: Token 统计页展示数据 (E2E Playwright)
- [ ] Svelte UI: 首次引导向导 (E2E Playwright)
- [ ] Desktop: Tauri 窗口启动 (Tauri E2E)
- [ ] Desktop: 系统托盘可用 (Tauri E2E)
- [ ] CI: 构建通过，smoke test 通过
- [ ] Release: 三平台构建产物存在

## 红线原则

**永远不要说谎。遇到问题可以报告，但不要改变策略；项目太大可以拆分，但不要偷懒；未完成可以再做，但不要伪装。说谎的后果非常严重。**
