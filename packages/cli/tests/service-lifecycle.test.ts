import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { homedir } from "os";
import { EventEmitter } from "events";

// Mock child_process
vi.mock("child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("child_process")>();
  return {
    ...mod,
    execFileSync: vi.fn(() => ""),
    spawn: vi.fn(() => {
      const emitter = new EventEmitter();
      return emitter;
    }),
  };
});

// Mock fs
vi.mock("fs", async (importOriginal) => {
  const mod = await importOriginal<typeof import("fs")>();
  return {
    ...mod,
    existsSync: vi.fn(() => true),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

const { execFileSync, spawn } = await import("child_process");
const { existsSync, writeFileSync, mkdirSync, unlinkSync } = await import("fs");

const originalPlatform = process.platform;
const mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
const mockProcessExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

// Must import after mocks
const { install, uninstall, start, stop, restart, status, logs } = await import("../src/service.js");

describe("install", () => {
  it("installs systemd service on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (existsSync as any).mockReturnValue(true);

    install("/home/user/config.yaml");

    expect(mkdirSync).toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalled();
    expect(execFileSync).toHaveBeenCalledWith(
      "systemctl", ["--user", "daemon-reload"],
      expect.anything(),
    );
    expect(execFileSync).toHaveBeenCalledWith(
      "systemctl", ["--user", "enable", "cc2im.service"],
      expect.anything(),
    );
    expect(execFileSync).toHaveBeenCalledWith(
      "systemctl", ["--user", "start", "cc2im.service"],
      expect.anything(),
    );
  });

  it("installs launchd service on darwin", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (existsSync as any).mockReturnValue(true);

    install("/Users/me/config.yaml");

    expect(mkdirSync).toHaveBeenCalledTimes(2); // plist dir + log dir
    expect(writeFileSync).toHaveBeenCalled();
    expect(execFileSync).toHaveBeenCalledWith(
      "launchctl",
      expect.arrayContaining(["load", "-w"]),
      expect.anything(),
    );
  });

  it("exits when config file does not exist", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (existsSync as any).mockReturnValue(false);

    install("/nonexistent/config.yaml");

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining("Config not found"));
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });
});

describe("uninstall", () => {
  it("uninstalls systemd service on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (existsSync as any).mockReturnValue(true);

    uninstall();

    expect(unlinkSync).toHaveBeenCalled();
    expect(execFileSync).toHaveBeenCalledWith(
      "systemctl", ["--user", "daemon-reload"],
      expect.anything(),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith("cc2im service uninstalled.");
  });

  it("uninstalls launchd service on darwin", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (existsSync as any).mockReturnValue(true);

    uninstall();

    expect(execFileSync).toHaveBeenCalledWith(
      "launchctl",
      expect.arrayContaining(["unload"]),
      expect.anything(),
    );
    expect(unlinkSync).toHaveBeenCalled();
    expect(mockConsoleLog).toHaveBeenCalledWith("cc2im service uninstalled.");
  });

  it("logs not installed when service file missing on systemd", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (existsSync as any).mockReturnValue(false);

    uninstall();

    expect(mockConsoleLog).toHaveBeenCalledWith("cc2im service is not installed.");
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("logs not installed when plist missing on launchd", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (existsSync as any).mockReturnValue(false);

    uninstall();

    expect(mockConsoleLog).toHaveBeenCalledWith("cc2im service is not installed.");
    expect(unlinkSync).not.toHaveBeenCalled();
  });

  it("swallows stop/disable errors on systemd uninstall", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (existsSync as any).mockReturnValue(true);
    // Make stop/disable fail, but daemon-reload succeed
    (execFileSync as any).mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes("stop") || args.includes("disable")) {
        throw new Error("unit not loaded");
      }
      return "";
    });

    // Should not throw
    uninstall();
    expect(unlinkSync).toHaveBeenCalled();
  });
});

