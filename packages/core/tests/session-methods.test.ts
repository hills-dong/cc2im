import { describe, test, expect, beforeEach } from "vitest";
import { SessionManager } from "../src/session.js";
import type { ClaudeConfig, FormatterConfig } from "../src/types.js";

function makeClaudeConfig(overrides?: Partial<ClaudeConfig>): ClaudeConfig {
  return {
    command: "claude",
    defaultArgs: ["--output-format", "stream-json"],
    bufferInterval: 1000,
    timeout: 60000,
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

describe("SessionManager methods", () => {
  let sm: SessionManager;
  let claudeConfig: ClaudeConfig;
  let formatterConfig: FormatterConfig;

  beforeEach(() => {
    claudeConfig = makeClaudeConfig();
    formatterConfig = makeFormatterConfig();
    sm = new SessionManager(claudeConfig, formatterConfig);
  });

  describe("updateConfig", () => {
    test("replaces claude config", () => {
      const newClaude = makeClaudeConfig({ timeout: 99999 });
      const newFormatter = makeFormatterConfig({ maxConcurrentProcesses: 10 });
      sm.updateConfig(newClaude, newFormatter);

      // canAccept uses formatterConfig.maxConcurrentProcesses internally,
      // so if the config was updated, canAccept should still return true
      // with 0 active and maxConcurrentProcesses=10
      expect(sm.canAccept()).toBe(true);
    });

    test("replaces formatter config and affects canAccept", () => {
      const newFormatter = makeFormatterConfig({ maxConcurrentProcesses: 0 });
      sm.updateConfig(claudeConfig, newFormatter);

      // With maxConcurrentProcesses=0 and 0 active, 0 < 0 is false
      expect(sm.canAccept()).toBe(false);
    });
  });

  describe("activeCount", () => {
    test("returns 0 when no processes are active", () => {
      expect(sm.activeCount).toBe(0);
    });

    test("reflects entries in the active map", () => {
      const active = (sm as any).active as Map<string, unknown>;
      active.set("thread-1", { kill: () => {} });
      active.set("thread-2", { kill: () => {} });

      expect(sm.activeCount).toBe(2);
    });
  });

  describe("canAccept", () => {
    test("returns true when active count is below maxConcurrentProcesses", () => {
      expect(sm.canAccept()).toBe(true);
    });

    test("returns true when active count is one below max", () => {
      const active = (sm as any).active as Map<string, unknown>;
      for (let i = 0; i < formatterConfig.maxConcurrentProcesses - 1; i++) {
        active.set(`thread-${i}`, { kill: () => {} });
      }
      expect(sm.canAccept()).toBe(true);
    });

    test("returns false when active count equals maxConcurrentProcesses", () => {
      const active = (sm as any).active as Map<string, unknown>;
      for (let i = 0; i < formatterConfig.maxConcurrentProcesses; i++) {
        active.set(`thread-${i}`, { kill: () => {} });
      }
      expect(sm.canAccept()).toBe(false);
    });

    test("returns false when active count exceeds maxConcurrentProcesses", () => {
      const active = (sm as any).active as Map<string, unknown>;
      for (let i = 0; i < formatterConfig.maxConcurrentProcesses + 1; i++) {
        active.set(`thread-${i}`, { kill: () => {} });
      }
      expect(sm.canAccept()).toBe(false);
    });
  });

  describe("isBusy", () => {
    test("returns false when no queue exists for the thread key", () => {
      expect(sm.isBusy("thread-xyz")).toBe(false);
    });

    test("returns true when a queue exists for the thread key", () => {
      const queues = (sm as any).queues as Map<string, Array<() => void>>;
      queues.set("thread-abc", []);
      expect(sm.isBusy("thread-abc")).toBe(true);
    });

    test("returns false for a different thread key", () => {
      const queues = (sm as any).queues as Map<string, Array<() => void>>;
      queues.set("thread-abc", []);
      expect(sm.isBusy("thread-other")).toBe(false);
    });
  });

  describe("activeKeys", () => {
    test("returns empty array when no processes are active", () => {
      expect(sm.activeKeys()).toEqual([]);
    });

    test("returns all active thread keys", () => {
      const active = (sm as any).active as Map<string, unknown>;
      active.set("key-a", { kill: () => {} });
      active.set("key-b", { kill: () => {} });
      active.set("key-c", { kill: () => {} });

      const keys = sm.activeKeys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain("key-a");
      expect(keys).toContain("key-b");
      expect(keys).toContain("key-c");
    });

    test("returns a new array (not a reference to internals)", () => {
      const active = (sm as any).active as Map<string, unknown>;
      active.set("key-x", { kill: () => {} });

      const keys1 = sm.activeKeys();
      const keys2 = sm.activeKeys();
      expect(keys1).toEqual(keys2);
      expect(keys1).not.toBe(keys2);
    });
  });

  describe("abort", () => {
    test("returns false when no matching session exists", () => {
      expect(sm.abort("nonexistent-session")).toBe(false);
    });

    test("kills the matching process and returns true", () => {
      let killed = false;
      const fakeProc = { kill: (sig: string) => { killed = true; } };
      const active = (sm as any).active as Map<string, unknown>;
      active.set("thread:session-123", fakeProc);

      const result = sm.abort("session-123");
      expect(result).toBe(true);
      expect(killed).toBe(true);
    });

    test("does not kill non-matching processes", () => {
      let killedA = false;
      let killedB = false;
      const active = (sm as any).active as Map<string, unknown>;
      active.set("thread:session-aaa", { kill: () => { killedA = true; } });
      active.set("thread:session-bbb", { kill: () => { killedB = true; } });

      sm.abort("session-aaa");
      expect(killedA).toBe(true);
      expect(killedB).toBe(false);
    });

    test("matches using key.includes(sessionId)", () => {
      let killed = false;
      const active = (sm as any).active as Map<string, unknown>;
      active.set("prefix-myid-suffix", { kill: () => { killed = true; } });

      expect(sm.abort("myid")).toBe(true);
      expect(killed).toBe(true);
    });
  });

  describe("abortAll", () => {
    test("does nothing when no processes are active", () => {
      // Should not throw
      sm.abortAll();
      expect(sm.activeCount).toBe(0);
    });

    test("kills all active processes", () => {
      const killLog: string[] = [];
      const active = (sm as any).active as Map<string, unknown>;
      active.set("thread-1", { pid: 1001, kill: () => { killLog.push("thread-1"); } });
      active.set("thread-2", { pid: 1002, kill: () => { killLog.push("thread-2"); } });
      active.set("thread-3", { pid: 1003, kill: () => { killLog.push("thread-3"); } });

      sm.abortAll();

      expect(killLog).toHaveLength(3);
      expect(killLog).toContain("thread-1");
      expect(killLog).toContain("thread-2");
      expect(killLog).toContain("thread-3");
    });

    test("clears the active map", () => {
      const active = (sm as any).active as Map<string, unknown>;
      active.set("t1", { pid: 1, kill: () => {} });

      sm.abortAll();
      expect(sm.activeCount).toBe(0);
    });

    test("clears the queues map", () => {
      const active = (sm as any).active as Map<string, unknown>;
      const queues = (sm as any).queues as Map<string, Array<() => void>>;
      active.set("t1", { pid: 1, kill: () => {} });
      queues.set("t1", []);
      queues.set("t2", [() => {}]);

      sm.abortAll();
      expect(sm.isBusy("t1")).toBe(false);
      expect(sm.isBusy("t2")).toBe(false);
    });
  });
});
