# /im-resume Discord Command Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/im-resume` Discord slash command with autocomplete that lets users search and select a Claude Code session to resume in the current thread, pulling from both cc2im's database and Claude Code's local session files.

**Architecture:** New `SessionScanner` utility scans `~/.claude/projects/` JSONL files + cc2im's `threads` table to build a unified session list. Discord adapter registers `/im-resume` with an autocomplete string option. Autocomplete handler filters sessions by user input. Command handler links the selected session to the current Discord thread.

**Tech Stack:** Node.js, discord.js v14 (autocomplete API), SQLite (better-sqlite3), fs/readdir for Claude Code session files

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/src/session-scanner.ts` | Create | Scan `~/.claude/projects/` for session metadata + merge with cc2im DB |
| `packages/core/src/index.ts` | Modify | Export `SessionScanner` |
| `packages/core/src/adapters/discord.ts` | Modify | Register `/im-resume` command with autocomplete + handle autocomplete interaction |
| `packages/cli/src/index.ts` | Modify | Add `resume` case to slash command handler |
| `packages/core/tests/session-scanner.test.ts` | Create | Unit tests for session scanning |

---

## Task 1: SessionScanner — scan Claude Code sessions from disk

**Files:**
- Create: `packages/core/src/session-scanner.ts`
- Create: `packages/core/tests/session-scanner.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for `SessionScanner`**

Create `packages/core/tests/session-scanner.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionScanner, type ScannedSession } from "../src/session-scanner.js";
import { Store } from "../src/store.js";
import { mkdirSync, writeFileSync, rmSync, unlinkSync } from "fs";
import { join } from "path";

const TEST_DIR = "test-claude-sessions";
const TEST_DB = "test-scanner.db";

describe("SessionScanner", () => {
  let store: Store;
  let scanner: SessionScanner;

  beforeEach(() => {
    store = new Store(TEST_DB);
    mkdirSync(join(TEST_DIR, "-home-user-projects-myapp"), { recursive: true });
    scanner = new SessionScanner(TEST_DIR, store);
  });

  afterEach(() => {
    store.close();
    try { unlinkSync(TEST_DB); } catch {}
    try { unlinkSync(TEST_DB + "-wal"); } catch {}
    try { unlinkSync(TEST_DB + "-shm"); } catch {}
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("scans JSONL files from Claude Code projects dir", () => {
    // Create a fake session JSONL with a user message
    const sessionId = "abc12345-1111-2222-3333-444444444444";
    const jsonl = JSON.stringify({
      type: "user",
      message: { role: "user", content: "hello world" },
      timestamp: "2026-03-18T10:00:00.000Z",
      sessionId,
    });
    writeFileSync(
      join(TEST_DIR, "-home-user-projects-myapp", `${sessionId}.jsonl`),
      jsonl + "\n",
    );

    const sessions = scanner.scan();
    const found = sessions.find(s => s.sessionId === sessionId);
    expect(found).toBeDefined();
    expect(found!.project).toBe("myapp");
    expect(found!.source).toBe("tui");
    expect(found!.firstMessage).toBe("hello world");
  });

  it("includes cc2im database sessions", () => {
    store.upsertThread("t1", "discord", "ch1", "db-sess-1", "proj-a");
    const sessions = scanner.scan();
    const found = sessions.find(s => s.sessionId === "db-sess-1");
    expect(found).toBeDefined();
    expect(found!.source).toBe("discord");
    expect(found!.project).toBe("proj-a");
  });

  it("deduplicates sessions present in both sources (DB wins)", () => {
    const sessionId = "shared-sess-1";
    store.upsertThread("t1", "discord", "ch1", sessionId, "proj-a");

    const jsonl = JSON.stringify({
      type: "user",
      message: { role: "user", content: "from tui" },
      timestamp: "2026-03-18T10:00:00.000Z",
      sessionId,
    });
    writeFileSync(
      join(TEST_DIR, "-home-user-projects-myapp", `${sessionId}.jsonl`),
      jsonl + "\n",
    );

    const sessions = scanner.scan();
    const matches = sessions.filter(s => s.sessionId === sessionId);
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe("discord");
  });

  it("returns empty array when no sessions exist", () => {
    const sessions = scanner.scan();
    expect(sessions).toEqual([]);
  });

  it("sorts sessions by timestamp descending (most recent first)", () => {
    const old = "old-sess-0000-0000-0000-000000000000";
    const recent = "new-sess-0000-0000-0000-000000000000";
    writeFileSync(
      join(TEST_DIR, "-home-user-projects-myapp", `${old}.jsonl`),
      JSON.stringify({ type: "user", message: { role: "user", content: "old" }, timestamp: "2026-03-10T10:00:00.000Z", sessionId: old }) + "\n",
    );
    writeFileSync(
      join(TEST_DIR, "-home-user-projects-myapp", `${recent}.jsonl`),
      JSON.stringify({ type: "user", message: { role: "user", content: "recent" }, timestamp: "2026-03-18T10:00:00.000Z", sessionId: recent }) + "\n",
    );

    const sessions = scanner.scan();
    expect(sessions[0].sessionId).toBe(recent);
  });

  it("filters sessions by query string", () => {
    store.upsertThread("t1", "discord", "ch1", "sess-1", "myapp");
    store.upsertThread("t2", "discord", "ch2", "sess-2", "other-project");

    const sessions = scanner.scan("myapp");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].project).toBe("myapp");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run tests/session-scanner.test.ts`
