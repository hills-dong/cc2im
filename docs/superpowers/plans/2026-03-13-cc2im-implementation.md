# cc2im Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a bridge service that lets users chat with Claude Code CLI through Lark and Discord, with per-project channels, threaded conversations, streaming responses, and bidirectional emoji reactions.

**Architecture:** Single Node.js process with platform adapters (Lark, Discord) converting IM events into Claude Code CLI invocations via `child_process.spawn`. Each IM thread maps to a Claude Code session via `--resume`. SQLite stores thread-session mappings.

**Tech Stack:** TypeScript, Node.js, discord.js, @larksuiteoapi/node-sdk, better-sqlite3, yaml

**Spec:** `docs/superpowers/specs/2026-03-13-cc2im-design.md`

---

## File Structure

```
cc2im/
├── src/
│   ├── index.ts              # Entry point — load config, init adapters, start service
│   ├── types.ts              # All shared interfaces and types
│   ├── config.ts             # ConfigManager — YAML load/save, env var overlay, hot reload
│   ├── store.ts              # SQLite store — threads/messages tables, CRUD operations
│   ├── session.ts            # SessionManager — spawn Claude Code, parse stream-json, manage queues
│   ├── formatter.ts          # Formatter — stream buffering, markdown formatting, length splitting, reaction parsing
│   ├── router.ts             # Router — channel→project mapping, thread→session routing, message dispatch
│   └── adapters/
│       ├── adapter.ts        # PlatformAdapter interface
│       └── discord.ts        # Discord adapter implementation
├── tests/
│   ├── config.test.ts
│   ├── store.test.ts
│   ├── session.test.ts
│   ├── formatter.test.ts
│   ├── router.test.ts
│   └── discord.test.ts
├── config.yaml.example       # Example config (no secrets)
├── package.json
├── tsconfig.json
└── .gitignore
```

**Note:** Lark adapter (`src/adapters/lark.ts`) is deferred to a follow-up plan. This plan implements Discord only to get a working end-to-end system first.

---

## Chunk 1: Project Scaffolding and Core Types

### Task 1: Initialize Node.js project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `config.yaml.example`

- [ ] **Step 1: Initialize git repo**

```bash
cd /home/hills/projects/cc2im
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "cc2im",
  "version": "0.1.0",
  "description": "Claude Code to IM bridge — chat with Claude Code via Lark and Discord",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "discord.js": "^14.16.0",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
config.yaml
*.db
*.db-journal
```

- [ ] **Step 5: Create config.yaml.example**

```yaml
# Platform credentials (prefer env vars: DISCORD_TOKEN, LARK_APP_ID, LARK_APP_SECRET)
lark:
  appId: ""
  appSecret: ""

discord:
  token: ""

# Project → directory mappings
projects:
  - name: "my-project"
    directory: "/path/to/project"
    platforms:
      discord: true

# Claude Code CLI settings
claude:
  command: "claude"
  defaultArgs: ["--print", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"]
  bufferInterval: 500
  timeout: 300000

# Output formatting
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
```

- [ ] **Step 6: Install dependencies**

```bash
npm install
```

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore config.yaml.example
git commit -m "chore: initialize cc2im project with dependencies"
```

---

### Task 2: Define core types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write types file**

```typescript
// src/types.ts

export type Platform = "lark" | "discord";

export interface Attachment {
  filename: string;
  content: Buffer;
  mimeType?: string;
}

export interface IncomingMessage {
  platform: Platform;
  channelId: string;
  threadId: string | null;
  messageId: string;
  userId: string;
  userName: string;
  content: string;
  attachments: Attachment[];
  replyToMessageId?: string;
}

export interface Reaction {
  platform: Platform;
  channelId: string;
  threadId: string;
  messageId: string;
  emoji: string;
  userId: string;
}

export interface OutgoingMessage {
  threadId: string;
  content: string;
  attachments: Attachment[];
  reactions: string[];
}

export interface ProjectConfig {
  name: string;
  directory: string;
  platforms: Partial<Record<Platform, boolean>>;
}

export interface ChannelInfo {
  channelId: string;
  platform: Platform;
  projectName: string;
}

export interface ClaudeConfig {
  command: string;
  defaultArgs: string[];
  bufferInterval: number;
  timeout: number;
}

export interface FormatterConfig {
  maxMessageLength: Record<Platform, number>;
  maxConcurrentProcesses: number;
}

export interface AppConfig {
  lark: { appId: string; appSecret: string };
  discord: { token: string };
  projects: ProjectConfig[];
  claude: ClaudeConfig;
  formatter: FormatterConfig;
}

// Claude Code stream-json event types
export interface StreamInitEvent {
  type: "system";
  subtype: "init";
  session_id: string;
}

export interface StreamAssistantEvent {
  type: "assistant";
  message: {
    content: Array<{ type: string; text?: string }>;
  };
}

export interface StreamResultEvent {
  type: "result";
  subtype: "success" | "error";
  result: string;
  session_id: string;
}

export type StreamEvent = StreamInitEvent | StreamAssistantEvent | StreamResultEvent | { type: string; [key: string]: unknown };

export interface PlatformAdapter {
  readonly platform: Platform;
  start(): Promise<void>;
  stop(): Promise<void>;
  setupProject(project: ProjectConfig): Promise<ChannelInfo>;
  createThread(channelId: string, messageId: string): Promise<string>;
  sendMessage(channelId: string, threadId: string, content: string): Promise<string>;
  editMessage(channelId: string, messageId: string, content: string): Promise<void>;
  uploadFile(channelId: string, threadId: string, filename: string, content: Buffer): Promise<void>;
  addReaction(channelId: string, messageId: string, emoji: string): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => void): void;
  onReaction(handler: (reaction: Reaction) => void): void;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: define core types and interfaces"
