# cc2im

A bridge that connects [Claude Code](https://docs.anthropic.com/en/docs/claude-code) to instant messaging platforms, enabling AI-assisted development conversations directly in Discord and Lark.

## Overview

cc2im listens for messages in configured channels, forwards them to a Claude Code session scoped to a specific project directory, and streams the response back in real-time. Each channel thread maps to a persistent Claude Code session, maintaining full context across messages.

**Supported platforms:** Discord (full), Lark (in progress)

## Features

- **Thread-based sessions** — each Discord thread maintains its own persistent Claude Code session
- **Real-time streaming** — progress updates every few seconds while Claude is thinking or executing tools
- **Per-project routing** — map channels to specific local project directories
- **File support** — send images and files to Claude; large responses are uploaded as attachments
- **Session recovery** — in-flight sessions are restored on restart
- **Service management** — built-in CLI for systemd (Linux) and launchd (macOS) service installation

## Installation

**Prerequisites:** Node.js 18+, [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated

```bash
git clone https://github.com/hills-dong/cc2im.git
cd cc2im
npm install
npm run build
npm link   # makes `cc2im` available globally
```

## Configuration

Create `~/.config/cc2im/config.yaml`:

```yaml
discord:
  token: ""          # Discord bot token (or set DISCORD_TOKEN env var)

projects:
  - name: my-project
    directory: /path/to/project
    model: sonnet    # optional: haiku | sonnet | opus
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

### In-chat commands

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
npm run dev    # run with hot reload (tsx watch)
npm test       # run tests (vitest)
npm run build  # compile to dist/
```

## License

MIT
