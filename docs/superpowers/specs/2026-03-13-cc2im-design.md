# cc2im — Claude Code to IM 设计文档

## 概述

cc2im 是一个桥接服务，让用户在 Lark 和 Discord 上直接与 Claude Code CLI 对话。每个项目对应一个本地目录和一个 IM 私密频道，消息通过 thread 隔离上下文，Claude Code 以透传模式执行真实的代码操作。

## 核心决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 交互模式 | 透传 Claude Code CLI | 完整能力，真实操作文件系统 |
| 进程绑定 | 按用户/频道绑定 | 独立上下文和工作目录 |
| 目录映射 | 配置文件固定映射 | 简洁可控 |
| 规模 | 个人/小团队，单机 | 不需要分布式基础设施 |
| 技术栈 | TypeScript / Node.js | SDK 生态成熟，开发效率高 |
| 架构 | 单进程事件驱动 | 简单直接，适合小规模 |
| 会话管理 | 按需启停 + `--resume` | 靠 Claude Code 自身持久化会话，服务端无状态 |
| 权限模式 | `--dangerously-skip-permissions` | 可信环境，避免确认中断 |
| 流式响应 | `--output-format stream-json` + 编辑消息 | 实时反馈 |

## 架构

```
┌─────────────┐   ┌─────────────┐
│  Lark Bot   │   │ Discord Bot │
│  (Adapter)  │   │  (Adapter)  │
└──────┬──────┘   └──────┬──────┘
       │                 │
       └────────┬────────┘
                ↓
        ┌───────────────┐
        │    Router     │  ← 按频道/thread路由消息
        └───────┬───────┘
                ↓
        ┌───────────────┐
        │ SessionManager│  ← threadId→sessionId映射
        └───────┬───────┘    按需启停Claude Code进程
                ↓
        ┌───────────────┐
        │   Formatter   │  ← 输出格式化 + 长度分级
        └───────┬───────┘
                ↓
        ┌───────────────┐
        │ ConfigManager │  ← YAML配置 + IM管理命令
        └───────────────┘
```

## 核心流程

1. IM 平台收到消息事件
2. Adapter 统一为内部消息格式
3. Router 根据频道确定项目目录，根据 thread 确定 session
4. SessionManager 调用 Claude Code CLI 并设置 `cwd` 为项目目录
5. 流式读取 stdout，按缓冲窗口批量更新 IM 消息
6. Formatter 处理最终输出（格式化 / 摘要+附件）
7. Adapter 将结果发回对应 thread

### Claude Code 调用

```bash
# 首次（新thread）
claude --print --output-format stream-json --dangerously-skip-permissions -p "用户消息"

# 后续（thread内回复）
claude --print --output-format stream-json --dangerously-skip-permissions --resume <session-id> -p "用户消息"
```

### Session ID 获取

首次调用（无 `--resume`）时，`stream-json` 输出中包含 `init` 事件，其中有 `session_id` 字段。SessionManager 解析该事件并将 `threadId → sessionId` 持久化到 SQLite。

### Thread 创建流程

当用户在频道发送顶层消息（`threadId` 为 null）时：
1. Adapter 收到消息事件
2. Adapter 调用平台 API **创建 thread**（以该消息为 thread 起始）
3. 将创建后的 `threadId` 填入 `IncomingMessage` 传递给 Router
4. Router 正常路由，SessionManager 启动新的 Claude Code 进程

### 并发与错误处理

- **同一 thread 内排队**：同一 thread 内的消息按序处理，前一个 Claude Code 进程未结束时，后续消息排队等待
- **进程超时**：超过 `timeout`（默认 300s）后 kill 子进程，在 thread 中回复超时提示
- **进程崩溃**：捕获非零退出码，在 thread 中回复错误信息。若 `--resume` 失败（session 已损坏），则清除该 thread 的 session 映射并启动新 session，通知用户上下文已重置
- **并发上限**：最大同时运行 5 个 Claude Code 进程（可配置），超出时排队并通知用户

## IM 交互模型

- 每个项目 = 一个本地目录 = 一个 IM 私密频道/群组
- 频道由服务自动创建，配置进群审核
- 频道内只有机器人和用户
- 任何消息自动创建 thread，在 thread 中回复
- 每个 thread 对应一个独立的 Claude Code session

### 表情交互（双向）

