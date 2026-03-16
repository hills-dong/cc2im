import { describe, test, expect, beforeEach, vi } from "vitest";
import { SessionManager } from "../src/session.js";
import type { ClaudeConfig, FormatterConfig } from "../src/types.js";

function makeClaudeConfig(overrides?: Partial<ClaudeConfig>): ClaudeConfig {
  return {
    command: "bash",
    defaultArgs: [],
    bufferInterval: 1000,
    timeout: 5000,
    ...overrides,
  };
}

function makeFormatterConfig(overrides?: Partial<FormatterConfig>): FormatterConfig {
  return {
    maxMessageLength: { lark: 4000, discord: 2000, web: 8000 },
    maxConcurrentProcesses: 3,
    ...overrides,
  };
}

describe("SessionManager uncovered cases", () => {
  let sm: SessionManager;
  let claudeConfig: ClaudeConfig;
  let formatterConfig: FormatterConfig;

  beforeEach(() => {
    claudeConfig = makeClaudeConfig();
    formatterConfig = makeFormatterConfig();
    sm = new SessionManager(claudeConfig, formatterConfig);
  });

  // === Test 1: updateConfig - passed config object mutation affects manager ===
  describe("updateConfig", () => {
    test("passed config object mutation affects manager (shared reference)", () => {
      const newFormatter = makeFormatterConfig({ maxConcurrentProcesses: 5 });
      sm.updateConfig(claudeConfig, newFormatter);

      // Mutate the passed object externally
      newFormatter.maxConcurrentProcesses = 0;

      // The manager stores a reference, so mutation is reflected
      expect(sm.canAccept()).toBe(false);
    });
  });

  // === Tests 2-4: parseLine ===
  describe("parseLine", () => {
    test("empty string returns null", () => {
      expect(sm.parseLine("")).toBeNull();
    });

    test("parses result event", () => {
      const line = JSON.stringify({ type: "result", subtype: "success", result: "done", session_id: "s1" });
      const event = sm.parseLine(line);
      expect(event).not.toBeNull();
      expect(event!.type).toBe("result");
    });

    test("JSON with unknown extra fields are preserved", () => {
      const line = JSON.stringify({ type: "system", subtype: "init", session_id: "s1", extraField: 42, nested: { a: 1 } });
      const event = sm.parseLine(line) as any;
      expect(event).not.toBeNull();
      expect(event.extraField).toBe(42);
      expect(event.nested).toEqual({ a: 1 });
    });
  });

  // === Tests 5-7: buildArgs ===
  describe("buildArgs", () => {
    test("sessionId null does not include --resume", () => {
      const args = sm.buildArgs(null);
      expect(args).not.toContain("--resume");
    });

    test("does not modify original defaultArgs array", () => {
      const originalArgs = ["--output-format", "stream-json", "--model", "opus"];
      const config = makeClaudeConfig({ defaultArgs: originalArgs });
      const sm2 = new SessionManager(config, formatterConfig);

      const argsCopy = [...originalArgs];
      sm2.buildArgs("session-1", "sonnet");

      expect(originalArgs).toEqual(argsCopy);
    });

    test("sessionId empty string is falsy, no --resume added", () => {
      const args = sm.buildArgs("");
      expect(args).not.toContain("--resume");
    });
  });

  // === Tests 8-17: invoke ===
  describe("invoke", () => {
    // Helper: build a SessionManager that uses bash -c as command.
    // The trick: buildArgs spreads defaultArgs, then appends -p <message>.
    // We use a bash script in defaultArgs that ignores extra args.
    function makeInvokeSM(script: string, overrides?: Partial<ClaudeConfig>): SessionManager {
      const config = makeClaudeConfig({
        command: "bash",
        defaultArgs: ["-c", script, "--"],
        timeout: 3000,
        ...overrides,
      });
      return new SessionManager(config, makeFormatterConfig());
    }

    test("successful execution returns SessionResult with success=true", async () => {
      const resultEvent = JSON.stringify({ type: "result", subtype: "success", result: "hello world", session_id: "s1" });
      const sm2 = makeInvokeSM(`echo '${resultEvent}'`);

      const result = await sm2.invoke("thread-1", "/tmp", null, "test message", () => {});
      expect(result.success).toBe(true);
      expect(result.text).toBe("hello world");
    });

    test("nonexistent command rejects with error", async () => {
      const config = makeClaudeConfig({
        command: "/nonexistent/command/that/does/not/exist",
        defaultArgs: [],
        timeout: 3000,
      });
      const sm2 = new SessionManager(config, formatterConfig);

      await expect(sm2.invoke("thread-1", "/tmp", null, "msg", () => {})).rejects.toThrow();
    });

    test("extracts session_id from init event", async () => {
      const initEvent = JSON.stringify({ type: "system", subtype: "init", session_id: "my-session-42" });
      const resultEvent = JSON.stringify({ type: "result", subtype: "success", result: "ok", session_id: "my-session-42" });
      const sm2 = makeInvokeSM(`echo '${initEvent}'; echo '${resultEvent}'`);

      const result = await sm2.invoke("thread-1", "/tmp", null, "msg", () => {});
      expect(result.sessionId).toBe("my-session-42");
    });

    test("accumulates assistant text from multiple blocks", async () => {
      const assistant1 = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello " }] },
      });
      const assistant2 = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "World" }] },
      });
      // No result event with result field, so fullText should be accumulated assistant text
      const resultEvent = JSON.stringify({ type: "result", subtype: "success", session_id: "s1" });
      const sm2 = makeInvokeSM(`echo '${assistant1}'; echo '${assistant2}'; echo '${resultEvent}'`);

      const result = await sm2.invoke("thread-1", "/tmp", null, "msg", () => {});
      expect(result.text).toContain("Hello ");
      expect(result.text).toContain("World");
    });

    test("calls onEvent for each valid JSON line", async () => {
      const event1 = JSON.stringify({ type: "system", subtype: "init", session_id: "s1" });
      const event2 = JSON.stringify({ type: "result", subtype: "success", result: "ok", session_id: "s1" });
      const sm2 = makeInvokeSM(`echo '${event1}'; echo '${event2}'`);

      const events: any[] = [];
      await sm2.invoke("thread-1", "/tmp", null, "msg", (e) => events.push(e));
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("system");
      expect(events[1].type).toBe("result");
    });

    test("calls onStart exactly once when processing begins", async () => {
      const resultEvent = JSON.stringify({ type: "result", subtype: "success", result: "ok", session_id: "s1" });
      const sm2 = makeInvokeSM(`echo '${resultEvent}'`);

      const onStart = vi.fn();
      await sm2.invoke("thread-1", "/tmp", null, "msg", () => {}, undefined, onStart);
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    test("cleans up active map after invoke completes", async () => {
      const resultEvent = JSON.stringify({ type: "result", subtype: "success", result: "ok", session_id: "s1" });
      const sm2 = makeInvokeSM(`echo '${resultEvent}'`);

      await sm2.invoke("thread-1", "/tmp", null, "msg", () => {});
      expect(sm2.activeCount).toBe(0);
      expect(sm2.activeKeys()).not.toContain("thread-1");
    });

    test("appends image paths to message when images provided", async () => {
      // Write the -p argument (the message) to a temp file, then output a result event
      const tmpFile = `/tmp/cc2im-test-msg-${Date.now()}`;
      const script = `printf '%s' "$2" > ${tmpFile}; echo '{"type":"result","subtype":"success","result":"ok","session_id":"s1"}'`;
      const sm2 = makeInvokeSM(script);

      await sm2.invoke("thread-1", "/tmp", null, "hello", () => {}, ["/path/a.png"]);
      const { readFileSync, unlinkSync } = await import("fs");
      const captured = readFileSync(tmpFile, "utf-8");
      unlinkSync(tmpFile);
      expect(captured).toContain("/path/a.png");
      expect(captured).toContain("image");
    });

    test("does not append image text when images is empty array", async () => {
      const tmpFile = `/tmp/cc2im-test-msg2-${Date.now()}`;
      const script = `printf '%s' "$2" > ${tmpFile}; echo '{"type":"result","subtype":"success","result":"ok","session_id":"s1"}'`;
      const sm2 = makeInvokeSM(script);

      await sm2.invoke("thread-1", "/tmp", null, "hello", () => {}, []);
      const { readFileSync, unlinkSync } = await import("fs");
      const captured = readFileSync(tmpFile, "utf-8");
      unlinkSync(tmpFile);
      expect(captured).not.toContain("image");
      expect(captured).toBe("hello");
    });

    test("non-zero exit code with no output rejects with stderr", async () => {
      const sm2 = makeInvokeSM(`echo "something went wrong" >&2; exit 1`);

      await expect(
        sm2.invoke("thread-1", "/tmp", null, "msg", () => {})
      ).rejects.toThrow("something went wrong");
    });
  });

  // === Test 18: abort with empty sessionId ===
  describe("abort", () => {
    test("empty sessionId returns false (guard against matching all keys)", () => {
      let killed = false;
      const active = (sm as any).active as Map<string, unknown>;
      active.set("any-key-here", { kill: () => { killed = true; } });

      const result = sm.abort("");
      expect(result).toBe(false);
      expect(killed).toBe(false);
    });
  });

  // === Test 19: abortAll called twice is idempotent ===
  describe("abortAll", () => {
    test("calling abortAll twice is idempotent (no error on second call)", () => {
      const active = (sm as any).active as Map<string, unknown>;
      active.set("t1", { pid: 1, kill: () => {} });
      active.set("t2", { pid: 2, kill: () => {} });

      sm.abortAll();
      expect(sm.activeCount).toBe(0);

      // Second call should not throw
      expect(() => sm.abortAll()).not.toThrow();
      expect(sm.activeCount).toBe(0);
    });
  });
});
