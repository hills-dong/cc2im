import { describe, it, expect } from "vitest";
import { generateSystemdUnit, generateLaunchdPlist, type ServicePaths } from "../src/service.js";
import { homedir } from "os";
import { join } from "path";

describe("generateSystemdUnit edge cases", () => {
  it("handles paths with spaces", () => {
    const paths: ServicePaths = {
      nodePath: "/usr/local/my apps/node",
      entryPath: "/home/user/my project/dist/index.js",
      configPath: "/home/user/my config/config.yaml",
      workDir: "/home/user/my config",
    };
    const unit = generateSystemdUnit(paths);
    expect(unit).toContain("ExecStart=/usr/local/my apps/node /home/user/my project/dist/index.js");
    expect(unit).toContain("WorkingDirectory=/home/user/my config");
    expect(unit).toContain("CC2IM_CONFIG=/home/user/my config/config.yaml");
  });
});

describe("generateLaunchdPlist edge cases", () => {
  it("handles paths with spaces", () => {
    const paths: ServicePaths = {
      nodePath: "/usr/local/my apps/node",
      entryPath: "/Users/me/my project/dist/index.js",
      configPath: "/Users/me/my config/config.yaml",
      workDir: "/Users/me/my config",
    };
    const plist = generateLaunchdPlist(paths);
    expect(plist).toContain("<string>/usr/local/my apps/node</string>");
    expect(plist).toContain("<string>/Users/me/my project/dist/index.js</string>");
    expect(plist).toContain("<string>/Users/me/my config</string>");
  });

  it("does not escape XML special chars in paths (template literal pass-through)", () => {
    const paths: ServicePaths = {
      nodePath: "/usr/bin/node",
      entryPath: "/home/user/a&b/index.js",
      configPath: "/home/user/<config>/config.yaml",
      workDir: "/home/user/<config>",
    };
    const plist = generateLaunchdPlist(paths);
    // Note: This is a potential bug — XML special chars are not escaped.
    // The template literal just passes them through raw.
    expect(plist).toContain("<string>/home/user/a&b/index.js</string>");
    expect(plist).toContain("<string>/home/user/<config>/config.yaml</string>");
  });

  it("log paths point to ~/.local/share/cc2im/", () => {
    const paths: ServicePaths = {
      nodePath: "/usr/bin/node",
      entryPath: "/usr/lib/cc2im/index.js",
      configPath: "/etc/cc2im/config.yaml",
      workDir: "/etc/cc2im",
    };
    const plist = generateLaunchdPlist(paths);
    const logDir = join(homedir(), ".local", "share", "cc2im");
    expect(plist).toContain(`<string>${logDir}/cc2im.log</string>`);
    expect(plist).toContain(`<string>${logDir}/cc2im.err</string>`);
  });
});