```

---

## Chunk 2: Config and Store

### Task 3: Implement ConfigManager

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ConfigManager", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cc2im-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = join(tmpDir, "config.yaml");
  });

  afterEach(() => {
    try { unlinkSync(configPath); } catch {}
  });

  it("loads a valid config file", () => {
    writeFileSync(configPath, `
discord:
  token: "test-token"
lark:
  appId: ""
  appSecret: ""
projects:
  - name: "test"
    directory: "/tmp/test"
    platforms:
      discord: true
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
    const config = loadConfig(configPath);
    expect(config.discord.token).toBe("test-token");
    expect(config.projects).toHaveLength(1);
    expect(config.projects[0].name).toBe("test");
  });

  it("env vars override config file values", () => {
    writeFileSync(configPath, `
discord:
  token: "file-token"
lark:
  appId: ""
  appSecret: ""
projects: []
claude:
  command: "claude"
  defaultArgs: []
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`);
    process.env.DISCORD_TOKEN = "env-token";
    const config = loadConfig(configPath);
    expect(config.discord.token).toBe("env-token");
    delete process.env.DISCORD_TOKEN;
  });

  it("throws on missing config file", () => {
    expect(() => loadConfig("/nonexistent/config.yaml")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config.test.ts
```
Expected: FAIL — `loadConfig` not found

- [ ] **Step 3: Implement ConfigManager**

```typescript
// src/config.ts
import { readFileSync, writeFileSync } from "fs";
import { parse, stringify } from "yaml";
import type { AppConfig, ProjectConfig } from "./types.js";

export function loadConfig(path: string): AppConfig {
  const raw = readFileSync(path, "utf-8");
  const parsed = parse(raw) as AppConfig;

  // Env var overrides
  if (process.env.DISCORD_TOKEN) {
    parsed.discord.token = process.env.DISCORD_TOKEN;
  }
  if (process.env.LARK_APP_ID) {
    parsed.lark.appId = process.env.LARK_APP_ID;
  }
  if (process.env.LARK_APP_SECRET) {
    parsed.lark.appSecret = process.env.LARK_APP_SECRET;
  }

  return parsed;
}

export function saveConfig(path: string, config: AppConfig): void {
  // Strip env-sourced secrets before saving
  const toSave = structuredClone(config);
  if (process.env.DISCORD_TOKEN) toSave.discord.token = "";
  if (process.env.LARK_APP_ID) toSave.lark.appId = "";
  if (process.env.LARK_APP_SECRET) toSave.lark.appSecret = "";
  writeFileSync(path, stringify(toSave), "utf-8");
}

export function addProject(config: AppConfig, project: ProjectConfig): AppConfig {
  const existing = config.projects.findIndex(p => p.name === project.name);
  if (existing >= 0) {
    config.projects[existing] = project;
  } else {
    config.projects.push(project);
  }
  return config;
}

export function removeProject(config: AppConfig, name: string): AppConfig {
  config.projects = config.projects.filter(p => p.name !== name);
  return config;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/config.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: implement ConfigManager with env var overlay"
```

---

### Task 4: Implement SQLite Store

**Files:**
- Create: `src/store.ts`
- Create: `tests/store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

describe("Store", () => {
  let store: Store;
  const dbPath = `/tmp/cc2im-test-${Date.now()}.db`;

  beforeEach(() => {
    store = new Store(dbPath);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("creates and retrieves a thread", () => {
    store.upsertThread("thread-1", "discord", "channel-1", "session-abc", "my-project");
    const thread = store.getThread("thread-1", "discord");
    expect(thread).not.toBeNull();
    expect(thread!.session_id).toBe("session-abc");
    expect(thread!.project_name).toBe("my-project");
  });

  it("updates session_id for existing thread", () => {
    store.upsertThread("thread-1", "discord", "channel-1", "session-old", "proj");
    store.upsertThread("thread-1", "discord", "channel-1", "session-new", "proj");
    const thread = store.getThread("thread-1", "discord");
    expect(thread!.session_id).toBe("session-new");
  });

  it("returns null for unknown thread", () => {
    const thread = store.getThread("nonexistent", "discord");
    expect(thread).toBeNull();
  });

  it("saves and retrieves messages", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj");
    store.saveMessage("msg-1", "discord", "thread-1", true, "hello world");
    const msg = store.getMessage("msg-1", "discord");
    expect(msg).not.toBeNull();
    expect(msg!.is_bot).toBe(1);
    expect(msg!.content_summary).toBe("hello world");
  });

  it("deletes thread and cascade", () => {
    store.upsertThread("thread-1", "discord", "ch-1", "sess-1", "proj");
    store.saveMessage("msg-1", "discord", "thread-1", false, "test");
    store.deleteThread("thread-1", "discord");
    expect(store.getThread("thread-1", "discord")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/store.test.ts
```
Expected: FAIL — `Store` not found

- [ ] **Step 3: Implement Store**

```typescript
// src/store.ts
import Database from "better-sqlite3";
import type { Platform } from "./types.js";

export interface ThreadRow {
  thread_id: string;
  platform: string;
  channel_id: string;
  session_id: string;
  project_name: string;
  created_at: string;
}

export interface MessageRow {
  message_id: string;
  platform: string;
  thread_id: string;
  is_bot: number;
  content_summary: string | null;
  created_at: string;
}

export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        thread_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (thread_id, platform)
      );

      CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        is_bot BOOLEAN NOT NULL DEFAULT FALSE,
        content_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, platform)
      );
    `);
  }

  upsertThread(threadId: string, platform: Platform, channelId: string, sessionId: string, projectName: string): void {
    this.db.prepare(`
      INSERT INTO threads (thread_id, platform, channel_id, session_id, project_name)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(thread_id, platform) DO UPDATE SET session_id = excluded.session_id
    `).run(threadId, platform, channelId, sessionId, projectName);
  }

  getThread(threadId: string, platform: Platform): ThreadRow | null {
    return this.db.prepare(
      "SELECT * FROM threads WHERE thread_id = ? AND platform = ?"
    ).get(threadId, platform) as ThreadRow | null;
  }

  deleteThread(threadId: string, platform: Platform): void {
    this.db.prepare("DELETE FROM messages WHERE thread_id = ? AND platform = ?").run(threadId, platform);
    this.db.prepare("DELETE FROM threads WHERE thread_id = ? AND platform = ?").run(threadId, platform);
  }

  saveMessage(messageId: string, platform: Platform, threadId: string, isBot: boolean, contentSummary?: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO messages (message_id, platform, thread_id, is_bot, content_summary)
      VALUES (?, ?, ?, ?, ?)
    `).run(messageId, platform, threadId, isBot ? 1 : 0, contentSummary ?? null);
  }

  getMessage(messageId: string, platform: Platform): MessageRow | null {
    return this.db.prepare(
      "SELECT * FROM messages WHERE message_id = ? AND platform = ?"
    ).get(messageId, platform) as MessageRow | null;
  }

  getLastBotMessage(threadId: string, platform: Platform): MessageRow | null {
    return this.db.prepare(
      "SELECT * FROM messages WHERE thread_id = ? AND platform = ? AND is_bot = 1 ORDER BY created_at DESC LIMIT 1"
    ).get(threadId, platform) as MessageRow | null;
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/store.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/store.ts tests/store.test.ts
git commit -m "feat: implement SQLite store for thread/session mapping"
```

---

## Chunk 3: SessionManager

### Task 5: Implement SessionManager

**Files:**
- Create: `src/session.ts`
- Create: `tests/session.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/session.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "../src/session.js";
import type { ClaudeConfig, FormatterConfig } from "../src/types.js";

const mockClaudeConfig: ClaudeConfig = {
  command: "echo",
  defaultArgs: [],
  bufferInterval: 100,
  timeout: 5000,
};

const mockFormatterConfig: FormatterConfig = {
  maxMessageLength: { discord: 2000, lark: 30000 },
  maxConcurrentProcesses: 2,
};

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(mockClaudeConfig, mockFormatterConfig);
  });

  it("tracks active process count", () => {
    expect(manager.activeCount).toBe(0);
  });

  it("rejects when concurrency limit reached", async () => {
    // Fill up the queue by setting a very low limit
    const smallManager = new SessionManager(mockClaudeConfig, {
      ...mockFormatterConfig,
      maxConcurrentProcesses: 0,
    });
    const result = smallManager.canAccept();
    expect(result).toBe(false);
  });

  it("parses stream-json init event to extract session_id", () => {
    const line = '{"type":"system","subtype":"init","session_id":"abc-123","cwd":"/tmp"}';
    const event = manager.parseLine(line);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("system");
    if (event!.type === "system" && "subtype" in event! && event!.subtype === "init") {
      expect((event as any).session_id).toBe("abc-123");
    }
  });

  it("parses assistant text event", () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello!"}]}}';
    const event = manager.parseLine(line);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("assistant");
  });

  it("returns null for invalid JSON", () => {
    const event = manager.parseLine("not json");
    expect(event).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/session.test.ts
```
Expected: FAIL — `SessionManager` not found

- [ ] **Step 3: Implement SessionManager**

```typescript
// src/session.ts
import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { ClaudeConfig, FormatterConfig, StreamEvent } from "./types.js";

export interface SessionResult {
  sessionId: string;
  text: string;
  success: boolean;
}

type StreamCallback = (event: StreamEvent) => void;

export class SessionManager {
  private active = new Map<string, ChildProcess>();
  private queues = new Map<string, Array<() => void>>();

  constructor(
    private claudeConfig: ClaudeConfig,
    private formatterConfig: FormatterConfig,
  ) {}

  get activeCount(): number {
    return this.active.size;
  }

  canAccept(): boolean {
    return this.active.size < this.formatterConfig.maxConcurrentProcesses;
  }

  parseLine(line: string): StreamEvent | null {
    try {
      return JSON.parse(line) as StreamEvent;
    } catch {
      return null;
    }
  }

  async invoke(
    threadKey: string,
    projectDir: string,
    sessionId: string | null,
    message: string,
    onEvent: StreamCallback,
  ): Promise<SessionResult> {
    // Queue if a process is already running for this thread
    if (this.queues.has(threadKey)) {
      await new Promise<void>(resolve => {
        const queue = this.queues.get(threadKey)!;
        queue.push(resolve);
      });
    }
    this.queues.set(threadKey, []);

    // Wait for concurrency slot
    while (!this.canAccept()) {
      await new Promise(r => setTimeout(r, 500));
    }

    const args = [...this.claudeConfig.defaultArgs];
    if (sessionId) {
      args.push("--resume", sessionId);
    }
    args.push("-p", message);

    return new Promise<SessionResult>((resolve, reject) => {
      let timedOut = false;

      const proc = spawn(this.claudeConfig.command, args, {
        cwd: projectDir,
        env: { ...process.env, CLAUDECODE: undefined },
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.active.set(threadKey, proc);

      let resultSessionId = sessionId ?? "";
      let fullText = "";
      let success = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
      }, this.claudeConfig.timeout);

      const rl = createInterface({ input: proc.stdout! });

      rl.on("line", (line) => {
        const event = this.parseLine(line);
        if (!event) return;

        // Extract session_id from init event
        if (event.type === "system" && "subtype" in event && event.subtype === "init") {
          resultSessionId = (event as any).session_id;
        }

        // Accumulate assistant text
        if (event.type === "assistant" && "message" in event) {
          const msg = (event as any).message;
          if (msg?.content) {
            for (const block of msg.content) {
              if (block.type === "text" && block.text) {
                fullText += block.text;
              }
            }
          }
        }

        // Check result
        if (event.type === "result") {
          success = (event as any).subtype === "success";
          if ((event as any).result) {
            fullText = (event as any).result;
          }
        }

        onEvent(event);
      });

      proc.on("close", (code) => {
        clearTimeout(timeout);
        this.active.delete(threadKey);

        // Process next in queue
        const queue = this.queues.get(threadKey);
        if (queue && queue.length > 0) {
          const next = queue.shift()!;
          next();
        } else {
          this.queues.delete(threadKey);
        }

        if (timedOut) {
          reject(new Error(`Claude Code timed out after ${this.claudeConfig.timeout}ms`));
        } else {
          resolve({
            sessionId: resultSessionId,
            text: fullText,
            success: success || code === 0,
          });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        this.active.delete(threadKey);
        this.queues.delete(threadKey);
        reject(err);
      });
    });
  }

  abort(sessionId: string): boolean {
    for (const [key, proc] of this.active) {
      if (key.includes(sessionId)) {
        proc.kill("SIGTERM");
        return true;
      }
    }
    return false;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/session.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/session.ts tests/session.test.ts
git commit -m "feat: implement SessionManager for Claude Code CLI interaction"
```

---

## Chunk 4: Formatter

### Task 6: Implement Formatter

**Files:**
- Create: `src/formatter.ts`
- Create: `tests/formatter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/formatter.test.ts
import { describe, it, expect } from "vitest";
import { Formatter } from "../src/formatter.js";
import type { Platform } from "../src/types.js";

const formatter = new Formatter({
  maxMessageLength: { discord: 100, lark: 300 },
  maxConcurrentProcesses: 5,
});

describe("Formatter", () => {
  it("passes short messages through unchanged", () => {
    const result = formatter.formatOutput("Hello world", "discord");
    expect(result.messages).toEqual(["Hello world"]);
    expect(result.attachments).toHaveLength(0);
  });

  it("splits long messages for discord", () => {
    const long = "a".repeat(150);
    const result = formatter.formatOutput(long, "discord");
    expect(result.messages.length).toBeGreaterThan(1);
    // Each message should be within limit
    for (const msg of result.messages) {
      expect(msg.length).toBeLessThanOrEqual(100);
    }
  });

  it("uses summary + attachment when output is very long", () => {
    const veryLong = "Line of code\n".repeat(200);
    const result = formatter.formatOutput(veryLong, "discord");
    expect(result.attachments.length).toBeGreaterThan(0);
  });

  it("parses reaction from end of output", () => {
    const text = "Here is my response\n[react:👍]";
    const result = formatter.extractReactions(text);
    expect(result.reactions).toEqual(["👍"]);
    expect(result.cleanText).toBe("Here is my response");
  });

  it("does not parse reaction from middle of output", () => {
    const text = "Some [react:👍] in the middle\nMore text";
    const result = formatter.extractReactions(text);
    expect(result.reactions).toHaveLength(0);
    expect(result.cleanText).toBe(text);
  });

  it("handles multiple reactions", () => {
    const text = "Done!\n[react:✅]\n[react:🎉]";
    const result = formatter.extractReactions(text);
    expect(result.reactions).toEqual(["✅", "🎉"]);
    expect(result.cleanText).toBe("Done!");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/formatter.test.ts
```
Expected: FAIL — `Formatter` not found

- [ ] **Step 3: Implement Formatter**

```typescript
// src/formatter.ts
import type { Attachment, FormatterConfig, Platform } from "./types.js";

interface FormatResult {
  messages: string[];
  attachments: Attachment[];
}

interface ReactionResult {
  cleanText: string;
  reactions: string[];
}

export class Formatter {
  constructor(private config: FormatterConfig) {}

  getMaxLength(platform: Platform): number {
    return this.config.maxMessageLength[platform] ?? 2000;
  }

  formatOutput(text: string, platform: Platform): FormatResult {
    const maxLen = this.getMaxLength(platform);

    // If text fits in one message, return as-is
    if (text.length <= maxLen) {
      return { messages: [text], attachments: [] };
    }

    // If text is moderately long, split into multiple messages
    if (text.length <= maxLen * 5) {
      return { messages: this.splitText(text, maxLen), attachments: [] };
    }

    // Very long: summary + attachment
    const summary = this.generateSummary(text, maxLen);
    const attachment: Attachment = {
      filename: "full-output.md",
      content: Buffer.from(text, "utf-8"),
      mimeType: "text/markdown",
    };

    return {
      messages: [summary],
      attachments: [attachment],
    };
  }

  splitText(text: string, maxLen: number): string[] {
    // First pass: split without numbering to determine total parts
    const rawChunks: string[] = [];
    let remaining = text;
    const reservedForPrefix = 12; // e.g. "[99/99] "

    while (remaining.length > 0) {
      const available = maxLen - reservedForPrefix;

      if (remaining.length <= available) {
        rawChunks.push(remaining);
        break;
      }

      let splitAt = remaining.lastIndexOf("\n", available);
      if (splitAt < available * 0.5) {
        splitAt = remaining.lastIndexOf(" ", available);
      }
      if (splitAt < available * 0.3) {
        splitAt = available;
      }

      rawChunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    // Second pass: add correct numbering
    const total = rawChunks.length;
    if (total === 1) return rawChunks;
    return rawChunks.map((chunk, i) => `[${i + 1}/${total}] ${chunk}`);
  }

  generateSummary(text: string, maxLen: number): string {
    // Take first few lines as summary
    const lines = text.split("\n").slice(0, 10);
    let summary = lines.join("\n");
    if (summary.length > maxLen - 50) {
      summary = summary.slice(0, maxLen - 50);
    }
    return summary + "\n\n_...完整输出见附件_";
  }

  extractReactions(text: string): ReactionResult {
    const lines = text.split("\n");
    const reactions: string[] = [];
    const reactionPattern = /^\[react:(.+)\]$/;

    // Scan from end, collecting reaction lines
    let lastContentLine = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed === "") continue;
      const match = trimmed.match(reactionPattern);
      if (match) {
        reactions.unshift(match[1]);
        lastContentLine = i;
      } else {
        break;
      }
    }

    const cleanText = lines.slice(0, lastContentLine).join("\n").trimEnd();
    return { cleanText, reactions };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/formatter.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/formatter.ts tests/formatter.test.ts
git commit -m "feat: implement Formatter with split/summary/reaction parsing"
```

---

## Chunk 5: Discord Adapter

### Task 7: Implement Discord Adapter

**Files:**
- Create: `src/adapters/adapter.ts`
- Create: `src/adapters/discord.ts`
- Create: `tests/discord.test.ts`

- [ ] **Step 1: Create adapter barrel file**

```typescript
// src/adapters/adapter.ts
export type { PlatformAdapter } from "../types.js";
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/discord.test.ts
import { describe, it, expect, vi } from "vitest";
import { DiscordAdapter } from "../src/adapters/discord.js";

// We test the message transformation logic, not actual Discord API calls
describe("DiscordAdapter", () => {
  it("can be instantiated with a token", () => {
    // Don't actually connect — just verify construction
    const adapter = new DiscordAdapter("fake-token");
    expect(adapter.platform).toBe("discord");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/discord.test.ts
```
Expected: FAIL — `DiscordAdapter` not found

- [ ] **Step 4: Implement DiscordAdapter**

```typescript
// src/adapters/discord.ts
import {
  Client,
  GatewayIntentBits,
  type Message as DiscordMessage,
  type MessageReaction,
  type User,
  type TextChannel,
  type ThreadChannel,
  ChannelType,
} from "discord.js";
import type { PlatformAdapter, IncomingMessage, Reaction, ProjectConfig, ChannelInfo, Platform } from "../types.js";

export class DiscordAdapter implements PlatformAdapter {
  readonly platform: Platform = "discord";
  private client: Client;
  private messageHandler?: (msg: IncomingMessage) => void;
  private reactionHandler?: (reaction: Reaction) => void;

  constructor(private token: string) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });

    this.client.on("messageCreate", (msg) => this.handleMessage(msg));
    this.client.on("messageReactionAdd", (reaction, user) =>
      this.handleReaction(reaction as MessageReaction, user as User)
    );
  }

  async start(): Promise<void> {
    await this.client.login(this.token);
    console.log(`Discord bot logged in as ${this.client.user?.tag}`);
  }

  async stop(): Promise<void> {
    this.client.destroy();
  }

  async setupProject(project: ProjectConfig): Promise<ChannelInfo> {
    // Find the first guild the bot is in
    const guild = this.client.guilds.cache.first();
    if (!guild) throw new Error("Bot is not in any Discord server");

    // Check if channel already exists
    const existing = guild.channels.cache.find(
      ch => ch.name === `cc2im-${project.name}` && ch.type === ChannelType.GuildText
    );
    if (existing) {
      return { channelId: existing.id, platform: "discord", projectName: project.name };
    }

    // Create private text channel
    const channel = await guild.channels.create({
      name: `cc2im-${project.name}`,
      type: ChannelType.GuildText,
      topic: `Claude Code project: ${project.name} (${project.directory})`,
    });

    return { channelId: channel.id, platform: "discord", projectName: project.name };
  }

  async createThread(channelId: string, messageId: string): Promise<string> {
    const channel = await this.client.channels.fetch(channelId) as TextChannel;
    const message = await channel.messages.fetch(messageId);
    const thread = await message.startThread({
      name: `Claude ${new Date().toISOString().slice(0, 16)}`,
      autoArchiveDuration: 1440,
    });
    return thread.id;
  }

  async sendMessage(channelId: string, threadId: string, content: string): Promise<string> {
    const thread = await this.client.channels.fetch(threadId) as ThreadChannel;
    const msg = await thread.send(content);
    return msg.id;
  }

  async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
    // We need to find which channel/thread the message is in
    // For threads, the threadId is the channelId in Discord's model
    const channel = await this.client.channels.fetch(channelId) as TextChannel | ThreadChannel;
    const msg = await channel.messages.fetch(messageId);
    await msg.edit(content);
  }

  async uploadFile(channelId: string, threadId: string, filename: string, content: Buffer): Promise<void> {
    const thread = await this.client.channels.fetch(threadId) as ThreadChannel;
    await thread.send({
      files: [{ attachment: content, name: filename }],
    });
  }

  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId) as TextChannel | ThreadChannel;
    const msg = await channel.messages.fetch(messageId);
    await msg.react(emoji);
  }

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  onReaction(handler: (reaction: Reaction) => void): void {
    this.reactionHandler = handler;
  }

  private handleMessage(msg: DiscordMessage): void {
    if (msg.author.bot) return;
    if (!this.messageHandler) return;

    // Determine if this is in a thread
    const isThread = msg.channel.type === ChannelType.PublicThread || msg.channel.type === ChannelType.PrivateThread;
    const threadId = isThread ? msg.channel.id : null;
    const channelId = isThread ? (msg.channel as ThreadChannel).parentId! : msg.channel.id;

    this.messageHandler({
      platform: "discord",
      channelId,
      threadId,
      messageId: msg.id,
      userId: msg.author.id,
      userName: msg.author.username,
      content: msg.content,
      attachments: msg.attachments.map(a => ({
        filename: a.name ?? "file",
        content: Buffer.alloc(0), // Attachments fetched lazily if needed
        mimeType: a.contentType ?? undefined,
      })),
      replyToMessageId: msg.reference?.messageId ?? undefined,
    });
  }

  private handleReaction(reaction: MessageReaction, user: User): void {
    if (user.bot) return;
    if (!this.reactionHandler) return;

    const channel = reaction.message.channel;
    const isThread = channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread;

    if (!isThread) return; // Only handle reactions in threads

    this.reactionHandler({
      platform: "discord",
      channelId: (channel as ThreadChannel).parentId!,
      threadId: channel.id,
      messageId: reaction.message.id,
      emoji: reaction.emoji.name ?? "❓",
      userId: user.id,
    });
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/discord.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/adapters/adapter.ts src/adapters/discord.ts tests/discord.test.ts
git commit -m "feat: implement Discord adapter with thread/reaction support"
```

---

## Chunk 6: Router and Main Entry Point

### Task 8: Implement Router

**Files:**
- Create: `src/router.ts`
- Create: `tests/router.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/router.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Router } from "../src/router.js";
import type { AppConfig, IncomingMessage } from "../src/types.js";
import { Store } from "../src/store.js";
import { unlinkSync } from "fs";

const dbPath = `/tmp/cc2im-router-test-${Date.now()}.db`;

const mockConfig: AppConfig = {
  lark: { appId: "", appSecret: "" },
  discord: { token: "" },
  projects: [
    { name: "test-project", directory: "/tmp/test", platforms: { discord: true } },
  ],
  claude: { command: "echo", defaultArgs: [], bufferInterval: 100, timeout: 5000 },
  formatter: { maxMessageLength: { discord: 2000, lark: 30000 }, maxConcurrentProcesses: 5 },
};

describe("Router", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store(dbPath);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(dbPath); } catch {}
  });

  it("resolves project from channel mapping", () => {
    const router = new Router(mockConfig, store);
    router.registerChannel("channel-1", "discord", "test-project");
    const project = router.getProject("channel-1", "discord");
    expect(project).not.toBeNull();
    expect(project!.name).toBe("test-project");
  });

  it("returns null for unknown channel", () => {
    const router = new Router(mockConfig, store);
    const project = router.getProject("unknown", "discord");
    expect(project).toBeNull();
  });

  it("detects management commands", () => {
    const router = new Router(mockConfig, store);
    expect(router.isManagementCommand("/im-list-projects")).toBe(true);
    expect(router.isManagementCommand("/im-add-project foo /tmp")).toBe(true);
    expect(router.isManagementCommand("hello world")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/router.test.ts
```
Expected: FAIL — `Router` not found

- [ ] **Step 3: Implement Router**

```typescript
// src/router.ts
import type { AppConfig, Platform, ProjectConfig, IncomingMessage, Reaction } from "./types.js";
import { Store } from "./store.js";

interface ChannelMapping {
  platform: Platform;
  projectName: string;
}

export class Router {
  private channelMap = new Map<string, ChannelMapping>();

  constructor(
    private config: AppConfig,
    private store: Store,
  ) {}

  registerChannel(channelId: string, platform: Platform, projectName: string): void {
    this.channelMap.set(`${platform}:${channelId}`, { platform, projectName });
  }

  getProject(channelId: string, platform: Platform): ProjectConfig | null {
    const mapping = this.channelMap.get(`${platform}:${channelId}`);
    if (!mapping) return null;
    return this.config.projects.find(p => p.name === mapping.projectName) ?? null;
  }

  getSessionId(threadId: string, platform: Platform): string | null {
    const thread = this.store.getThread(threadId, platform);
    return thread?.session_id ?? null;
  }

  isManagementCommand(content: string): boolean {
    return /^\/im-(add-project|remove-project|list-projects|reload-config)/.test(content);
  }

  parseManagementCommand(content: string): { command: string; args: string[] } | null {
    const match = content.match(/^\/im-(\S+)\s*(.*)/);
    if (!match) return null;
    return {
      command: match[1],
      args: match[2].trim().split(/\s+/).filter(Boolean),
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/router.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/router.ts tests/router.test.ts
git commit -m "feat: implement Router with channel-project mapping and management commands"
```

---

### Task 9: Implement main entry point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write main entry point**

```typescript
// src/index.ts
import { loadConfig, saveConfig, addProject, removeProject } from "./config.js";
import { Store } from "./store.js";
import { SessionManager } from "./session.js";
import { Formatter } from "./formatter.js";
import { Router } from "./router.js";
import { DiscordAdapter } from "./adapters/discord.js";
import type { PlatformAdapter, IncomingMessage, Reaction, Platform } from "./types.js";
import { resolve } from "path";

const CONFIG_PATH = resolve(process.env.CC2IM_CONFIG ?? "config.yaml");
const DB_PATH = resolve(process.env.CC2IM_DB ?? "cc2im.db");

async function main() {
  console.log("cc2im starting...");

  let config = loadConfig(CONFIG_PATH);
  const store = new Store(DB_PATH);
  const sessionManager = new SessionManager(config.claude, config.formatter);
  const formatter = new Formatter(config.formatter);
  const router = new Router(config, store);

  const adapters: PlatformAdapter[] = [];

  // Initialize Discord adapter if configured
  if (config.discord.token) {
    const discord = new DiscordAdapter(config.discord.token);
    adapters.push(discord);
  }

  // Start all adapters
  for (const adapter of adapters) {
    await adapter.start();

    // Setup project channels
    for (const project of config.projects) {
      if (!project.platforms[adapter.platform]) continue;
      const channelInfo = await adapter.setupProject(project);
      router.registerChannel(channelInfo.channelId, adapter.platform, project.name);
      console.log(`Registered ${adapter.platform} channel ${channelInfo.channelId} → ${project.name}`);
    }

    // Handle incoming messages
    adapter.onMessage(async (msg) => {
      try {
        await handleMessage(msg, adapter, router, sessionManager, formatter, store, config);
      } catch (err) {
        console.error("Error handling message:", err);
      }
    });

    // Handle reactions
    adapter.onReaction(async (reaction) => {
      try {
        await handleReaction(reaction, adapter, router, sessionManager, formatter, store, config);
      } catch (err) {
        console.error("Error handling reaction:", err);
      }
    });
  }

  console.log("cc2im ready.");

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    for (const adapter of adapters) {
      await adapter.stop();
    }
    store.close();
    process.exit(0);
  });
}

async function handleMessage(
  msg: IncomingMessage,
  adapter: PlatformAdapter,
  router: Router,
  sessionManager: SessionManager,
  formatter: Formatter,
  store: Store,
  config: ReturnType<typeof loadConfig>,
) {
  // Check for management commands
  if (router.isManagementCommand(msg.content)) {
    await handleManagementCommand(msg, adapter, router, config);
    return;
  }

  // Find project for this channel
  const project = router.getProject(msg.channelId, msg.platform);
  if (!project) return; // Not a registered channel

  // Create thread if this is a top-level message
  let threadId = msg.threadId;
  if (!threadId) {
    threadId = await adapter.createThread(msg.channelId, msg.messageId);
  }

  // Get existing session for this thread
  const existingSessionId = router.getSessionId(threadId, msg.platform);

  // Send initial "thinking" indicator
  let currentMessageId = await adapter.sendMessage(msg.channelId, threadId, "⏳ _Thinking..._");
  store.saveMessage(currentMessageId, msg.platform, threadId, true, "thinking...");

  let bufferedText = "";
  let lastFlush = Date.now();
  const bufferInterval = config.claude.bufferInterval;
  const threadKey = `${msg.platform}:${threadId}`;

  try {
    const result = await sessionManager.invoke(
      threadKey,
      project.directory,
      existingSessionId,
      msg.content,
      async (event) => {
        // Stream handler: buffer and flush text updates
        if (event.type === "assistant" && "message" in event) {
          const content = (event as any).message?.content;
          if (content) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                bufferedText += block.text;
              }
            }
          }

          // Flush buffer periodically
          const now = Date.now();
          if (now - lastFlush >= bufferInterval && bufferedText) {
            try {
              const display = bufferedText.slice(0, formatter.getMaxLength(msg.platform));
              await adapter.editMessage(threadId!, currentMessageId, display).catch(() => {});
              lastFlush = now;
            } catch {}
          }
        }
      },
    );

    // Save session mapping
    store.upsertThread(threadId, msg.platform, msg.channelId, result.sessionId, project.name);

    // Format final output
    const { cleanText, reactions } = formatter.extractReactions(result.text);
    const formatted = formatter.formatOutput(cleanText, msg.platform);

    // Update the message with final content
    if (formatted.messages.length > 0) {
      await adapter.editMessage(threadId!, currentMessageId, formatted.messages[0]);
    }

    // Send additional message chunks
    for (let i = 1; i < formatted.messages.length; i++) {
      const extraId = await adapter.sendMessage(msg.channelId, threadId, formatted.messages[i]);
      store.saveMessage(extraId, msg.platform, threadId, true, formatted.messages[i].slice(0, 100));
    }

    // Upload attachments
    for (const attachment of formatted.attachments) {
      await adapter.uploadFile(msg.channelId, threadId, attachment.filename, attachment.content);
    }

    // Add reactions
    for (const emoji of reactions) {
      await adapter.addReaction(threadId!, currentMessageId, emoji);
    }

    // Update message record
    store.saveMessage(currentMessageId, msg.platform, threadId, true, cleanText.slice(0, 200));

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await adapter.editMessage(threadId!, currentMessageId, `❌ Error: ${errorMsg}`);

    // If resume failed, clear session and notify
    if (errorMsg.includes("resume") || errorMsg.includes("session")) {
      store.deleteThread(threadId, msg.platform);
      await adapter.sendMessage(msg.channelId, threadId, "⚠️ Session reset. Please send your message again.");
    }
  }
}

async function handleReaction(
  reaction: Reaction,
  adapter: PlatformAdapter,
  router: Router,
  sessionManager: SessionManager,
  formatter: Formatter,
  store: Store,
  config: ReturnType<typeof loadConfig>,
) {
  const project = router.getProject(reaction.channelId, reaction.platform);
  if (!project) return;

  const sessionId = router.getSessionId(reaction.threadId, reaction.platform);
  if (!sessionId) return;

  // Find the message that was reacted to
  const msg = store.getMessage(reaction.messageId, reaction.platform);
  const summary = msg?.content_summary ?? "a message";

  // Send the reaction context as a new message to Claude
  const reactionText = `用户对消息「${summary}」添加了表情 ${reaction.emoji}`;
  await handleMessage(
    {
      platform: reaction.platform,
      channelId: reaction.channelId,
      threadId: reaction.threadId,
      messageId: reaction.messageId,
      userId: reaction.userId,
      userName: "user",
      content: reactionText,
      attachments: [],
    },
    adapter,
    router,
    sessionManager,
    formatter,
    store,
    config,
  );
}

async function handleManagementCommand(
  msg: IncomingMessage,
  adapter: PlatformAdapter,
  router: Router,
  config: ReturnType<typeof loadConfig>,
) {
  const parsed = router.parseManagementCommand(msg.content);
  if (!parsed) return;

  const threadId = msg.threadId ?? msg.channelId;

  switch (parsed.command) {
    case "list-projects": {
      const list = config.projects.map(p =>
        `• **${p.name}** → \`${p.directory}\` (${Object.entries(p.platforms).filter(([,v]) => v).map(([k]) => k).join(", ")})`
      ).join("\n");
      await adapter.sendMessage(msg.channelId, threadId, list || "_No projects configured_");
      break;
    }

    case "add-project": {
      if (parsed.args.length < 2) {
        await adapter.sendMessage(msg.channelId, threadId, "Usage: `/im-add-project <name> <directory>`");
        return;
      }
      const [name, directory] = parsed.args;
      const project = { name, directory, platforms: { [msg.platform]: true } as any };
      addProject(config, project);
      saveConfig(CONFIG_PATH, config);

      const channelInfo = await adapter.setupProject(project);
      router.registerChannel(channelInfo.channelId, msg.platform, name);

      await adapter.sendMessage(msg.channelId, threadId, `✅ Project **${name}** added → \`${directory}\``);
      break;
    }

    case "remove-project": {
      if (parsed.args.length < 1) {
        await adapter.sendMessage(msg.channelId, threadId, "Usage: `/im-remove-project <name>`");
        return;
      }
      removeProject(config, parsed.args[0]);
      saveConfig(CONFIG_PATH, config);
      await adapter.sendMessage(msg.channelId, threadId, `✅ Project **${parsed.args[0]}** removed`);
      break;
    }

    case "reload-config": {
      // Reload config from file
      Object.assign(config, loadConfig(CONFIG_PATH));
      await adapter.sendMessage(msg.channelId, threadId, "✅ Config reloaded");
      break;
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```
Expected: no errors (may need minor type fixes)

- [ ] **Step 3: Create config.yaml with the Discord token**

Create `config.yaml` with the actual Discord token for testing:

```yaml
lark:
  appId: ""
  appSecret: ""

discord:
  token: ""

projects: []

claude:
  command: "claude"
  defaultArgs: ["--print", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"]
  bufferInterval: 500
  timeout: 300000

formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
```

Set the token via env var: `export DISCORD_TOKEN="<token>"`

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/router.ts
git commit -m "feat: implement Router and main entry point with full message flow"
```

---

## Chunk 7: Integration Test and First Run

### Task 10: End-to-end test with Discord

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run
```
Expected: all PASS

- [ ] **Step 2: Build the project**

```bash
npm run build
```
Expected: no errors

- [ ] **Step 3: Start the service with Discord token**

```bash
DISCORD_TOKEN="<token>" npm run dev
```
Expected: "cc2im ready." output, bot appears online in Discord

- [ ] **Step 4: Manual test — send a message in a project channel**

1. Add a project via `/im-add-project test-project /tmp/test-project`
2. Go to the created `#cc2im-test-project` channel
3. Send "Hello, what can you do?"
4. Verify: bot creates a thread, responds with Claude Code output
5. Send a follow-up in the thread
6. Verify: context is preserved via `--resume`

- [ ] **Step 5: Manual test — reactions**

1. Add a 👎 reaction to a bot response
2. Verify: bot acknowledges the reaction in the thread

- [ ] **Step 6: Manual test — long output**

1. Ask Claude to generate a long piece of code
2. Verify: streaming updates, final formatted output or attachment

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: cc2im v0.1.0 — Claude Code to Discord bridge"
```