- **用户 → Claude**：用户对消息添加 reaction，转化为文本告知 Claude（如"用户对你的消息「xxx...」添加了表情 👎"）
- **Claude → 用户**：Claude 的回复始终关联当前 thread 中最近一条 bot 消息。通过 system prompt 约定，Claude 可输出 `[react:emoji]`（无需 messageId），Formatter 将其解析并对**当前回复消息**添加 reaction。如果 Claude 输出中不含该标记则不添加。为避免与代码内容冲突，仅在输出末尾独立行匹配该格式

### 流式响应

- 使用 `stream-json` 格式逐事件读取 Claude Code stdout
- 每 500ms 或遇到段落/代码块结束时，编辑已发送的消息追加内容
- 接近平台字符限制时，结束当前消息，发新消息继续（分片消息按发送顺序编号，如 `[1/3]`、`[2/3]`）
- 输出结束后做一次最终格式化编辑

## 消息模型

```typescript
interface IncomingMessage {
  platform: "lark" | "discord"
  channelId: string
  threadId: string | null
  userId: string
  userName: string
  content: string
  attachments: Attachment[]
  replyToMessageId?: string
}

interface Reaction {
  platform: "lark" | "discord"
  channelId: string
  threadId: string
  messageId: string
  emoji: string
  userId: string
}

interface OutgoingMessage {
  threadId: string
  content: string
  attachments: Attachment[]
  reactions: string[]
}
```

## Adapter 接口

```typescript
interface PlatformAdapter {
  setupProject(project: ProjectConfig): Promise<ChannelInfo>
  createThread(channelId: string, messageId: string): Promise<string>  // 返回threadId
  sendMessage(channelId: string, threadId: string, content: string): Promise<string>
  editMessage(channelId: string, messageId: string, content: string): Promise<void>
  uploadFile(channelId: string, threadId: string, filename: string, content: Buffer): Promise<void>
  addReaction(channelId: string, messageId: string, emoji: string): Promise<void>
  onMessage(handler: (msg: IncomingMessage) => void): void
  onReaction(handler: (reaction: Reaction) => void): void
}
```

## 输出格式化（分级）

| 条件 | 处理方式 |
|------|---------|
| ≤ 平台限制 | 智能格式化：保留 Markdown 代码块，精简工具日志，diff 高亮 |
| > 平台限制 | 摘要发到 thread + 完整输出作为 `.md` 附件，代码变更单独提取 `.diff` 附件 |

平台消息长度限制：Discord 2000 字符，Lark 30000 字符。Formatter 根据当前平台选择对应阈值。

## 配置管理

### 配置文件 (`config.yaml`)

平台凭证优先从环境变量读取（`LARK_APP_ID`、`LARK_APP_SECRET`、`DISCORD_TOKEN`），ConfigManager 在加载 YAML 后用 `process.env` 对应值覆盖。配置文件中可直接写值作为 fallback，但 `config.yaml` 应加入 `.gitignore` 以避免泄露。

```yaml
lark:
  appId: ""       # 或直接填值，env LARK_APP_ID 优先
  appSecret: ""   # env LARK_APP_SECRET 优先

discord:
  token: ""       # env DISCORD_TOKEN 优先

projects:
  - name: "cc2im"
    directory: "/home/hills/projects/cc2im"
    platforms:
      lark: true
      discord: true

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

### IM 管理命令

| 命令 | 说明 |
|------|------|
| `/im-add-project <name> <directory>` | 添加项目，交互式询问启用哪些平台 |
| `/im-remove-project <name>` | 移除项目，归档频道 |
| `/im-list-projects` | 列出所有项目及其平台状态 |
| `/im-reload-config` | 热加载配置文件 |

管理命令修改后同步写回 `config.yaml`。

管理命令仅在配置中指定的管理频道中生效（个人/小团队场景，频道本身可信，无需额外权限系统）。

## 存储（SQLite）

```sql
-- thread与session的映射
CREATE TABLE threads (
  thread_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (thread_id, platform)
);

-- 消息记录（用于reaction关联）
CREATE TABLE messages (
  message_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  content_summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, platform),
  FOREIGN KEY (thread_id, platform) REFERENCES threads(thread_id, platform)
);
```

## 项目目录结构

```
cc2im/
├── src/
│   ├── index.ts              # 入口，启动服务
│   ├── config.ts             # ConfigManager
│   ├── router.ts             # 消息路由
│   ├── session.ts            # SessionManager
│   ├── formatter.ts          # 输出格式化
│   ├── store.ts              # SQLite存储
│   ├── types.ts              # 共享类型定义
│   └── adapters/
│       ├── adapter.ts        # PlatformAdapter接口
│       ├── lark.ts           # Lark实现
│       └── discord.ts        # Discord实现
├── config.yaml
├── package.json
└── tsconfig.json
```
