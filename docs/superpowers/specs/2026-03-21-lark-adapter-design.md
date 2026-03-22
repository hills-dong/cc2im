# Lark Adapter Design Spec

## Overview

Add a Lark (飞书) platform adapter to cc2im, enabling users to chat with Claude Code through Lark group chats. The adapter follows the existing `PlatformAdapter` interface pattern used by Discord and Web adapters.

## Architecture

### SDK & Authentication
- Use `@larksuiteoapi/node-sdk` (official Lark SDK for Node.js)
- Authenticate via `app_id` + `app_secret` (already in config schema)
- Use WebSocket-based event subscription (no public URL needed)

### Concept Mapping

| cc2im Concept | Lark Concept |
|---|---|
| Channel | Chat group (群聊), `chat_id` |
| Thread | Reply chain under root message, keyed by `root_id` / `message_id` |
| Message | Lark message, `message_id` |
| Reaction | Lark message reaction |

### Message Flow

**Incoming:**
1. Bot receives `im.message.receive_v1` event via WebSocket
2. Filter: only process messages that @mention the bot (in group chats)
3. Parse message content (JSON-encoded text), strip @mention
4. Map to `IncomingMessage`: `chat_id` → `channelId`, `root_id` → `threadId`
5. Dispatch to message handler

**Outgoing:**
1. `sendMessage()`: Reply to root message via `im.message.reply`
2. `editMessage()`: Patch message via `im.message.patch`
3. `uploadFile()`: Upload via `im.file.create`, send as file/image message

### Thread Model
- First message in a group → `createThread()` returns user's `message_id` as threadId
- All subsequent bot messages → sent as replies to that root message
- Incoming messages with `root_id` → existing thread; without → new conversation

### Channel (Chat Group) Management
- `setupProject()`: Find existing chat named `cc2im-{project}` or create one
- Bot must be added to the chat group

### Message Types
- Use `text` type for all messages (supports editing, simplest to implement)
- Content format: `{"text": "message content"}`
- Max length: 30000 chars (already configured in formatter)

### Event Handling
- `im.message.receive_v1`: Incoming messages
- `im.message.reaction.created_v1`: Reactions added to messages

### @Mention Behavior
- In group chats: only respond when @mentioned
- Strip the @mention prefix from message content before processing
- Use `message.mentions` field to detect bot mention

## Files to Create/Modify

1. **New**: `packages/cli/src/adapters/lark.ts` — LarkAdapter implementation
2. **Modify**: `packages/cli/src/index.ts` — Register LarkAdapter
3. **Modify**: `packages/cli/package.json` — Add `@larksuiteoapi/node-sdk` dependency

## Config (already supported)

```yaml
lark:
  appId: "cli_xxx"
  appSecret: "xxx"
```

Environment variables: `LARK_APP_ID`, `LARK_APP_SECRET` (already wired in config.ts).
