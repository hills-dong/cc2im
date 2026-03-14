# cc2im 桌面/Web 客户端设计文档

**日期:** 2026-03-14
**状态:** 已批准

## 1. 概述

将 cc2im 从纯 CLI/服务端项目扩展为支持桌面客户端和 Web 端的完整应用。桌面端提供系统托盘 + GUI 界面，Web 端支持部署在 NAS 等服务器上通过浏览器访问。两者共享同一套 UI，同时保留现有 CLI 安装方式和 Discord/Lark IM 桥接功能。

### 1.1 目标用户

非技术用户/团队成员 — 需要开箱即用，安装包包含依赖，引导式配置。

### 1.2 核心功能

- **聊天界面**: 侧边栏切换项目和会话，流式输出，图片上传
- **配置管理**: 全部配置项可视化编辑
- **Token 统计**: 会话级 + 项目级的当前和累计用量
- **系统托盘**: 状态图标、启停控制、最小化到托盘（Desktop）
- **首次引导**: 向导式配置流程
- **三平台打包**: macOS / Windows / Linux + Web 部署

## 2. 技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| 桌面框架 | Tauri (Rust) | Tauri 壳本身~10MB，加上内嵌 Node.js + native 模块总计约 60-80MB |
| 前端框架 | Svelte | 极轻量，编译时框架，与 Tauri 理念匹配 |
| 后端 | Node.js（复用现有 TypeScript 代码） | 最大化代码复用，降低风险 |
| 数据库 | SQLite（better-sqlite3） | 沿用现有方案 |
| 包管理 | npm workspaces (monorepo) | 项目已用 npm |

### 2.1 架构方案: Tauri + 内嵌 Node 服务

Tauri 作为 GUI 壳，启动时同时启动 Node.js 后端作为子进程，通过 HTTP/WebSocket 通信。现有 TypeScript 核心代码最大程度复用。

```
┌─ Desktop 模式 ────────────────────┐     ┌─ Web 模式 ──────────────┐
│  Tauri 壳                          │     │  浏览器                  │
│  ┌───────────┐    ┌─────────────┐ │     │  ┌───────────┐          │
│  │ Svelte UI │    │ Node.js     │ │     │  │ Svelte UI │          │
│  │ (WebView) │←ws→│ core API    │ │     │  │           │←ws→ NAS  │
│  └───────────┘    │ + 静态文件   │ │     │  └───────────┘   服务器  │
│  [系统托盘]        └─────────────┘ │     └──────────────────────────┘
└────────────────────────────────────┘
```

### 2.2 包体大小说明

Tauri 壳本身很小（~10MB），但本项目需要内嵌 Node.js 运行时（~40MB）和 `better-sqlite3` 等含 C++ 绑定的 native 模块。预计各平台安装包大小:

| 平台 | 预估大小 | 说明 |
|------|----------|------|
| macOS (.dmg) | ~70-80MB | Universal binary (x64 + arm64) |
| Windows (.msi) | ~60-70MB | x64 |
| Linux (.AppImage) | ~60-70MB | x64 |

CI 构建时需为各目标平台预编译 `better-sqlite3` 的 native 模块（使用 `prebuild` 或 `node-gyp`）。

## 3. 项目结构

