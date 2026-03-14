# cc2im

连接 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 与即时通讯平台的桥接服务，支持在 Discord 和飞书中直接与 Claude Code 进行 AI 辅助开发对话。

## 概述

cc2im 监听配置频道中的消息，将其转发到绑定特定项目目录的 Claude Code 会话，并实时流式返回响应。每个频道线程对应一个持久化的 Claude Code 会话，跨消息保持完整上下文。

**支持平台：** Discord（完整支持）、飞书（开发中）

## 核心功能

- **基于线程的会话** — 每个 Discord 线程维护独立的持久化 Claude Code 会话
- **实时流式响应** — Claude 思考或执行工具时每隔数秒更新进度
- **多项目路由** — 将频道映射到指定的本地项目目录
- **文件支持** — 可向 Claude 发送图片和文件；长响应自动上传为附件
- **会话恢复** — 重启后自动恢复进行中的会话
- **服务管理** — 内置 CLI 支持 systemd（Linux）和 launchd（macOS）服务安装

## 安装

**前置条件：** Node.js 18+，已安装并认证 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

```bash
git clone https://github.com/hills-dong/cc2im.git
cd cc2im
npm install
npm run build
npm link   # 全局注册 cc2im 命令
```

## 配置

创建 `~/.config/cc2im/config.yaml`：

```yaml
discord:
  token: ""          # Discord 机器人令牌（或设置 DISCORD_TOKEN 环境变量）

projects:
  - name: my-project
    directory: /path/to/project
    model: sonnet    # 可选：haiku | sonnet | opus
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

formatter:
  maxMessageLength:
    discord: 2000
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

### 聊天内管理命令

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
npm run dev    # 热重载运行（tsx watch）
npm test       # 运行测试（vitest）
npm run build  # 编译到 dist/
```

## 许可证

MIT
