import { execFileSync, spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";
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

function systemdServicePath(): string {
  return join(homedir(), ".config", "systemd", "user", "cc2im.service");
}

function launchdPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", "com.cc2im.plist");
}

function launchdLogDir(): string {
  return join(homedir(), ".local", "share", "cc2im");
}

function run(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (err: any) {
    const stderr = err.stderr?.toString().trim() ?? "";
    const stdout = err.stdout?.toString().trim() ?? "";
    throw new Error(stderr || stdout || `${cmd} ${args.join(" ")} failed with code ${err.status}`);
  }
}

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
    const proc = spawn(
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
    const proc = spawn(
      "tail", ["-f", logPath],
      { stdio: "inherit" },
    );
    proc.on("error", () => console.error("Failed to tail log file"));
  }
}
