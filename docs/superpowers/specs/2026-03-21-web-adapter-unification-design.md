# WebAdapter Unification Design

## Goal

Unify Web and Discord message paths by creating `WebAdapter implements PlatformAdapter`. All messages flow through `cli/index.ts handleMessage()`, eliminating the duplicated logic in `server/ws.ts handleChatSend()`.

## Current State

Two independent paths exist:

- **Discord:** `DiscordAdapter.onMessage` → `handleMessage()` → `adapter.sendMessage/editMessage`
- **Web:** `WebSocket chat.send` → `ws.ts handleChatSend()` → `SessionManager.invoke()` directly

The Web path reimplements session invocation, message saving, thread management, and streaming — all of which `handleMessage` already handles generically via `PlatformAdapter`.

## Design

### WebAdapter (`cli/src/adapters/web.ts`)

Implements `PlatformAdapter`. Wraps WebSocket connections and translates adapter calls into WS events.

**Method mapping:**

| PlatformAdapter method | WebAdapter behavior |
|---|---|
| `start()` | Create HTTP server (static + API), attach WebSocketServer |
| `stop()` | Close WS and HTTP server |
| `setupProject(project)` | Return `{ channelId: "web:{name}", platform: "web" }` |
| `createThread(channelId, msgId)` | Return `web:{project}:{Date.now()}` |
| `sendMessage(ch, threadId, content)` | Broadcast `chat.message` event via WS, return generated messageId |
| `editMessage(ch, messageId, content)` | Broadcast `chat.update` event via WS |
| `uploadFile(ch, threadId, name, buf)` | Broadcast `chat.file` event (base64) via WS |
| `getThreadName` / `renameThread` | No-op |
| `addReaction` | No-op |

**Additional method (not in PlatformAdapter):**

- `sendDone(threadId, tokens)` — called after `handleMessage` completes to send `chat.done` with token stats

**Broadcast strategy:** All events broadcast to all connected clients. Single-user tool; frontend filters by threadId client-side.

### WS Protocol

**Server → Client:**

| Event | Trigger | Payload |
|---|---|---|
| `chat.message` | `adapter.sendMessage` | `{ threadId, messageId, content }` |
| `chat.update` | `adapter.editMessage` | `{ threadId, messageId, content }` |
| `chat.done` | After handleMessage completes | `{ threadId, tokens }` |
| `chat.error` | handleMessage throws | `{ threadId, error }` |
| `session.update` | New/updated session | `{ project, threadId, name }` |

**Client → Server:**

| Event | Purpose | Payload |
|---|---|---|
| `chat.send` | User sends message | `{ project, message, threadKey? }` |
| `chat.abort` | User cancels | `{ threadKey }` |
| `sync.state` | Initial sync | `{}` |

`chat.subscribe` is removed — broadcast-to-all eliminates subscription tracking.

### main() Integration

`main()` accepts optional web server parameters:

```typescript
interface MainOptions {
  webPort?: number;
  webBind?: string;
  configPath?: string;
}
```

When `webPort` is provided, `main()` creates a WebAdapter and adds it to the adapters array. The existing adapter loop handles it uniformly — `setupProject`, `onMessage(handleMessage)`, etc.

The `cli.ts web` command becomes `main({ webPort, webBind, configPath })` instead of calling `createServer()`.

The adapter check `if (adapters.length === 0)` still works — Web counts as an adapter even without Discord.

### Completion signaling

`handleMessage` returns void. After it completes, the caller needs to send `chat.done` with tokens. The onMessage wrapper in main() handles this:

```typescript
webAdapter.onMessage(async (msg) => {
  const threadId = msg.threadId ?? msg.channelId;
  await handleMessage(msg, webAdapter, ...);
  const tokens = store.getSessionTokens(threadId);
  webAdapter.sendDone(threadId, tokens);
});
```

### Frontend Changes (`ui/src/lib/stores/chat.ts`)

- **Add** `chat.message` handler: create/update assistant message by messageId
- **Add** `chat.update` handler: full-content replace of message by messageId (not incremental append)
- **Keep** `chat.done` handler: set streaming=false, apply tokens
- **Keep** `chat.error` handler: unchanged
- **Remove** `chat.stream` handler: replaced by `chat.update`
- **Remove** `chat.subscribe` sends: no longer needed

### Server Package Simplification

- `server.ts createServer()` no longer creates `SessionManager` or calls `attachWebSocket`. It only serves static files + REST API.
- `ws.ts` `handleChatSend` and `attachWebSocket` are deleted. WS logic lives in `WebAdapter`.
- `createServer` signature keeps `store` injection for API endpoints.

### File Changes

| File | Change |
|---|---|
| **Create** `cli/src/adapters/web.ts` | WebAdapter implementation |
| Modify `cli/src/index.ts` | `main()` accepts MainOptions, creates WebAdapter when webPort set |
| Modify `cli/src/cli.ts` | `web` command calls `main({ webPort })` |
| Modify `server/src/server.ts` | Remove SessionManager dep, remove `attachWebSocket` call |
| Delete logic in `server/src/ws.ts` | `handleChatSend`, `attachWebSocket` removed |
| Modify `ui/src/lib/stores/chat.ts` | New protocol handlers |
| Modify `server/tests/ws*.test.ts` | Update for new protocol |
| Modify `ui/tests/chat.test.ts` | Update for new protocol |
