# CLI Service Management Design

## Summary

Add a CLI entry point (`cc2im` binary) with subcommands for service lifecycle management. Supports Linux (systemd user service) and macOS (launchd user agent). Zero new dependencies.

## CLI Interface

```
cc2im install    # Generate service file + enable + start
cc2im uninstall  # Stop + disable + remove service file
cc2im start      # Start service
cc2im stop       # Stop service
cc2im restart    # Restart service
cc2im status     # Show service status
cc2im logs       # Tail service logs
cc2im run        # Run in foreground (dev mode)
cc2im (no args)  # Same as cc2im run
```

## Architecture

### New Files

- `src/cli.ts` — CLI entry point, parses `process.argv[2]` and dispatches to service module or `main()`
- `src/service.ts` — Platform-abstracted service management (generate, install, uninstall, start, stop, restart, status, logs)

### Modified Files

- `src/index.ts` — Export `main()` so cli.ts can import it for `run` subcommand
- `package.json` — Add `"bin": { "cc2im": "dist/cli.js" }`

### Platform Detection

`process.platform === "darwin"` → launchd, otherwise → systemd.

### Service File Generation

At `install` time, auto-detect and bake in:
- `process.execPath` → node binary path
- `require.resolve("cc2im")` or `__dirname` → cc2im dist path
- Config path: `--config <path>` flag, or CWD's `config.yaml`, or `~/.config/cc2im/config.yaml`

#### Linux (systemd user service)

Path: `~/.config/systemd/user/cc2im.service`

```ini
[Unit]
Description=cc2im - Claude Code to IM bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=<project-dir>
ExecStart=<node-path> <cc2im-dist/index.js>
Environment=CC2IM_CONFIG=<config-path>
Restart=always
RestartSec=5
KillMode=control-group

[Install]
WantedBy=default.target
```

Operations: `systemctl --user daemon-reload/enable/start/stop/restart/status`, `journalctl --user -u cc2im -f`

#### macOS (launchd user agent)

Path: `~/Library/LaunchAgents/com.cc2im.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
  <key>Label</key><string>com.cc2im</string>
  <key>ProgramArguments</key>
  <array>
    <string><node-path></string>
    <string><cc2im-dist/index.js></string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CC2IM_CONFIG</key><string><config-path></string>
  </dict>
  <key>WorkingDirectory</key><string><project-dir></string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>~/.local/share/cc2im/cc2im.log</string>
  <key>StandardErrorPath</key><string>~/.local/share/cc2im/cc2im.err</string>
</dict>
</plist>
```

Operations: `launchctl load/unload/start/stop`, log via `tail -f` on log files.

### Config Path Resolution (install time)

1. If `--config <path>` flag provided → use it
2. If `./config.yaml` exists in CWD → use absolute path of it
3. Else → `~/.config/cc2im/config.yaml`

## What We Don't Do

- No Windows support
- No CLI framework dependency (commander, yargs)
- No root/sudo required (user-level services only)
- No pm2 or other process manager dependency
