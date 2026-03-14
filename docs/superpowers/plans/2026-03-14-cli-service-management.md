# CLI Service Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `cc2im` CLI binary with subcommands to register/manage cc2im as a system service on Linux (systemd) and macOS (launchd).

**Architecture:** New `src/cli.ts` entry point parses argv and dispatches to `src/service.ts` for platform-specific service management, or to the existing `main()` for foreground run. Service files are generated from templates with paths baked in at install time.

**Tech Stack:** Node.js, child_process.execFileSync, systemd (Linux), launchd (macOS). No new dependencies.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/service.ts` | Create | Platform-abstract service management: detect platform, generate service files, exec systemctl/launchctl commands |
| `src/cli.ts` | Create | CLI entry point: parse `process.argv`, dispatch subcommands |
| `src/index.ts` | Modify (line 16) | Export `main()` function |
| `package.json` | Modify | Add `"bin"` field |

---

## Chunk 1: Service Module + CLI

### Task 1: Create service.ts — platform detection and config path resolution

**Files:**
- Create: `src/service.ts`
- Test: `tests/service.test.ts`

- [ ] **Step 1: Write failing tests for platform detection and config path resolution**

```ts
// tests/service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We'll test the exported helpers
describe("service", () => {
  describe("detectPlatform", () => {
    it("returns 'launchd' on darwin", () => {
      const { detectPlatform } = require("../src/service.js");
      // Mock tested via direct call with override
    });
  });

  describe("resolveConfigPath", () => {
    it("uses --config flag value when provided", () => {
      const { resolveConfigPath } = require("../src/service.js");
      const result = resolveConfigPath("/custom/config.yaml");
      expect(result).toBe("/custom/config.yaml");
    });
  });
});
```

Actually, since the service module calls system commands (systemctl, launchctl), unit testing the template generation is more valuable than testing the exec wrappers. Let's test template output.

```ts
// tests/service.test.ts
import { describe, it, expect } from "vitest";
import { generateSystemdUnit, generateLaunchdPlist, resolveConfigPath } from "../src/service.js";
import { existsSync } from "fs";
import { resolve } from "path";

describe("generateSystemdUnit", () => {
  it("produces valid unit file with correct paths", () => {
    const unit = generateSystemdUnit({
      nodePath: "/usr/bin/node",
      entryPath: "/home/user/.npm-global/lib/node_modules/cc2im/dist/index.js",
      configPath: "/home/user/.config/cc2im/config.yaml",
      workDir: "/home/user/.config/cc2im",
    });
    expect(unit).toContain("[Unit]");
    expect(unit).toContain("[Service]");
    expect(unit).toContain("[Install]");
    expect(unit).toContain("ExecStart=/usr/bin/node /home/user/.npm-global/lib/node_modules/cc2im/dist/index.js");
    expect(unit).toContain("CC2IM_CONFIG=/home/user/.config/cc2im/config.yaml");
    expect(unit).toContain("WorkingDirectory=/home/user/.config/cc2im");
    expect(unit).toContain("KillMode=control-group");
    expect(unit).toContain("Restart=always");
  });
});

describe("generateLaunchdPlist", () => {
  it("produces valid plist with correct paths", () => {
    const plist = generateLaunchdPlist({
      nodePath: "/usr/local/bin/node",
      entryPath: "/usr/local/lib/node_modules/cc2im/dist/index.js",
      configPath: "/Users/me/.config/cc2im/config.yaml",
      workDir: "/Users/me/.config/cc2im",
    });
    expect(plist).toContain("<key>Label</key>");
    expect(plist).toContain("<string>com.cc2im</string>");
    expect(plist).toContain("<string>/usr/local/bin/node</string>");
    expect(plist).toContain("<string>/usr/local/lib/node_modules/cc2im/dist/index.js</string>");
    expect(plist).toContain("CC2IM_CONFIG");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain("<key>RunAtLoad</key>");
  });
});