```
cc2im/
├── packages/
│   ├── core/                  # 共享核心库（纯业务逻辑，无 HTTP 层）
│   │   ├── src/
│   │   │   ├── session.ts        SessionManager（调用 Claude Code CLI）
│   │   │   ├── store.ts          SQLite 存储（线程、消息、token 统计）
│   │   │   ├── config.ts         配置加载/保存
│   │   │   ├── router.ts         消息路由
│   │   │   ├── formatter.ts      输出格式化
│   │   │   ├── adapters/         IM 适配器（Discord、Lark）
│   │   │   └── types.ts          共享类型
│   │   └── package.json
│   │
│   ├── server/                # HTTP/WS API 服务层
│   │   ├── src/
│   │   │   ├── server.ts         HTTP 服务器（API + 静态文件托管）
│   │   │   ├── api.ts            REST 路由
│   │   │   ├── ws.ts             WebSocket 事件处理
│   │   │   ├── auth.ts           Web 模式认证
│   │   │   └── contracts/        API JSON Schema 契约定义
│   │   └── package.json          依赖 @cc2im/core
│   │
│   ├── ui/                    # Svelte 前端（Desktop/Web 共享）
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── Chat.svelte      聊天界面
│   │   │   │   ├── Config.svelte    配置管理
│   │   │   │   ├── Stats.svelte     Token 统计
│   │   │   │   └── Sidebar.svelte   侧边栏
│   │   │   ├── stores/           Svelte stores（WS 连接状态）
│   │   │   └── App.svelte
│   │   └── package.json
│   │
│   ├── cli/                   # CLI 入口（保持现有行为 + 新增 web 命令）
│   │   ├── src/
│   │   │   ├── cli.ts            命令解析（install/start/run/web...）
│   │   │   ├── service.ts        系统服务管理
│   │   │   └── index.ts          前台运行入口
│   │   └── package.json          依赖 @cc2im/core, @cc2im/server
│   │
│   └── desktop/               # Tauri 桌面应用
│       ├── src-tauri/            Rust 壳
│       │   ├── src/main.rs       窗口管理、系统托盘、启动 Node 子进程
│       │   └── tauri.conf.json
│       └── package.json
│
├── package.json               # monorepo 根（workspace）
└── .github/workflows/
    └── release.yml            # 三平台 CI 构建
```

## 4. Monorepo 迁移计划

从当前单包结构迁移到 monorepo，分步执行:

### 4.1 迁移步骤

```
Step 1: 初始化 monorepo 结构
  - 根 package.json 添加 workspaces: ["packages/*"]
  - 创建 packages/core/, packages/server/, packages/ui/, packages/cli/, packages/desktop/ 目录
  - 各子包初始化 package.json

Step 2: 提取 core 包
  - 移动: session.ts, store.ts, config.ts, router.ts, formatter.ts, adapters/, types.ts → packages/core/src/
  - 更新内部 import 路径
  - 验证: core 包独立编译通过

Step 3: 提取 cli 包
  - 移动: cli.ts, service.ts, index.ts → packages/cli/src/
  - 添加依赖: @cc2im/core
  - 保持 bin 字段: "cc2im": "dist/cli.js"
  - 验证: cc2im run / cc2im install 行为不变

Step 4: 新建 server 包
  - 新增: server.ts, api.ts, ws.ts, auth.ts → packages/server/src/
  - 添加依赖: @cc2im/core
  - cli 包的 "cc2im web" 命令调用 server 包

Step 5: 新建 ui 包
  - 初始化 Svelte 项目 → packages/ui/
  - 构建输出为静态文件，被 server 包托管

Step 6: 新建 desktop 包
  - 初始化 Tauri 项目 → packages/desktop/
  - 依赖 server 包（内嵌 Node 子进程）

Step 7: 清理根目录
  - 删除根 src/, dist/
  - 根 package.json 仅保留 workspaces 配置和 dev scripts
```

### 4.2 向后兼容

- `npm install -g cc2im` 继续工作: cli 包的 package.json 保持 `name: "cc2im"` 和 `bin` 字段
- 现有 config.yaml 格式不变
- 现有 SQLite 数据库兼容（新增 `token_usage` 表，见 6.1 节）

### 4.3 Platform 类型演进

现有 `Platform = "lark" | "discord"`。GUI 客户端**不作为新的 Platform 变体**，而是通过独立的 HTTP/WS API 层通信。原因:
- IM 适配器实现 `PlatformAdapter` 接口（createThread, sendMessage 等），GUI 不需要这些
- GUI 通过 WS 直接与 SessionManager 交互，绕过 Router/Adapter 层
- Store 中 GUI 会话使用 `platform = "web"` 标记，但不注册为 `PlatformAdapter`

```typescript
// types.ts 更新
export type Platform = "lark" | "discord" | "web";
// "web" 仅用于 Store 中标记 GUI 来源的会话，不实现 PlatformAdapter
```

## 5. 运行模式