Expected: FAIL — cannot resolve `../src/session-scanner.js`

- [ ] **Step 3: Implement `SessionScanner`**

Create `packages/core/src/session-scanner.ts`:

```ts
import { readdirSync, openSync, readSync, closeSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import type { Store } from "./store.js";

export interface ScannedSession {
  sessionId: string;
  project: string;
  source: "tui" | "discord" | "web" | "lark";
  firstMessage: string | null;
  timestamp: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SessionScanner {
  private claudeDir: string;
  private store: Store;

  constructor(claudeProjectsDir: string | null, store: Store) {
    this.claudeDir = claudeProjectsDir ?? join(homedir(), ".claude", "projects");
    this.store = store;
  }

  scan(query?: string): ScannedSession[] {
    const dbSessions = this.scanDatabase();
    const diskSessions = this.scanDisk();

    // Merge: DB sessions take priority for dedup
    const seen = new Set(dbSessions.map(s => s.sessionId));
    const merged = [
      ...dbSessions,
      ...diskSessions.filter(s => !seen.has(s.sessionId)),
    ];

    // Sort by timestamp descending
    merged.sort((a, b) => {
      const ta = a.timestamp ?? "";
      const tb = b.timestamp ?? "";
      return tb.localeCompare(ta);
    });

    // Filter by query
    if (query) {
      const q = query.toLowerCase();
      return merged.filter(s =>
        s.project.toLowerCase().includes(q) ||
        s.sessionId.toLowerCase().includes(q) ||
        (s.firstMessage?.toLowerCase().includes(q) ?? false)
      );
    }

    return merged;
  }

  private scanDatabase(): ScannedSession[] {
    const threads = this.store.listSessions();
    return threads.map(t => ({
      sessionId: t.session_id,
      project: t.project_name,
      source: t.platform as ScannedSession["source"],
      firstMessage: t.name ?? null,
      timestamp: t.created_at,
    }));
  }

  private scanDisk(): ScannedSession[] {
    const sessions: ScannedSession[] = [];
    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.claudeDir);
    } catch {
      return [];
    }

    for (const projDir of projectDirs) {
      const projPath = join(this.claudeDir, projDir);
      try {
        if (!statSync(projPath).isDirectory()) continue;
      } catch { continue; }

      // Extract project name from encoded path (e.g., "-home-user-projects-myapp" → "myapp")
      const projectName = this.extractProjectName(projDir);

      let files: string[];
      try {
        files = readdirSync(projPath);
      } catch { continue; }

      for (const file of files) {
        if (!file.endsWith(".jsonl")) continue;
        const sessionId = basename(file, ".jsonl");
        if (!UUID_RE.test(sessionId)) continue;

        const filePath = join(projPath, file);
        const { firstMessage, timestamp } = this.peekSession(filePath);

        sessions.push({
          sessionId,
          project: projectName,
          source: "tui",
          firstMessage,
          timestamp: timestamp ?? this.getFileMtime(filePath),
        });
      }
    }
    return sessions;
  }

  private extractProjectName(encodedDir: string): string {
    // Claude Code encodes paths by replacing "/" with "-", e.g.
    // "-home-user-projects-myapp" → "/home/user/projects/myapp"
    // This is lossy for hyphenated dir names, but basename of decoded path
    // works for the common case. Known limitation: "my-cool-app" → "app".
    const decoded = "/" + encodedDir.replace(/^-/, "");
    // Take the last path-like segment: split on common prefixes
    // Look for the last segment that could be a project name
    const parts = decoded.split("/");
    return parts[parts.length - 1] || encodedDir;
  }

  private peekSession(filePath: string): { firstMessage: string | null; timestamp: string | null } {
    try {
      // Read only first 4KB to avoid loading multi-MB session files
      const fd = openSync(filePath, "r");
      const buf = Buffer.alloc(4096);
      const bytesRead = readSync(fd, buf, 0, 4096, 0);
      closeSync(fd);
      const lines = buf.toString("utf-8", 0, bytesRead).split("\n").slice(0, 20);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "user" && event.message?.content) {
            const content = typeof event.message.content === "string"
              ? event.message.content
              : event.message.content[0]?.text ?? null;
            return {
              firstMessage: content?.slice(0, 80) ?? null,
              timestamp: event.timestamp ?? null,
            };
          }
        } catch { continue; }
      }
    } catch {}
    return { firstMessage: null, timestamp: null };
  }

  private getFileMtime(filePath: string): string | null {
    try {
      return statSync(filePath).mtime.toISOString();
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Export from core index**

Add to `packages/core/src/index.ts`:

```ts
export { SessionScanner, type ScannedSession } from "./session-scanner.js";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run tests/session-scanner.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/session-scanner.ts packages/core/src/index.ts packages/core/tests/session-scanner.test.ts
git commit -m "feat(core): add SessionScanner for unified Claude Code session discovery"
```

---

## Task 2: Discord adapter — register `/im-resume` with autocomplete

**Files:**
- Modify: `packages/core/src/adapters/discord.ts:1-15` (imports)
- Modify: `packages/core/src/adapters/discord.ts:162-192` (registerSlashCommands)
- Modify: `packages/core/src/adapters/discord.ts:43-47` (interactionCreate handler)

- [ ] **Step 1: Add `AutocompleteInteraction` to discord.js imports**

In `packages/core/src/adapters/discord.ts`, add `AutocompleteInteraction` to the import:

```ts
import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type Message as DiscordMessage,
  type MessageReaction,
  type User,
  type TextChannel,
  type ThreadChannel,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  ChannelType,
} from "discord.js";
```

- [ ] **Step 2: Add autocomplete handler storage and callback setter**

Add after `slashCommandHandler` property (line 23):

```ts
private autocompleteHandler?: (interaction: AutocompleteInteraction) => void;
```

Add after `onSlashCommand` method (line 160):

```ts
onAutocomplete(handler: (interaction: AutocompleteInteraction) => void): void {
  this.autocompleteHandler = handler;
}
```

- [ ] **Step 3: Handle autocomplete interactions in `interactionCreate`**

Replace the `interactionCreate` handler (lines 43-47):

```ts
this.client.on("interactionCreate", (interaction) => {
  if (interaction.isChatInputCommand()) {
    this.slashCommandHandler?.(interaction);
  } else if (interaction.isAutocomplete()) {
    this.autocompleteHandler?.(interaction);
  }
});
```

- [ ] **Step 4: Register `/im-resume` slash command with autocomplete option**

In `registerSlashCommands()`, add to the commands array (after the existing `im-remove-project` builder):

```ts
new SlashCommandBuilder()
  .setName("im-resume")
  .setDescription("恢复一个已有的 Claude Code session")
  .addStringOption(o =>
    o.setName("session")
      .setDescription("搜索 session（项目名/消息内容/session ID）")
      .setRequired(true)
      .setAutocomplete(true)
  ),
