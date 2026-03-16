# cc2im

A bridge that connects [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to instant messaging platforms and a web interface, enabling AI-assisted development conversations directly in Discord, on the web, or via a native desktop app.

## Overview

cc2im listens for messages from configured platforms, forwards them to a Claude Code session scoped to a specific project directory, and streams the response back in real-time. Each conversation thread maps to a persistent Claude Code session, maintaining full context across messages.

**Supported platforms:** Discord, Web UI, Desktop App (Tauri)

## Features

- **Thread-based sessions** — each conversation thread maintains its own persistent Claude Code session
- **Real-time streaming** — progress updates every few seconds while Claude is thinking or executing tools
- **Per-project routing** — map channels/sessions to specific local project directories
- **Per-project model override** — configure different Claude models (haiku / sonnet / opus) per project
- **File support** — send images and files to Claude; large responses are uploaded as attachments
- **Session recovery** — in-flight sessions are restored on restart
- **Token usage statistics** — track input/output/cache tokens per session, project, and model with daily breakdowns
- **Web UI** — browser-based chat interface with configuration management, onboarding wizard, and stats dashboard
- **Desktop app** — native Tauri application for macOS, Linux, and Windows with system tray integration
- **Service management** — built-in CLI for systemd (Linux) and launchd (macOS) service installation

## Architecture

Monorepo with the following packages:

| Package | Description |
|---|---|
| `@cc2im/core` | Platform adapters, session management, config, database (SQLite), routing, formatting |
| `cc2im` (CLI) | Command-line interface and service management |
| `@cc2im/server` | HTTP API + WebSocket server for the web UI |
| `@cc2im/ui` | Svelte 5 + Vite web frontend (chat, config, stats, onboarding) |
| `@cc2im/desktop` | Tauri 2 desktop application with system tray |

## Installation

**Prerequisites:** Node.js 18+, [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

```bash
git clone https://github.com/hills-dong/cc2im.git
cd cc2im
npm install
npm run build
cd packages/cli && npm link   # makes `cc2im` available globally
```

## Configuration

Create `~/.config/cc2im/config.yaml`:

```yaml
discord:
  token: ""          # Discord bot token (or set DISCORD_TOKEN env var)

lark:
  appId: ""          # Lark app ID (or set LARK_APP_ID env var)
  appSecret: ""      # Lark app secret (or set LARK_APP_SECRET env var)

projects:
  - name: my-project
    directory: /path/to/project
    model: sonnet    # optional: haiku | sonnet | opus (overrides default)
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
  bufferInterval: 500   # ms between stream buffer flushes
  timeout: 300000       # session timeout in ms (default: 5 min)

formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 5
```

**Environment variable overrides:**

| Variable | Description |
|---|---|
| `CC2IM_CONFIG` | Path to config file |
| `CC2IM_DB` | Path to SQLite database |
| `DISCORD_TOKEN` | Discord bot token |
| `LARK_APP_ID` | Lark app ID |
| `LARK_APP_SECRET` | Lark app secret |

## Usage

### Run directly

```bash
cc2im run
# or
npm start
```

### Web UI mode

```bash
cc2im web                          # default: http://127.0.0.1:3000
cc2im web --port 8080              # custom port
cc2im web --bind 0.0.0.0           # bind to all interfaces
```

The web UI provides:
- **Chat** — real-time conversation with Claude Code via WebSocket
- **Config** — view and edit configuration from the browser
- **Stats** — token usage statistics with per-project and per-model breakdowns
- **Onboarding** — guided setup wizard for first-time configuration

### Desktop app

The desktop application wraps the web UI in a native Tauri window with system tray support.

```bash
cd packages/desktop
npm run build:desktop
```

Build artifacts are produced for macOS (.dmg, .app), Linux (.deb, .rpm, .AppImage), and Windows (.exe, .msi).

### Install as a system service

```bash
# Install and start
cc2im install --config ~/.config/cc2im/config.yaml

# Service management
cc2im start
cc2im stop
cc2im restart
cc2im status
cc2im logs

# Uninstall
cc2im uninstall
```

Service files are created at:
- **Linux:** `~/.config/systemd/user/cc2im.service`
- **macOS:** `~/Library/LaunchAgents/com.cc2im.plist`

### In-chat commands (Discord)

Send these in any configured channel:

| Command | Description |
|---|---|
| `/im-list-projects` | List configured projects |
| `/im-add-project <name> <dir>` | Add a project |
| `/im-remove-project <name>` | Remove a project |
| `/im-reload-config` | Reload config from disk |
| `/im-done` | Mark thread as complete |
| `/im-reopen` | Reopen a completed thread |

Discord slash command equivalents are also registered automatically.

## Development

```bash
npm run dev    # run CLI with hot reload (tsx watch)
npm test       # run unit tests across all packages (vitest)

# E2E tests (server + UI)
cd packages/server
npx playwright test
```

## License

MIT