describe("resolveConfigPath", () => {
  it("returns explicit path when provided", () => {
    expect(resolveConfigPath("/my/config.yaml")).toBe("/my/config.yaml");
  });

  it("returns cwd config.yaml when it exists", () => {
    // config.yaml exists in project root (our test CWD)
    const cwdConfig = resolve("config.yaml");
    if (existsSync(cwdConfig)) {
      expect(resolveConfigPath(undefined)).toBe(cwdConfig);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/service.test.ts`
Expected: FAIL — module `../src/service.js` has no exports yet.

- [ ] **Step 3: Implement service.ts — types, template generators, and config resolution**

```ts
// src/service.ts
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type ServicePlatform = "systemd" | "launchd";

export interface ServicePaths {
  nodePath: string;
  entryPath: string;
  configPath: string;
  workDir: string;
}

export function detectPlatform(): ServicePlatform {
  return process.platform === "darwin" ? "launchd" : "systemd";
}

export function resolveConfigPath(explicit?: string): string {
  if (explicit) return resolve(explicit);
  const cwdConfig = resolve("config.yaml");
  if (existsSync(cwdConfig)) return cwdConfig;
  return join(homedir(), ".config", "cc2im", "config.yaml");
}

function resolveServicePaths(configPath?: string): ServicePaths {
  const entryPath = resolve(__dirname, "index.js");
  const resolved = resolveConfigPath(configPath);
  return {
    nodePath: process.execPath,
    entryPath,
    configPath: resolved,
    workDir: dirname(resolved),
  };
}

// --- Template generators ---

export function generateSystemdUnit(paths: ServicePaths): string {
  return `[Unit]
Description=cc2im - Claude Code to IM bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${paths.workDir}
ExecStart=${paths.nodePath} ${paths.entryPath}
Environment=CC2IM_CONFIG=${paths.configPath}
Environment=PATH=${process.env.PATH}
Restart=always
RestartSec=5
KillMode=control-group

[Install]
WantedBy=default.target
`;
}

export function generateLaunchdPlist(paths: ServicePaths): string {
  const logDir = join(homedir(), ".local", "share", "cc2im");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cc2im</string>
  <key>ProgramArguments</key>
  <array>
    <string>${paths.nodePath}</string>
    <string>${paths.entryPath}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CC2IM_CONFIG</key>
    <string>${paths.configPath}</string>
    <key>PATH</key>
    <string>${process.env.PATH}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${paths.workDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logDir}/cc2im.log</string>
  <key>StandardErrorPath</key>
  <string>${logDir}/cc2im.err</string>
</dict>
</plist>
`;
}

// --- Service file paths ---

function systemdServicePath(): string {
  return join(homedir(), ".config", "systemd", "user", "cc2im.service");
}

function launchdPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", "com.cc2im.plist");
}

function launchdLogDir(): string {
  return join(homedir(), ".local", "share", "cc2im");
}

// --- exec helper ---

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString().trim() ?? "";
    const stdout = err.stdout?.toString().trim() ?? "";
    throw new Error(stderr || stdout || `${cmd} ${args.join(" ")} failed with code ${err.status}`);
  }
}

// --- Public commands ---

export function install(configPath?: string): void {
  const platform = detectPlatform();
  const paths = resolveServicePaths(configPath);

  if (!existsSync(paths.configPath)) {
    console.error(`Config not found: ${paths.configPath}`);
    console.error(`Create it first, or use: cc2im install --config /path/to/config.yaml`);
    process.exit(1);
  }

  if (platform === "systemd") {
    const servicePath = systemdServicePath();
    mkdirSync(dirname(servicePath), { recursive: true });
    writeFileSync(servicePath, generateSystemdUnit(paths));
    console.log(`Wrote ${servicePath}`);
    run("systemctl", ["--user", "daemon-reload"]);
    run("systemctl", ["--user", "enable", "cc2im.service"]);
    run("systemctl", ["--user", "start", "cc2im.service"]);
    console.log("cc2im service installed and started.");
  } else {
    const plistPath = launchdPlistPath();
    mkdirSync(dirname(plistPath), { recursive: true });
    mkdirSync(launchdLogDir(), { recursive: true });
    writeFileSync(plistPath, generateLaunchdPlist(paths));
    console.log(`Wrote ${plistPath}`);
    run("launchctl", ["load", "-w", plistPath]);
    console.log("cc2im service installed and started.");
  }
}

export function uninstall(): void {
  const platform = detectPlatform();

  if (platform === "systemd") {
    const servicePath = systemdServicePath();
    if (!existsSync(servicePath)) {
      console.log("cc2im service is not installed.");
      return;
    }
    try { run("systemctl", ["--user", "stop", "cc2im.service"]); } catch {}
    try { run("systemctl", ["--user", "disable", "cc2im.service"]); } catch {}
    unlinkSync(servicePath);
    run("systemctl", ["--user", "daemon-reload"]);
    console.log("cc2im service uninstalled.");
  } else {
    const plistPath = launchdPlistPath();
    if (!existsSync(plistPath)) {
      console.log("cc2im service is not installed.");
      return;
    }
    try { run("launchctl", ["unload", plistPath]); } catch {}
    unlinkSync(plistPath);
    console.log("cc2im service uninstalled.");
  }
}

export function start(): void {
  const platform = detectPlatform();
  if (platform === "systemd") {
    run("systemctl", ["--user", "start", "cc2im.service"]);
  } else {
    run("launchctl", ["start", "com.cc2im"]);
  }
  console.log("cc2im started.");
}

export function stop(): void {
  const platform = detectPlatform();
  if (platform === "systemd") {
    run("systemctl", ["--user", "stop", "cc2im.service"]);
  } else {
    run("launchctl", ["stop", "com.cc2im"]);
  }
  console.log("cc2im stopped.");
}

export function restart(): void {
  const platform = detectPlatform();
  if (platform === "systemd") {
    run("systemctl", ["--user", "restart", "cc2im.service"]);
  } else {
    stop();
    start();
  }
  console.log("cc2im restarted.");
}

export function status(): void {
  const platform = detectPlatform();
  if (platform === "systemd") {
    try {
      const output = run("systemctl", ["--user", "status", "cc2im.service"]);
      console.log(output);
    } catch (err: any) {
      console.log(err.message);
    }
  } else {
    try {
      const output = run("launchctl", ["list", "com.cc2im"]);
      console.log(output);
    } catch {
      console.log("cc2im service is not running.");
    }
  }
}

export function logs(): void {
  const platform = detectPlatform();
  if (platform === "systemd") {
    const proc = require("child_process").spawn(
      "journalctl", ["--user", "-u", "cc2im.service", "-f", "--no-pager"],
      { stdio: "inherit" },
    );
    proc.on("error", () => console.error("Failed to run journalctl"));
  } else {
    const logPath = join(launchdLogDir(), "cc2im.log");
    if (!existsSync(logPath)) {
      console.log("No logs yet.");
      return;
    }
    const proc = require("child_process").spawn(
      "tail", ["-f", logPath],
      { stdio: "inherit" },
    );
    proc.on("error", () => console.error("Failed to tail log file"));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service.ts tests/service.test.ts
git commit -m "feat: add service management module with systemd/launchd support"
```

---

### Task 2: Create cli.ts entry point

**Files:**
- Create: `src/cli.ts`
- Modify: `src/index.ts` (export main)
- Modify: `package.json` (add bin field)

- [ ] **Step 1: Export main() from index.ts**

In `src/index.ts`, change line 16 from:
```ts
async function main() {
```
to:
```ts
export async function main() {
```

And change lines 358-361 from:
```ts
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```
to:
```ts
// Run directly if this is the entry point
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith("/index.js") || process.argv[1].endsWith("/index.ts")
);
if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Create cli.ts**

```ts
// src/cli.ts
#!/usr/bin/env node
import { install, uninstall, start, stop, restart, status, logs } from "./service.js";

const USAGE = `cc2im - Claude Code to IM bridge

Usage:
  cc2im install [--config <path>]   Install as system service and start
  cc2im uninstall                   Stop and remove system service
  cc2im start                       Start the service
  cc2im stop                        Stop the service
  cc2im restart                     Restart the service
  cc2im status                      Show service status
  cc2im logs                        Tail service logs
  cc2im run                         Run in foreground (default)
`;

const command = process.argv[2] ?? "run";

switch (command) {
  case "install": {
    const configIdx = process.argv.indexOf("--config");
    const configPath = configIdx !== -1 ? process.argv[configIdx + 1] : undefined;
    install(configPath);
    break;
  }
  case "uninstall":
    uninstall();
    break;
  case "start":
    start();
    break;
  case "stop":
    stop();
    break;
  case "restart":
    restart();
    break;
  case "status":
    status();
    break;
  case "logs":
    logs();
    break;
  case "run": {
    const { main } = await import("./index.js");
    main().catch((err: Error) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
    break;
  }
  case "--help":
  case "-h":
  case "help":
    console.log(USAGE);
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    console.log(USAGE);
    process.exit(1);
}
```

- [ ] **Step 3: Add bin field to package.json**

Add to package.json:
```json
"bin": {
  "cc2im": "dist/cli.js"
},
```

- [ ] **Step 4: Build and verify**

Run: `npx tsc --noEmit`
Expected: No errors.

Run: `npx tsc && node dist/cli.js --help`
Expected: Prints usage text.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts src/index.ts package.json
git commit -m "feat: add cc2im CLI with service management subcommands"
```

---

### Task 3: Clean up existing systemd service file

The hand-crafted `/home/hills/.config/systemd/user/cc2im.service` from earlier should be replaced by the generated one.

- [ ] **Step 1: Uninstall old service, reinstall via CLI**

```bash
systemctl --user stop cc2im.service
systemctl --user disable cc2im.service
npx tsc && node dist/cli.js install --config /home/hills/projects/cc2im/config.yaml
```

- [ ] **Step 2: Verify service is running**

```bash
node dist/cli.js status
```
Expected: Shows active/running.

- [ ] **Step 3: Verify restart works**

```bash
node dist/cli.js restart
node dist/cli.js status
```
Expected: Shows active/running with fresh start time.

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A && git commit -m "chore: switch to CLI-managed service"
```