```

- [ ] **Step 5: Verify build passes**

Run: `cd packages/core && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/adapters/discord.ts
git commit -m "feat(discord): register /im-resume command with autocomplete option"
```

---

## Task 3: CLI — autocomplete handler + resume command handler

**Files:**
- Modify: `packages/cli/src/index.ts:1-12` (imports)
- Modify: `packages/cli/src/index.ts:64-76` (adapter setup)
- Modify: `packages/cli/src/index.ts:420-499` (handleSlashCommand)

- [ ] **Step 1: Add imports for `SessionScanner` and `AutocompleteInteraction`**

In `packages/cli/src/index.ts`, update imports:

```ts
import {
  loadConfig, saveConfig, addProject, removeProject,
  Store, THREAD_STATUS_ICONS, type ThreadStatus,
  SessionManager, Formatter, Router, DiscordAdapter,
  SessionScanner,
  type PlatformAdapter, type IncomingMessage, type Reaction,
} from "@cc2im/core";
import type { ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
```

- [ ] **Step 2: Create `SessionScanner` instance and wire up autocomplete handler**

After the `adapter.onSlashCommand(...)` block (line 76), add:

```ts
const sessionScanner = new SessionScanner(null, store);
adapter.onAutocomplete(async (interaction) => {
  try {
    await handleAutocomplete(interaction, sessionScanner);
  } catch (err) {
    console.error("Error handling autocomplete:", err);
  }
});
```

- [ ] **Step 3: Implement `handleAutocomplete` function**

Add after the `handleSlashCommand` function:

```ts
async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  scanner: SessionScanner,
): Promise<void> {
  if (interaction.commandName !== "im-resume") return;

  const focused = interaction.options.getFocused();
  const sessions = scanner.scan(focused || undefined);

  const choices = sessions.slice(0, 25).map(s => {
    const label = [
      s.project,
      s.source !== "tui" ? `[${s.source}]` : "[tui]",
      s.firstMessage?.slice(0, 40) ?? s.sessionId.slice(0, 12),
    ].join(" | ");
    return {
      name: label.slice(0, 100),
      value: s.sessionId,
    };
  });

  await interaction.respond(choices);
}
```

- [ ] **Step 4: Add `resume` case to `handleSlashCommand`**

Update the `handleSlashCommand` signature to also accept `sessionScanner`:

```ts
async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  adapter: DiscordAdapter,
  router: Router,
  store: Store,
  config: ReturnType<typeof loadConfig>,
  sessionManager?: SessionManager,
  formatter?: Formatter,
  sessionScanner?: SessionScanner,
): Promise<void> {
```

Update the call site in `main()` to pass `sessionScanner`:

```ts
await handleSlashCommand(interaction, adapter, router, store, config, sessionManager, formatter, sessionScanner);
```

In the `switch (command)` block (before `default:`), add:

```ts
case "resume": {
  const sessionId = interaction.options.getString("session", true);
  if (!isThread) {
    await interaction.reply({ content: "⚠️ 请在 thread 中使用此命令，或者直接在频道中发送消息开始新对话", flags: 64 });
    return;
  }

  // Check if this thread already has a session
  const existing = store.getThread(threadId, "discord");
  if (existing) {
    await interaction.reply({ content: `⚠️ 此 thread 已经关联了 session \`${existing.session_id.slice(0, 12)}...\`。请在新 thread 中使用此命令。`, flags: 64 });
    return;
  }

  // Find which project this session belongs to
  const sessions = sessionScanner?.scan() ?? [];
  const target = sessions.find(s => s.sessionId === sessionId);
  if (!target) {
    await interaction.reply({ content: "⚠️ 未找到该 session", flags: 64 });
    return;
  }

  // Find project config
  const project = config.projects.find(p => p.name === target.project);
  if (!project) {
    await interaction.reply({ content: `⚠️ 项目 "${target.project}" 未在 config 中注册`, flags: 64 });
    return;
  }

  // Link session to this thread
  store.upsertThread(threadId, "discord", channelId, sessionId, target.project);
  store.updateThreadStatus(threadId, "discord", "active");

  await interaction.reply(`✅ 已关联 session \`${sessionId.slice(0, 12)}...\` (项目: **${target.project}**)\n\n发送消息即可继续之前的对话。`);
  break;
}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): add /im-resume slash command handler with autocomplete"
```

---

## Task 4: Build, restart, and verify

- [ ] **Step 1: Build all packages**

Run: `npm run build`
Expected: No errors

- [ ] **Step 2: Restart service**

Run: `cc2im restart`

- [ ] **Step 3: Manual verification in Discord**

Verify:
- Type `/im-resume` in Discord — autocomplete dropdown appears
- Typing a project name filters the list
- Selecting a session in a thread links it
- Subsequent messages in the thread resume the selected session
- Using in a thread that already has a session shows warning

- [ ] **Step 4: Commit any fixes from manual testing**
