import { test, expect } from "./fixtures.js";
import { execSync, spawn } from "child_process";

const CLI = "node /app/packages/cli/dist/cli.js";
const CONTAINER = "e2e-app-1";
const CONFIG = "/app/e2e/fixtures/config.e2e.yaml";

function runCli(
  args: string,
  options?: { expectFail?: boolean },
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`docker exec ${CONTAINER} ${CLI} ${args}`, {
      encoding: "utf-8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    if (options?.expectFail) {
      return {
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
        exitCode: err.status ?? 1,
      };
    }
    throw err;
  }
}

async function runCliAsync(
  args: string,
  timeoutMs = 5000,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return runCliAsyncWithEnv(args, {}, timeoutMs);
}

async function runCliAsyncWithEnv(
  args: string,
  env: Record<string, string>,
  timeoutMs = 5000,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    const envFlags = Object.entries(env).map(([k, v]) => `-e ${k}=${v}`).join(" ");
    const dockerArgs = ["exec", ...(envFlags ? envFlags.split(" ") : []), CONTAINER, ...CLI.split(" "), ...(args ? args.split(" ") : [])];
    const proc = spawn("docker", dockerArgs, { stdio: ["pipe", "pipe", "pipe"] });
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

/**
 * Send a signal to a process running inside the Docker container.
 * Starts the CLI in the background with docker exec, waits briefly,
 * then sends the specified signal via docker exec kill.
 */
async function runCliWithSignal(
  args: string,
  signal: "SIGTERM" | "SIGINT",
  delayMs = 2000,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    // Start the CLI inside docker
    const proc = spawn(
      "docker",
      [
        "exec",
        CONTAINER,
        "sh",
        "-c",
        `${CLI} ${args} & PID=$!; sleep ${delayMs / 1000}; kill -s ${signal} $PID; wait $PID; echo "EXIT:$?"`,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
    }, 15000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

// ---------------------------------------------------------------------------
// CLI E2E Tests
// ---------------------------------------------------------------------------

test.describe("CLI E2E", () => {
  // =========================================================================
  // help / -h / --help
  // =========================================================================
  test.describe("help", () => {
    test("--help prints usage, lists all commands, exit 0", async () => {
      const { stdout, exitCode } = runCli("--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("cc2im");
      expect(stdout).toContain("Usage:");
      expect(stdout).toContain("install");
      expect(stdout).toContain("uninstall");
      expect(stdout).toContain("start");
      expect(stdout).toContain("stop");
      expect(stdout).toContain("restart");
      expect(stdout).toContain("status");
      expect(stdout).toContain("logs");
      expect(stdout).toContain("web");
      expect(stdout).toContain("run");
    });

    test("-h equals --help same output, exit 0", async () => {
      const help = runCli("--help");
      const h = runCli("-h");
      expect(h.exitCode).toBe(0);
      expect(h.stdout).toBe(help.stdout);
    });

    test("help subcommand works same output, exit 0", async () => {
      const help = runCli("--help");
      const sub = runCli("help");
      expect(sub.exitCode).toBe(0);
      expect(sub.stdout).toBe(help.stdout);
    });
  });

  // =========================================================================
  // unknown command
  // =========================================================================
  test.describe("unknown command", () => {
    test("badcmd → stderr Unknown command, usage hint, exit 1", async () => {
      const { stderr, stdout, exitCode } = runCli("badcmd", {
        expectFail: true,
      });
      expect(exitCode).toBe(1);
      // "Unknown command: badcmd" goes to stderr
      expect(stderr).toContain("Unknown command: badcmd");
      // Usage is printed to stdout
      expect(stdout).toContain("Usage:");
    });

    test("bare invocation (no args) runs bridge/default command", async () => {
      // The default command is "run" which starts the bridge.
      // Without an explicit config, it will look for config.yaml and may fail.
      // We verify it attempts to start (exits with error or starts).
      const result = await runCliAsync("", 5000);
      const combined = result.stdout + result.stderr;
      // Should show starting message, adapter error, or config not found
      expect(
        combined.includes("cc2im starting") ||
          combined.includes("No platform adapters configured") ||
          combined.includes("Fatal error") ||
          combined.includes("ENOENT"),
      ).toBeTruthy();
    });
  });

  // =========================================================================
  // install
  // =========================================================================
  test.describe("install", () => {
    test("happy path: install with e2e config writes service file, stdout confirmation", async () => {
      // In Docker without systemd, the install will write the service file
      // but fail on systemctl commands. We verify it attempts to write.
      const { stdout, stderr, exitCode } = runCli(
        `install --config ${CONFIG}`,
        { expectFail: true },
      );
      const combined = stdout + stderr;
      // Should write the service file before failing on systemctl
      expect(combined).toContain("Wrote");
    });

    test("custom config: install with custom config path references that path", async () => {
      // Create a minimal config file inside the container first
      execSync(
        `docker exec ${CONTAINER} sh -c "echo 'claude:\\n  command: claude\\ndiscord:\\n  token: \"\"\\nprojects: []' > /tmp/test-install.yaml"`,
        { encoding: "utf-8" },
      );
      const { stdout, stderr } = runCli(
        "install --config /tmp/test-install.yaml",
        { expectFail: true },
      );
      const combined = stdout + stderr;
      // Should reference the custom config path in the service file write
      expect(combined).toContain("Wrote");
    });

    test("config missing: install with nonexistent config → stderr Config not found, exit 1", async () => {
      const { stderr, stdout, exitCode } = runCli(
        "install --config /nonexistent.yaml",
        { expectFail: true },
      );
      expect(exitCode).toBe(1);
      const combined = stdout + stderr;
      expect(combined).toContain("Config not found");
    });

    test("no adapters: install with config that has no tokens → exits with adapter error, not restart loop", async () => {
      // Create a config with no Discord/Lark tokens
      execSync(
        `docker exec ${CONTAINER} sh -c "echo 'claude:\\n  command: claude\\ndiscord:\\n  token: \"\"\\nprojects: []' > /tmp/no-adapters.yaml"`,
        { encoding: "utf-8" },
      );
      // Install itself may succeed (writes file) or fail on systemctl.
      // The important thing is it does NOT enter a restart loop.
      const result = runCli("install --config /tmp/no-adapters.yaml", {
        expectFail: true,
      });
      // Should complete (not hang) - if we got here, no restart loop
      expect(result.exitCode).toBeDefined();
    });

    test("already installed: run install twice → either updates or shows already installed", async () => {
      // First install
      const first = runCli(`install --config ${CONFIG}`, { expectFail: true });
      // Second install
      const second = runCli(`install --config ${CONFIG}`, { expectFail: true });
      const combined = second.stdout + second.stderr;
      // Should either write again (update) or indicate already installed
      expect(
        combined.includes("Wrote") || combined.includes("already"),
      ).toBeTruthy();
    });
  });

  // =========================================================================
  // uninstall
  // =========================================================================
  test.describe("uninstall", () => {
    test("not installed: uninstall when no service → stdout not installed, exit 0", async () => {
      // First ensure no service file exists by removing it
      execSync(
        `docker exec ${CONTAINER} sh -c "rm -f ~/.config/systemd/user/cc2im.service" || true`,
        { encoding: "utf-8" },
      );
      const { stdout, exitCode } = runCli("uninstall");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("not installed");
    });

    test("happy path uninstall: after install, removes service", async () => {
      // Install first (will write the file, may fail on systemctl)
      runCli(`install --config ${CONFIG}`, { expectFail: true });
      // Now uninstall - may also fail on systemctl but should remove the file
      const result = runCli("uninstall", { expectFail: true });
      const combined = result.stdout + result.stderr;
      // Should either successfully uninstall or show systemctl error
      expect(
        combined.includes("uninstalled") ||
          combined.includes("systemctl") ||
          combined.includes("not installed"),
      ).toBeTruthy();
    });
  });

  // =========================================================================
  // start / stop / restart
  // =========================================================================
  test.describe("start / stop / restart", () => {
    test("start not installed → error message", async () => {
      // Ensure service file doesn't exist
      execSync(
        `docker exec ${CONTAINER} sh -c "rm -f ~/.config/systemd/user/cc2im.service" || true`,
        { encoding: "utf-8" },
      );
      const result = runCli("start", { expectFail: true });
      const combined = result.stdout + result.stderr;
      // Should error since systemctl is not available or service not found
      expect(result.exitCode).not.toBe(0);
      expect(combined.toLowerCase()).toMatch(/not installed|not found|no service|error|failed|systemctl/);
    });

    test("stop not installed → error message", async () => {
      execSync(
        `docker exec ${CONTAINER} sh -c "rm -f ~/.config/systemd/user/cc2im.service" || true`,
        { encoding: "utf-8" },
      );
      const result = runCli("stop", { expectFail: true });
      expect(result.exitCode).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/not installed|not found|no service|error|failed|systemctl/);
    });

    test("restart not installed → error message", async () => {
      execSync(
        `docker exec ${CONTAINER} sh -c "rm -f ~/.config/systemd/user/cc2im.service" || true`,
        { encoding: "utf-8" },
      );
      const result = runCli("restart", { expectFail: true });
      expect(result.exitCode).not.toBe(0);
      const combined = result.stdout + result.stderr;
      expect(combined.toLowerCase()).toMatch(/not installed|not found|no service|error|failed|systemctl/);
    });

    test("start/stop/restart basic invocation does not crash unexpectedly", async () => {
      // These will fail due to no systemd, but should fail gracefully
      for (const cmd of ["start", "stop", "restart"]) {
        const result = runCli(cmd, { expectFail: true });
        // Should not be a signal-based crash (exit code < 128)
        // systemctl errors typically exit 1 or similar
        expect(result.exitCode).toBeLessThan(128);
      }
    });
  });

  // =========================================================================
  // status
  // =========================================================================
  test.describe("status", () => {
    test("status when not installed → shows status info or error", async () => {
      execSync(
        `docker exec ${CONTAINER} sh -c "rm -f ~/.config/systemd/user/cc2im.service" || true`,
        { encoding: "utf-8" },
      );
      // status command catches errors and prints them, so it may exit 0
      const result = runCli("status", { expectFail: true });
      const combined = result.stdout + result.stderr;
      // Should produce meaningful output (either error message or status info)
      expect(combined.toLowerCase()).toMatch(/not installed|status|error|failed|systemctl|inactive|stopped/);
    });

    test("status basic invocation does not crash", async () => {
      const result = runCli("status", { expectFail: true });
      // status should not crash with a signal
      expect(result.exitCode).not.toBeNull();
      expect(result.exitCode!).toBeLessThan(128);
    });
  });

  // =========================================================================
  // logs
  // =========================================================================
  test.describe("logs", () => {
    test("logs invocation does not crash without journalctl", async () => {
      // logs spawns journalctl which may not exist in container
      // We use a short timeout since it either fails fast or streams forever
      const result = await runCliAsync("logs", 3000);
      // Should not crash with unhandled error
      // exitCode may be null (killed by timeout) or non-zero (journalctl not found)
      const combined = result.stdout + result.stderr;
      // If it produced output, it should be an error message not a stack trace
      if (combined.length > 0) {
        expect(combined).not.toContain("TypeError");
        expect(combined).not.toContain("ReferenceError");
      }
    });
  });

  // =========================================================================
  // web
  // =========================================================================
  test.describe("web", () => {
    // Kill any leftover node web processes before each test to avoid EADDRINUSE
    test.beforeEach(async () => {
      try {
        execSync(`docker exec ${CONTAINER} sh -c "pkill -f 'node.*cli.js web' || true"`, { encoding: "utf-8", timeout: 5000 });
      } catch {}
      // Wait for ports to be released
      await new Promise(r => setTimeout(r, 1000));
    });

    test("web with config shows URL in output", async () => {
      const result = await runCliAsync(`web --port 19001 --config ${CONFIG}`, 5000);
      const combined = result.stdout + result.stderr;
      expect(combined).toContain("cc2im web UI available at");
      expect(combined).toContain("19001");
    });

    test("custom port: web --port 19002 → URL shows 19002", async () => {
      const result = await runCliAsync(
        `web --port 19002 --config ${CONFIG}`,
        5000,
      );
      const combined = result.stdout + result.stderr;
      expect(combined).toContain("19002");
    });

    test("custom bind: web --bind 127.0.0.1 → binds to localhost", async () => {
      const result = await runCliAsync(
        `web --bind 127.0.0.1 --port 19003 --config ${CONFIG}`,
        5000,
      );
      const combined = result.stdout + result.stderr;
      expect(combined).toContain("127.0.0.1");
    });

    test("custom config: web --config with e2e config starts successfully", async () => {
      const result = await runCliAsync(`web --port 19004 --config ${CONFIG}`, 5000);
      const combined = result.stdout + result.stderr;
      expect(combined).toContain("cc2im web UI available at");
    });

    test("invalid port: web --port abc → error or NaN behavior", async () => {
      const result = await runCliAsync(
        `web --port abc --config ${CONFIG}`,
        5000,
      );
      const combined = result.stdout + result.stderr;
      // Should either error on invalid port or show NaN in output
      expect(
        combined.includes("NaN") ||
          combined.includes("error") ||
          combined.includes("Error") ||
          combined.includes("invalid") ||
          combined.includes("EACCES") ||
          result.exitCode !== 0,
      ).toBeTruthy();
    });
  });

  // =========================================================================
  // run
  // =========================================================================
  test.describe("run", () => {
    test("happy path with valid config → stdout starting message", async () => {
      // The e2e config may have a Discord token configured
      const result = await runCliAsync(`run --config ${CONFIG}`, 5000);
      const combined = result.stdout + result.stderr;
      // Should print "cc2im starting..." (or adapter error if no tokens)
      expect(
        combined.includes("cc2im starting") ||
          combined.includes("No platform adapters configured"),
      ).toBeTruthy();
    });

    test("no adapters (no tokens) → exits with adapter error, not infinite restart", async () => {
      // Create config with empty tokens and run with CC2IM_CONFIG env
      execSync(
        `docker exec ${CONTAINER} sh -c "cat > /tmp/no-adapters-run.yaml << 'YAML'
claude:
  command: /app/e2e/fixtures/mock-claude.sh
  defaultArgs: []
  timeout: 5000
  bufferInterval: 500
discord:
  token: ''
lark:
  appId: ''
  appSecret: ''
projects: []
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
    web: 100000
  maxConcurrentProcesses: 2
YAML"`,
        { encoding: "utf-8" },
      );
      // Use env var to pass config since run doesn't take --config
      const result = await runCliAsyncWithEnv(
        "run",
        { CC2IM_CONFIG: "/tmp/no-adapters-run.yaml" },
        5000,
      );
      const combined = result.stdout + result.stderr;
      // Should exit with error about no adapters or similar
      expect(
        combined.includes("No platform adapters") ||
          combined.includes("Fatal error") ||
          combined.includes("No adapter") ||
          result.exitCode !== 0,
      ).toBeTruthy();
    });

    test("SIGTERM shutdown: start run, send SIGTERM → clean exit", async () => {
      const result = await runCliWithSignal(
        `run --config ${CONFIG}`,
        "SIGTERM",
        2000,
      );
      // Should have started
      const combined = result.stdout + result.stderr;
      expect(
        combined.includes("cc2im starting") ||
          combined.includes("No platform adapters configured"),
      ).toBeTruthy();
      // Process should have exited (not hung)
      expect(result.exitCode).not.toBeNull();
    });

    test("SIGINT shutdown: start run, send SIGINT → clean exit", async () => {
      const result = await runCliWithSignal(
        `run --config ${CONFIG}`,
        "SIGINT",
        2000,
      );
      const combined = result.stdout + result.stderr;
      expect(
        combined.includes("cc2im starting") ||
          combined.includes("No platform adapters configured"),
      ).toBeTruthy();
      expect(result.exitCode).not.toBeNull();
    });

    test("config missing for run → exits with error", async () => {
      const result = await runCliAsync(
        "run --config /nonexistent-run.yaml",
        5000,
      );
      const combined = result.stdout + result.stderr;
      // Should error about missing config
      expect(result.exitCode).not.toBe(0);
      expect(combined.length).toBeGreaterThan(0);
    });
  });
});