| 模式 | 启动方式 | UI 访问 | 绑定地址 |
|------|----------|---------|----------|
| CLI（无 GUI） | `cc2im run` | 无 UI，仅 IM 桥接 | N/A |
| Web | `cc2im web` | 浏览器访问 `http://host:port` | `0.0.0.0`（可配置） |
| Desktop | 双击应用 | Tauri WebView | `127.0.0.1` |

Desktop 模式下，Tauri Rust 壳启动 Node 子进程运行 core 的 HTTP/WS 服务，WebView 连接 `127.0.0.1:{port}`。Web 模式下需要基础密码认证（NAS 暴露到局域网）。

## 6. HTTP/WS API

API 服务端口随机分配（Desktop）或可配置（Web），通过 stdout 通知 Tauri 壳实际端口号。仅使用 Node 内置 `http` 模块 + `ws` 库，不引入重框架。

### 6.1 HTTP REST 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/auth/login` | Web 模式登录（见 6.4 认证设计） |
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 添加项目 |
| PUT | `/api/projects/:name` | 编辑项目 |
| DELETE | `/api/projects/:name` | 删除项目 |
| GET | `/api/config` | 获取全部配置 |
| PUT | `/api/config` | 更新配置 |
| GET | `/api/sessions?project=xxx` | 某项目的会话列表 |
| POST | `/api/sessions` | 创建新会话（返回 sessionId） |
| GET | `/api/stats/tokens?project=xxx` | Token 统计（项目级） |
| GET | `/api/stats/tokens?session=xxx` | Token 统计（会话级） |

### 6.2 WebSocket 事件 (`/ws`)

**客户端 → 服务端:**

| 事件 | 数据 | 用途 |
|------|------|------|
| `chat.send` | `{ project, sessionId?, message, images? }` | 发送消息（sessionId 省略则创建新会话） |
| `chat.abort` | `{ project, sessionId }` | 中断当前会话 |

**服务端 → 客户端:**

| 事件 | 数据 | 用途 |
|------|------|------|
| `chat.stream` | `{ sessionId, type, content }` | 实时流式输出（文字、工具调用活动） |
| `chat.done` | `{ sessionId, result, tokens }` | 会话完成 + token 用量 |
| `chat.error` | `{ sessionId, error }` | 错误 |
| `status.update` | `{ activeCount, queued }` | 全局状态变更（托盘图标用） |

### 6.3 错误响应格式

所有 API 错误统一格式:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Project name is required"
  }
}
```

HTTP 状态码:
| 状态码 | 含义 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未认证（Web 模式） |
| 404 | 资源不存在 |
| 409 | 冲突（如项目名重复） |
| 500 | 服务器内部错误 |

WS 错误通过 `chat.error` 事件推送，包含 `code` 和 `message` 字段。

### 6.4 Web 模式认证设计

**密码存储:** 配置文件中存储 bcrypt hash，不存储明文:

```yaml
web:
  port: 8080
  bind: "0.0.0.0"
  passwordHash: "$2b$10$..."  # bcrypt hash, 通过引导向导或 cc2im set-password 设置
```

**认证流程:**

```
1. POST /api/auth/login { password: "xxx" }
2. 服务端 bcrypt.compare(password, storedHash)
3. 成功 → 返回 JWT token (HS256, secret 首次启动 web 模式时随机生成并写入配置文件，丢失后所有已签发 token 失效，用户需重新登录)
   { token: "eyJ...", expiresIn: 86400 }
4. 后续请求携带 Authorization: Bearer <token>
5. WS 连接通过 URL 参数传递 token: ws://host:port/ws?token=<token>
```

**Desktop 模式跳过认证:** 检测到绑定 `127.0.0.1` 时不要求 token。

**密码管理:** 通过 GUI 配置页或 CLI 命令 `cc2im set-password` 设置/修改密码。

### 6.5 WebSocket 重连策略

客户端（Svelte UI）实现自动重连:

```
断开连接
  → 立即重连（第 1 次）
  → 1s 后重连（第 2 次）
  → 2s 后重连（第 3 次）
  → 4s 后重连（第 4 次）
  → 最大间隔 30s，持续重试
