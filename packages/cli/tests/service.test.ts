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
    const cwdConfig = resolve("config.yaml");
    if (existsSync(cwdConfig)) {
      expect(resolveConfigPath(undefined)).toBe(cwdConfig);
    }
  });
});
