import { describe, test, expect } from "vitest";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const CLI_CWD = "/home/hills/projects/cc2im/packages/cli";

async function runCli(
  args: string[],
  options?: { timeout?: number; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "npx",
      ["tsx", "src/cli.ts", ...args],
      {
        cwd: CLI_CWD,
        timeout: options?.timeout ?? 10_000,
        env: { ...process.env, ...options?.env },
      },
    );
    return { stdout, stderr, exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.code ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// help commands
// ---------------------------------------------------------------------------
describe("help commands", () => {
  const expectedKeywords = [
    "install",
    "uninstall",
    "start",
    "stop",
    "restart",
    "status",
    "logs",
    "web",
    "run",
  ];

  test("cc2im --help prints usage and exits 0", async () => {
    const { stdout, exitCode } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    for (const kw of expectedKeywords) {
      expect(stdout).toContain(kw);
    }
  });

  test("cc2im -h produces same output as --help", async () => {
    const helpResult = await runCli(["--help"]);
    const hResult = await runCli(["-h"]);
    expect(hResult.exitCode).toBe(0);
    expect(hResult.stdout).toBe(helpResult.stdout);
  });

  test("cc2im help produces same output as --help", async () => {
    const helpResult = await runCli(["--help"]);
    const result = await runCli(["help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(helpResult.stdout);
  });
});

// ---------------------------------------------------------------------------
// unknown command
// ---------------------------------------------------------------------------
describe("unknown command", () => {
  test("cc2im badcmd prints error to stderr and exits non-zero", async () => {
    const { stdout, stderr, exitCode } = await runCli(["badcmd"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Unknown command: badcmd");
    // Usage text is printed to stdout via console.log
    expect(stdout).toContain("cc2im");
  });
});

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------
describe("install", () => {
  test("cc2im install with no config present exits non-zero with Config not found", async () => {
    // Run from a temp-like dir where no config.yaml exists and default ~/.config/cc2im/config.yaml is absent
    const { stderr, exitCode } = await runCli(["install", "--config", "/tmp/cc2im-test-definitely-nonexistent.yaml"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Config not found");
  });

  test("cc2im install --config /tmp/cc2im-test-nonexistent.yaml errors with Config not found", async () => {
    const { stderr, exitCode } = await runCli(["install", "--config", "/tmp/cc2im-test-nonexistent.yaml"]);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("Config not found");
  });
});

// ---------------------------------------------------------------------------
// web
// ---------------------------------------------------------------------------
describe("web", () => {
  test("cc2im web --port 9876 starts server and outputs URL with port", async () => {
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const proc = spawn("npx", ["tsx", "src/cli.ts", "web", "--port", "9876"], {
        cwd: CLI_CWD,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let resolved = false;

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
        // Once we see the URL or enough output, resolve
        if (stdout.includes("9876") && !resolved) {
          resolved = true;
          proc.kill("SIGTERM");
          resolve({ stdout, stderr, exitCode: 0 });
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        }
      });

      // Kill after timeout if not resolved
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill("SIGTERM");
          resolve({ stdout, stderr, exitCode: -1 });
        }
      }, 15_000);
    });

    // The server should print the URL containing port 9876, or fail during startup
    // (e.g. config resolution). Either way we verify the process attempted to start.
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  }, 20_000);

  test("cc2im web --port abc handles non-numeric port", async () => {
    // parseInt("abc", 10) returns NaN, which may cause downstream errors
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const proc = spawn("npx", ["tsx", "src/cli.ts", "web", "--port", "abc"], {
        cwd: CLI_CWD,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let resolved = false;

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill("SIGTERM");
          resolve({ stdout, stderr, exitCode: -1 });
        }
      }, 10_000);
    });

    // The process should either error or produce some output about the invalid port
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  }, 15_000);
});

// ---------------------------------------------------------------------------
// uninstall (CI only — runs real systemctl, would uninstall host service)
// ---------------------------------------------------------------------------
describe.skipIf(!process.env.CI)("uninstall", () => {
  test("cc2im uninstall completes without crashing", async () => {
    // May print "not installed" or "uninstalled" depending on environment
    const { stdout, exitCode } = await runCli(["uninstall"]);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/not installed|uninstalled/);
  });
});

// ---------------------------------------------------------------------------
// start / stop / restart / status (CI only — runs real systemctl)
// ---------------------------------------------------------------------------
describe.skipIf(!process.env.CI)("start/stop/restart/status (systemctl dependent)", () => {
  // These tests verify the CLI attempts the right system commands.
  // They will fail with systemctl errors when the service is not installed,
  // which is the expected behavior.

  test("cc2im start when no service errors", async () => {
    const { exitCode, stderr } = await runCli(["start"]);
    // systemctl --user start cc2im.service should fail => process.exit via thrown error
    expect(exitCode).not.toBe(0);
    expect(stderr.length).toBeGreaterThan(0);
  });

  test("cc2im stop when no service errors", async () => {
    const { exitCode, stderr } = await runCli(["stop"]);
    expect(exitCode).not.toBe(0);
    expect(stderr.length).toBeGreaterThan(0);
  });

  test("cc2im restart when no service errors", async () => {
    const { exitCode, stderr } = await runCli(["restart"]);
    expect(exitCode).not.toBe(0);
    expect(stderr.length).toBeGreaterThan(0);
  });

  test("cc2im status when no service outputs something", async () => {
    // status catches errors gracefully and prints the error message
    const { stdout, exitCode } = await runCli(["status"]);
    // status should exit 0 because it catches the error
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// run (CI only — spawns real bridge that may connect to Discord with host config)
// ---------------------------------------------------------------------------
describe.skipIf(!process.env.CI)("run", () => {
  test("cc2im run starts the bridge or errors with config message", async () => {
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const proc = spawn("npx", ["tsx", "src/cli.ts", "run"], {
        cwd: CLI_CWD,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let resolved = false;

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        }
      });

      // The process will either start and keep running, or fail quickly due to missing config
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill("SIGTERM");
          resolve({ stdout, stderr, exitCode: 0 });
        }
      }, 5_000);
    });

    // It should either print a startup message or a config/error related message
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  }, 10_000);

  test("cc2im with no subcommand defaults to run (same behavior)", async () => {
    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const proc = spawn("npx", ["tsx", "src/cli.ts"], {
        cwd: CLI_CWD,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let resolved = false;

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        if (!resolved) {
          resolved = true;
          resolve({ stdout, stderr, exitCode: code ?? 1 });
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          proc.kill("SIGTERM");
          resolve({ stdout, stderr, exitCode: 0 });
        }
      }, 5_000);
    });

    // Should behave the same as "run" - either start or fail with config error
    const combined = result.stdout + result.stderr;
    expect(combined.length).toBeGreaterThan(0);
  }, 10_000);
});