```

**重连后状态恢复:**
- 客户端在连接建立后发送 `sync.state` 请求
- 服务端返回当前活跃会话状态（正在运行的会话 ID + 已缓存的流式输出）
- 若断开期间有会话完成，客户端通过 `GET /api/sessions` 获取最终结果

**心跳机制:** 服务端每 30s 发送 WS ping frame。服务端若 10s 未收到 pong 则视为客户端断开并清理连接；客户端若 40s 未收到任何消息（包括 ping）则视为服务端断开并触发重连。

## 7. Token 统计

### 7.1 数据采集

从 Claude Code `stream-json` 的 `result` 事件中提取 token 用量，每次调用完成后写入 SQLite:

```sql
CREATE TABLE token_usage (
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

### 7.2 数据库迁移

现有 Store 类在初始化时通过 `CREATE TABLE IF NOT EXISTS` 建表。新增 `token_usage` 表采用同样方式:
- Store 初始化时检测 `token_usage` 表是否存在，不存在则创建
- 现有数据库（CLI 老用户升级）不受影响，仅新增表，不修改已有表
- Token 数据从升级时刻开始记录，不做历史回填

### 7.3 统计维度

| 维度 | 展示内容 |
|------|----------|
| 当前会话 | 本次会话累计 input/output/cache tokens |
| 项目级 | 某项目的总用量，按日汇总 |
| 全局 | 所有项目总用量，按日/按模型汇总 |

### 7.4 UI 展示

- 聊天页底部显示当前会话 token 用量（实时更新）
- 统计页: 项目筛选 + 日期范围选择 + 简单柱状图

## 8. UI 设计

### 8.1 整体布局

```
┌──────────────────────────────────────────────┐
│  标题栏（Tauri 拖拽区 / Web 下隐藏）          │
├────────────┬─────────────────────────────────┤
│  侧边栏     │  主内容区                        │
│            │                                 │
│  [项目 A]  │  ┌─────────────────────────────┐ │
│    会话1   │  │ 聊天消息流                    │ │
│    会话2   │  │ - 用户消息                    │ │
│  [项目 B]  │  │ - Claude 回复（流式）         │ │
│    会话3   │  │ - 工具调用活动指示器           │ │
│            │  │                              │ │
│            │  ├─────────────────────────────┤ │
│  ──────── │  │ 输入框 + 图片拖拽上传         │ │
│  配置      │  └─────────────────────────────┘ │
│  统计      │                                 │
│            │  Token: 本次 1.2k / 累计 45k    │
└────────────┴─────────────────────────────────┘
```

### 8.2 页面

| 页面 | 内容 |
|------|------|
| **聊天** | 消息列表（Markdown 渲染 + 代码高亮）、流式输出、工具调用活动展示、图片拖拽上传、中断按钮 |
| **配置** | Claude 设置（CLI 路径、默认参数）、Discord/Lark 凭据、项目管理（增删改）、Web 认证密码、格式化选项 |
| **统计** | 按项目/会话筛选的 token 用量表格 + 简单柱状图（按日汇总） |

### 8.3 交互

- **流式输出**: WS `chat.stream` 事件实时追加文本，工具调用显示为折叠的活动指示器
- **会话管理**: 侧边栏每个项目下展示会话列表，点击切换，右键可删除
- **新建会话**: 点击项目名旁的 `+` 按钮
- **首次引导**: 检测到未配置时弹出引导流程

### 8.4 Desktop vs Web 差异

通过运行时检测区分: `const isDesktop = '__TAURI__' in window;`

| 功能 | Desktop | Web |
|------|---------|-----|
| 系统托盘 | 有（Tauri 原生） | 无 |
| 窗口拖拽/最小化 | 有 | 无 |
| 标题栏 | 自定义（Tauri 拖拽区） | 隐藏 |
| 登录认证 | 跳过（本地访问） | 需要密码 |
| 关闭行为 | 最小化到托盘 | 无 |

## 9. 系统托盘（Desktop 模式）

| 功能 | 说明 |
|------|------|
| 状态图标 | 空闲（绿）/ 运行中（橙）/ 错误（红），通过 WS `status.update` 事件驱动 |
| 右键菜单 | 打开窗口 / 启停服务 / 退出 |
| 关闭行为 | 点击关闭按钮 → 最小化到托盘，不退出 |
| 开机自启 | 可选，配置页中开关控制 |

## 10. 首次引导流程

启动时检测是否已配置，未配置则显示引导向导:

```
Step 1: 检测 Claude Code CLI
  → 自动搜索 PATH 中的 claude 命令
  → 未找到则提示安装链接

Step 2: 验证 Claude Code 可用性
  → 运行 claude --print "test" --max-turns 1 验证 CLI 可用且已登录
  → 失败则提示运行 claude login

Step 3: 添加第一个项目
  → 选择本地目录（Tauri 原生文件对话框 / Web 手动输入路径）

Step 4: 可选 — 配置 Discord/Lark 桥接

Step 5: 完成 → 进入聊天界面
```

## 11. 打包与分发

### 11.1 CI 构建 (GitHub Actions)

```
触发: push tag v*

jobs:
  build-ui       → 构建 Svelte 静态文件
  build-cli      → npm pack @cc2im/cli
  build-desktop  → 三平台 Tauri 构建
    - macos-latest    → .dmg (universal binary)
    - windows-latest  → .msi + .exe
    - ubuntu-latest   → .AppImage + .deb
```

### 11.2 分发方式

| 平台 | 格式 | 安装方式 |
|------|------|----------|
| macOS | `.dmg` | 拖到 Applications |
| Windows | `.msi` | 双击安装 |
| Linux | `.AppImage` + `.deb` | 双击或 `dpkg -i` |
| CLI | npm 包 | `npm install -g cc2im` |
| Web/NAS | Docker 或 npm | `cc2im web` |

### 11.3 Desktop 内嵌 Node.js

打包时将 Node.js 运行时 + core 代码作为 Tauri sidecar 一起分发:

```
app.dmg/
└── cc2im.app/
    └── Contents/
        └── Resources/
            ├── node (Node.js binary)
            ├── core/ (core + ui 静态文件)
            └── ... (Tauri 主程序)
```

## 12. 测试策略

### 12.1 各包测试方案

**core（共享核心）:**

| 层 | 工具 | 覆盖内容 |
|---|------|---------|
| 单元测试 | Vitest | SessionManager、Store、Router、Formatter 纯逻辑 |

Claude Code CLI 调用通过 mock 子进程替代，不依赖真实 CLI。

**server（API 服务层）:**

| 层 | 工具 | 覆盖内容 |
|---|------|---------|
| API 测试 | Vitest + supertest | HTTP REST 端点、WS 事件收发 |
| 契约测试 | Vitest + JSON Schema | 请求/响应是否符合 contracts/ 中的 Schema 定义 |
| 集成测试 | Vitest | API → core SessionManager → mock Claude CLI 全链路 |
| 认证测试 | Vitest | JWT 签发/验证、密码校验、Desktop 跳过认证 |

**ui（Svelte 前端）:**

| 层 | 工具 | 覆盖内容 |
|---|------|---------|
| 组件测试 | Vitest + @testing-library/svelte | 聊天消息渲染、配置表单、统计图表 |
| WS 交互测试 | Vitest + mock WS | 流式消息追加、连接断开重连 |
| E2E 测试 | Playwright | 完整用户流程 |

**cli:**

| 层 | 工具 | 覆盖内容 |
|---|------|---------|
| 单元测试 | Vitest | 命令解析、service 管理逻辑 |

**desktop（Tauri 壳）:**

| 层 | 工具 | 覆盖内容 |
|---|------|---------|
| E2E | Playwright + Tauri driver | 窗口启动、托盘交互、Node 子进程生命周期 |

### 12.2 覆盖率目标

| 包 | 目标覆盖率 |
|---|-----------|
| core | >= 85% |
| server | >= 85% |
| ui | >= 70% |
| cli | >= 70% |
| desktop | E2E 覆盖关键流程 |

### 12.3 CI 门禁

| 检查 | 标准 | 不达标则阻断 |
|------|------|-------------|
| core 覆盖率 | >= 85% | CI 失败 |
| server 覆盖率 | >= 85% | CI 失败 |
| ui 覆盖率 | >= 70% | CI 失败 |
| Mutation score (Stryker) | >= 70% | CI 失败 |
| 构建 | 零错误 | CI 失败 |
| Lint | 零警告 | CI 失败 |
| Smoke test | 服务可启动、API 可达 | CI 失败 |
| 构建产物 | 三平台产物存在 | CI 失败 |

### 12.4 CI 流水线

```
push/PR → lint → core 单元+API 测试 → ui 组件测试 → E2E 测试
tag v*  → 上述全部 → 三平台 Tauri 构建 → GitHub Release
```

## 13. 质量保障: 红线原则与自动化防御

### 13.1 红线原则: 禁止说谎

**永远不要说谎。遇到问题可以报告，但不要改变策略；项目太大可以拆分，但不要偷懒；未完成可以再做，但不要伪装。说谎的后果非常严重。**

### 13.2 自动化防御措施

| 说谎行为 | 自动化防御 |
|----------|-----------|
| 伪装测试通过 | CI 独立运行，不信任本地输出 |
| 修改测试使其虚假通过 | 契约文件（JSON Schema）锁定，变更需单独 PR |
| 声称功能完成但未实现 | Smoke test 验证真实行为 |
| 跳过步骤偷懒 | TDD 强制: 测试先提交，无测试则构建失败 |
| 覆盖率注水 | Mutation testing 检测无效测试 |
| 遇到问题绕过不报告 | CI 日志完整保留，失败即阻断 |

### 13.3 验收清单驱动开发

每个功能点关联一个自动化验收测试。功能"完成"的定义 = 对应测试在 CI 中通过:

| 功能点 | 自动化验收 |
|--------|-----------|
| 聊天发送 → 流式输出 → 完成 | E2E Playwright 测试 |
| 图片上传 | E2E 测试 |
| 全部配置项可编辑并持久化 | API 集成测试 |
| Token 统计准确 | 单元测试 + 集成测试 |
| 系统托盘状态切换 | Tauri E2E 测试 |
| 首次引导向导 | E2E 测试 |
| Web 浏览器可访问 | Smoke test |
| 三平台构建 | CI 构建产物存在性检查 |

### 13.4 Contract Testing

用 JSON Schema 定义 HTTP/WS API 的请求和响应格式。契约文件独立于实现，测试自动校验实际输出是否符合契约。

### 13.5 Smoke Test

CI 最终门禁，直接启动真实服务验证:

```bash
node packages/cli/dist/cli.js web --port 0 &
PORT=$(wait_for_port)

# HTTP API 验证
curl -f http://127.0.0.1:$PORT/api/projects
curl -f http://127.0.0.1:$PORT/api/config

# WS 连通性验证
echo '{"type":"chat.send","project":"test","message":"hi"}' | \
  websocat ws://127.0.0.1:$PORT/ws --one-message

# 静态文件托管验证
curl -f http://127.0.0.1:$PORT/ | grep -q "<html"

kill %1
```

### 13.6 TDD 实施顺序

每个功能按此顺序:

```
Phase 1: 写契约 + 测试（此时测试全部 FAIL）
Phase 2: 写实现（测试逐步 PASS）
Phase 3: Smoke test + mutation test
```

CI 中检测: 如果新增了实现文件但没有对应测试文件，构建失败。

### 13.7 信任链（全自动化）

```
设计文档（验收清单）
  → 契约定义（JSON Schema，锁定）
    → 测试先行（TDD，测试先提交）
      → AI 写实现
        → CI 门禁（覆盖率 + mutation + lint + build）
          → Smoke test（真实服务验证）
            → 构建产物检查
```

每一层都有独立的验证，AI 的输出永远不是最终判断。未完成的功能标记为 `TODO` 并在验收清单中保持 unchecked。遇到无法解决的问题，必须创建 issue 记录，不得跳过。
