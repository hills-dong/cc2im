# cc2im

连接 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 与即时通讯平台及 Web 界面的桥接服务，支持在 Discord、浏览器或桌面应用中直接与 Claude Code 进行 AI 辅助开发对话。

## 概述

cc2im 监听来自各平台的消息，将其转发到绑定特定项目目录的 Claude Code 会话，并实时流式返回响应。每个对话线程对应一个持久化的 Claude Code 会话，跨消息保持完整上下文。

**支持平台：** Discord、Web UI、桌面应用（Tauri）

## 核心功能

- **基于线程的会话** — 每个对话线程维护独立的持久化 Claude Code 会话
- **实时流式响应** — Claude 思考或执行工具时每隔数秒更新进度
- **多项目路由** — 将频道/会话映射到指定的本地项目目录
- **项目级模型配置** — 为每个项目配置不同的 Claude 模型（haiku / sonnet / opus）
- **文件支持** — 可向 Claude 发送图片和文件；长响应自动上传为附件
- **会话恢复** — 重启后自动恢复进行中的会话
- **Token 用量统计** — 按会话、项目、模型追踪输入/输出/缓存 Token，支持每日明细
- **Web UI** — 基于浏览器的聊天界面，包含配置管理、引导向导和统计面板
- **桌面应用** — 基于 Tauri 的原生应用，支持 macOS、Linux 和 Windows，带系统托盘
- **服务管理** — 内置 CLI 支持 systemd（Linux）和 launchd（macOS）服务安装

## 架构

Monorepo 结构，包含以下包：

| 包 | 说明 |
|---|---|
| `@cc2im/core` | 平台适配器、会话管理、配置、数据库（SQLite）、路由、格式化 |
| `cc2im`（CLI） | 命令行界面与服务管理 |
| `@cc2im/server` | HTTP API + WebSocket 服务器，为 Web UI 提供后端 |
| `@cc2im/ui` | Svelte 5 + Vite Web 前端（聊天、配置、统计、引导向导） |
| `@cc2im/desktop` | Tauri 2 桌面应用，带系统托盘 |

## 安装

**前置条件：** Node.js 18+，已安装并认证 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

```bash
git clone https://github.com/hills-dong/cc2im.git
cd cc2im
npm install
npm run build
cd packages/cli && npm link   # 全局注册 cc2im 命令
```

## 配置

创建 `~/.config/cc2im/config.yaml`：

```yaml
discord:
  token: ""          # Discord 机器人令牌（或设置 DISCORD_TOKEN 环境变量）

lark:
  appId: ""          # 飞书应用 ID（或设置 LARK_APP_ID 环境变量）
  appSecret: ""      # 飞书应用密钥（或设置 LARK_APP_SECRET 环境变量）

projects:
  - name: my-project
    directory: /path/to/project
    model: sonnet    # 可选：haiku | sonnet | opus（覆盖默认模型）
    platforms:
      discord: true

claude:
  command: claude
  defaultArgs:
    - --print
    - --output-format
    - stream-json
    - --verbose
    - --dangerously-skip-permissions
    - --model
    - sonnet
  bufferInterval: 500   # 流式缓冲刷新间隔（毫秒）
  timeout: 300000       # 会话超时（毫秒，默认 5 分钟）

formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 5
```

**环境变量覆盖：**

| 变量 | 说明 |
|---|---|
| `CC2IM_CONFIG` | 配置文件路径 |
| `CC2IM_DB` | SQLite 数据库路径 |
| `DISCORD_TOKEN` | Discord 机器人令牌 |
| `LARK_APP_ID` | 飞书应用 ID |
| `LARK_APP_SECRET` | 飞书应用密钥 |

## 使用方法

### 直接运行

```bash
cc2im run
# 或
npm start
```

### Web UI 模式

```bash
cc2im web                          # 默认：http://127.0.0.1:3000
cc2im web --port 8080              # 自定义端口
cc2im web --bind 0.0.0.0           # 绑定所有网络接口
```

Web UI 提供：
- **聊天** — 通过 WebSocket 与 Claude Code 实时对话
- **配置** — 在浏览器中查看和编辑配置
- **统计** — Token 用量统计，支持按项目和模型分类
- **引导向导** — 首次使用的配置引导

### 桌面应用

桌面应用将 Web UI 封装在原生 Tauri 窗口中，支持系统托盘。

```bash
cd packages/desktop
npm run build:desktop
```

构建产物支持 macOS（.dmg、.app）、Linux（.deb、.rpm、.AppImage）和 Windows（.exe、.msi）。

### 安装为系统服务

```bash
# 安装并启动
cc2im install --config ~/.config/cc2im/config.yaml

# 服务管理
cc2im start
cc2im stop
cc2im restart
cc2im status
cc2im logs

# 卸载
cc2im uninstall
```

服务文件位置：
- **Linux：** `~/.config/systemd/user/cc2im.service`
- **macOS：** `~/Library/LaunchAgents/com.cc2im.plist`

### 聊天内管理命令（Discord）

在任意已配置的频道中发送：

| 命令 | 说明 |
|---|---|
| `/im-list-projects` | 列出已配置的项目 |
| `/im-add-project <名称> <目录>` | 添加项目 |
| `/im-remove-project <名称>` | 移除项目 |
| `/im-reload-config` | 重新加载配置文件 |
| `/im-done` | 标记线程为已完成 |
| `/im-reopen` | 重新打开已完成的线程 |

Discord 斜杠命令会自动注册。

## 开发

```bash
npm run dev    # 热重载运行 CLI（tsx watch）
npm test       # 运行所有包的单元测试（vitest）

# E2E 测试（server + UI）
cd packages/server
npx playwright test
```

## 许可证

MIT