describe("start", () => {
  it("starts via systemctl on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (execFileSync as any).mockReturnValue("");
    start();
    expect(execFileSync).toHaveBeenCalledWith(
      "systemctl", ["--user", "start", "cc2im.service"],
      expect.anything(),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith("cc2im started.");
  });

  it("starts via launchctl on darwin", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (execFileSync as any).mockReturnValue("");
    start();
    expect(execFileSync).toHaveBeenCalledWith(
      "launchctl", ["start", "com.cc2im"],
      expect.anything(),
    );
  });
});

describe("stop", () => {
  it("stops via systemctl on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (execFileSync as any).mockReturnValue("");
    stop();
    expect(execFileSync).toHaveBeenCalledWith(
      "systemctl", ["--user", "stop", "cc2im.service"],
      expect.anything(),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith("cc2im stopped.");
  });

  it("stops via launchctl on darwin", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (execFileSync as any).mockReturnValue("");
    stop();
    expect(execFileSync).toHaveBeenCalledWith(
      "launchctl", ["stop", "com.cc2im"],
      expect.anything(),
    );
  });
});

describe("restart", () => {
  it("restarts via systemctl on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (execFileSync as any).mockReturnValue("");
    restart();
    expect(execFileSync).toHaveBeenCalledWith(
      "systemctl", ["--user", "restart", "cc2im.service"],
      expect.anything(),
    );
    expect(mockConsoleLog).toHaveBeenCalledWith("cc2im restarted.");
  });

  it("restarts via stop+start on darwin (launchd)", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (execFileSync as any).mockReturnValue("");
    restart();
    expect(execFileSync).toHaveBeenCalledWith(
      "launchctl", ["stop", "com.cc2im"],
      expect.anything(),
    );
    expect(execFileSync).toHaveBeenCalledWith(
      "launchctl", ["start", "com.cc2im"],
      expect.anything(),
    );
  });

  it("propagates stop failure on launchd restart", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (execFileSync as any).mockImplementation(() => {
      throw Object.assign(new Error("not running"), { stderr: "not running", stdout: "" });
    });

    expect(() => restart()).toThrow("not running");
  });
});

describe("status", () => {
  it("shows systemctl status output on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (execFileSync as any).mockReturnValue("Active: active (running)");

    status();

    expect(mockConsoleLog).toHaveBeenCalledWith("Active: active (running)");
  });

  it("shows error message on systemd status failure", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    (execFileSync as any).mockImplementation(() => {
      throw Object.assign(new Error("inactive"), { stderr: "inactive (dead)", stdout: "" });
    });

    status();

    // The run() function throws with stderr content, which status() catches and logs
    expect(mockConsoleLog).toHaveBeenCalledWith("inactive (dead)");
  });

  it("shows launchctl list output on darwin", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (execFileSync as any).mockReturnValue("PID\tStatus\tLabel\n123\t0\tcom.cc2im");

    status();

    expect(mockConsoleLog).toHaveBeenCalledWith("PID\tStatus\tLabel\n123\t0\tcom.cc2im");
  });

  it("shows not running on launchd status failure", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (execFileSync as any).mockImplementation(() => {
      throw new Error("Could not find service");
    });

    status();

    expect(mockConsoleLog).toHaveBeenCalledWith("cc2im service is not running.");
  });
});

describe("logs", () => {
  it("spawns journalctl on linux", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    logs();

    expect(spawn).toHaveBeenCalledWith(
      "journalctl",
      ["--user", "-u", "cc2im.service", "-f", "--no-pager"],
      { stdio: "inherit" },
    );
  });

  it("spawns tail on darwin when log exists", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (existsSync as any).mockReturnValue(true);

    logs();

    const logPath = join(homedir(), ".local", "share", "cc2im", "cc2im.log");
    expect(spawn).toHaveBeenCalledWith(
      "tail",
      ["-f", logPath],
      { stdio: "inherit" },
    );
  });

  it("shows no logs message when log file missing on darwin", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    (existsSync as any).mockReturnValue(false);

    logs();

    expect(mockConsoleLog).toHaveBeenCalledWith("No logs yet.");
    expect(spawn).not.toHaveBeenCalled();
  });
});
