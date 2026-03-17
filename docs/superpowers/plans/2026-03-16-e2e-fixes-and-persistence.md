# E2E Fixes & Chat Persistence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 40 E2E test failures by implementing web chat persistence, fixing the multi-turn reactivity bug, updating CLI test container references, and adding a second E2E project.

**Architecture:** Web chat messages are persisted to SQLite via the existing `store.saveMessage()` / `store.upsertThread()` methods. A new REST endpoint serves message history. The UI loads history on session select. The Svelte store reactivity bug is fixed by creating new object references on mutation.

**Tech Stack:** TypeScript, Svelte 5, Playwright, SQLite (better-sqlite3), Node.js HTTP server, WebSocket

---

## Failure Root Cause Summary

| Root Cause | Tests | Fix |
|------------|-------|-----|
| Web sessions not persisted to DB → `.session-item` not found after refresh | 11 chat-missing, chat-edge, sidebar-sessions, sidebar-extended | Task 1 + Task 2 + Task 3 |
| Svelte store mutation doesn't trigger reactivity on 2nd+ message | multiturn timing (not caught by E2E yet) | Task 4 |
| CLI tests use `cc2im-app-1` but container is `e2e-app-1` | 17 cli.spec.ts | Task 5 |
| Stats tests need 2+ projects | 2 stats-missing, stats-extended | Task 6 |
| `config.formatter.maxMessageLength` undefined in API response | 1 config-extended | Task 7 (investigate & report) |
| Onboarding `.status-msg.success` not visible after test command | 1 onboarding.spec.ts | Task 7 (investigate & report) |
| Token display selector `.token-display, .token-count, .token-stats` not found | 1 chat-missing:707 | Task 3 (UI already has `.token-bar`) |

---

## Task 1: Persist Web Messages in `ws.ts`

**Files:**
- Modify: `packages/server/src/ws.ts`
- Modify: `packages/core/src/store.ts` (add `getMessagesByThread`)

- [ ] **Step 1: Add `getMessagesByThread` method to Store**

In `packages/core/src/store.ts`, add after `getLastBotMessage`:

```typescript
getMessagesByThread(threadId: string, platform: Platform): MessageRow[] {
  return this.db.prepare(
    "SELECT * FROM messages WHERE thread_id = ? AND platform = ? ORDER BY created_at ASC"
  ).all(threadId, platform) as MessageRow[];
}
```

- [ ] **Step 2: Persist thread and messages in `handleChatSend`**

In `packages/server/src/ws.ts`, in `handleChatSend()`, before calling `sessionManager.invoke()`:

```typescript
// Save user message
const userMsgId = `web-${threadKey}-user-${Date.now()}`;
ctx.store.upsertThread(threadKey, "web", `web:${payload.project}`, sessionId ?? "", payload.project);
ctx.store.saveMessage(userMsgId, "web", threadKey, false, payload.message.slice(0, 200));
```

After `broadcast(clients, { type: "chat.done" ... })`:

```typescript
// Save assistant message
const botMsgId = `web-${threadKey}-bot-${Date.now()}`;
ctx.store.saveMessage(botMsgId, "web", threadKey, true, result.text.slice(0, 200));
// Update thread with real session ID
ctx.store.upsertThread(threadKey, "web", `web:${payload.project}`, result.sessionId || "", payload.project);
```

Need to add `"web"` to the Platform type. Check if it already exists.

- [ ] **Step 3: Build and run unit tests**

```bash
npm run build && npm run test
```

---

## Task 2: Add Messages API Endpoint

**Files:**
- Modify: `packages/server/src/api.ts`

- [ ] **Step 1: Add GET /api/sessions/:id/messages endpoint**

In `packages/server/src/api.ts`, add before the 404 fallback:

```typescript
// GET /api/sessions/:id/messages
const sessMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
if (method === "GET" && sessMatch) {
  const threadId = decodeURIComponent(sessMatch[1]);
  const messages = ctx.store.getMessagesByThread(threadId, "web");
  return json(res, 200, messages);
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

---

## Task 3: Load History in UI on Session Select

**Files:**
- Modify: `packages/ui/src/lib/stores/chat.ts`
- Modify: `packages/ui/src/lib/Chat.svelte`

- [ ] **Step 1: Add `loadSession` function to chat store**

In `packages/ui/src/lib/stores/chat.ts`, add:

```typescript
export async function loadSession(baseUrl: string, threadId: string, project: string): Promise<void> {
  // Don't reload if already in memory
  let existing: Session | undefined;
  sessions.update(s => { existing = s.get(threadId); return s; });
  if (existing && existing.messages.length > 0) return;

  try {
    const res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(threadId)}/messages`);
    if (!res.ok) return;
    const rows: Array<{ message_id: string; is_bot: number; content_summary: string | null; created_at: string }> = await res.json();
    if (rows.length === 0) return;

    const messages: ChatMessage[] = rows.map(r => ({
      id: r.message_id,
      role: r.is_bot ? "assistant" as const : "user" as const,
      content: r.content_summary ?? "",
    }));

    sessions.update(s => {
      const newMap = new Map(s);
      newMap.set(threadId, { id: threadId, project, messages });
      return newMap;
    });
  } catch {
    // Silently fail - session just won't have history
  }
}
```

- [ ] **Step 2: Call `loadSession` in Chat.svelte when session changes**

In `packages/ui/src/lib/Chat.svelte`, add an `$effect` that loads history when `sessKey` changes and points to a server-side session (not `new-*`):

```typescript
$effect(() => {
  if (sessKey && !sessKey.startsWith("new-")) {
    loadSession("", sessKey, project ?? "");
  }
});
```

Note: `baseUrl` is empty string since the UI is served from the same origin.

- [ ] **Step 3: Build**

```bash
npm run build
```

---

## Task 4: Fix Svelte Reactivity Bug in `sendMessage`

**Files:**
- Modify: `packages/ui/src/lib/stores/chat.ts`

- [ ] **Step 1: Fix `sendMessage` to create new references**

Replace the `sessions.update()` block in `sendMessage`:

```typescript
sessions.update(s => {
  const newMap = new Map(s);
  const existing = newMap.get(sessKey);
  const session = existing ?? { id: sessionId ?? null, project, messages: [] };
  const newMessages = [
    ...session.messages,
    { id: msgId, role: "user" as const, content: message },
    { id: msgId + "-reply", role: "assistant" as const, content: "", streaming: true },
  ];
  newMap.set(sessKey, { ...session, messages: newMessages });
  return newMap;
});
```

- [ ] **Step 2: Update multi-turn E2E test timing assertion**

In `test/e2e/chat-multiturn.spec.ts`, in test `"second message in same session"`, change the user bubble assertion timeout from 5000ms to 500ms to catch the optimistic UI timing:

```typescript
// Line ~31: change timeout to catch immediate appearance
await expect(userBubbles).toHaveCount(2, { timeout: 500 });
```

- [ ] **Step 3: Build**

```bash
npm run build
```

---

## Task 5: Fix CLI Test Container Name

**Files:**
- Modify: `test/e2e/cli.spec.ts` line 5

- [ ] **Step 1: Update container name constant**

Change:
```typescript
const CONTAINER = "cc2im-app-1";
```
To:
```typescript
const CONTAINER = "e2e-app-1";
```

---

## Task 6: Add Second E2E Project

**Files:**
- Modify: `test/e2e/fixtures/config.e2e.yaml`
- Modify: `test/e2e/Dockerfile` (create `/tmp/e2e2` directory)

- [ ] **Step 1: Add second project to config**

In `test/e2e/fixtures/config.e2e.yaml`, add under projects:

```yaml
projects:
  - name: e2e-project
    directory: /tmp/e2e
    platforms:
      web: true
  - name: e2e-project-2
    directory: /tmp/e2e2
    platforms:
      web: true
```

- [ ] **Step 2: Create directory in Dockerfile**

In `test/e2e/Dockerfile`, change:
```dockerfile
RUN mkdir -p /tmp/e2e
```
To:
```dockerfile
RUN mkdir -p /tmp/e2e /tmp/e2e2
```

---

## Task 7: Investigate & Report Remaining Failures

These tests may still fail after Tasks 1-6 due to issues unrelated to our changes. Investigate after running E2E:

- [ ] **config-extended:42** — `config.formatter.maxMessageLength` is undefined. The test assumes the first `input[type='number']` is `maxMessageLength.discord`. Investigate what the actual first numeric input is and whether the API response structure matches.

- [ ] **onboarding.spec.ts:24** — `.status-msg.success` not visible after testing Claude command. The mock Claude is at `/app/e2e/fixtures/mock-claude.sh` — verify the onboarding test flow triggers the mock correctly.

- [ ] **chat-missing:707 "token stats non-zero"** — Selector `.token-display, .token-count, .token-stats` doesn't match any element. The UI uses `.token-bar` class. Check if the test selector needs to match the actual UI class.

---

## Task 8: Run E2E Tests & Iterate

- [ ] **Step 1: Full rebuild**

```bash
npm run build
```

- [ ] **Step 2: Run E2E**

```bash
npm run test:e2e:docker
```

- [ ] **Step 3: Analyze remaining failures, fix code (not tests), re-run**

Repeat until stable. Report any failures that require test changes.
