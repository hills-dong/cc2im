import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "../src/session.js";
import type { ClaudeConfig, FormatterConfig } from "../src/types.js";

const mockClaudeConfig: ClaudeConfig = {
  command: "echo",
  defaultArgs: [],
  bufferInterval: 100,
  timeout: 5000,
};

const mockFormatterConfig: FormatterConfig = {
  maxMessageLength: { discord: 2000, lark: 30000 },
  maxConcurrentProcesses: 2,
};

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(mockClaudeConfig, mockFormatterConfig);
  });

  it("tracks active process count", () => {
    expect(manager.activeCount).toBe(0);
  });

  it("rejects when concurrency limit reached", async () => {
    const smallManager = new SessionManager(mockClaudeConfig, {
      ...mockFormatterConfig,
      maxConcurrentProcesses: 0,
    });
    const result = smallManager.canAccept();
    expect(result).toBe(false);
  });

  it("parses stream-json init event to extract session_id", () => {
    const line = '{"type":"system","subtype":"init","session_id":"abc-123","cwd":"/tmp"}';
    const event = manager.parseLine(line);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("system");
    if (event!.type === "system" && "subtype" in event! && event!.subtype === "init") {
      expect((event as any).session_id).toBe("abc-123");
    }
  });

  it("parses assistant text event", () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello!"}]}}';
    const event = manager.parseLine(line);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("assistant");
  });

  it("returns null for invalid JSON", () => {
    const event = manager.parseLine("not json");
    expect(event).toBeNull();
  });

  it("buildArgs returns defaultArgs unchanged when no model override", () => {
    const manager = new SessionManager(
      { ...mockClaudeConfig, defaultArgs: ["--output-format", "stream-json", "--model", "claude-haiku-4-5-20251001"] },
      mockFormatterConfig,
    );
    const args = manager.buildArgs(null, undefined);
    expect(args).toEqual(["--output-format", "stream-json", "--model", "claude-haiku-4-5-20251001"]);
  });

  it("buildArgs overrides --model in defaultArgs when model is provided", () => {
    const manager = new SessionManager(
      { ...mockClaudeConfig, defaultArgs: ["--output-format", "stream-json", "--model", "claude-haiku-4-5-20251001"] },
      mockFormatterConfig,
    );
    const args = manager.buildArgs(null, "claude-opus-4-6");
    expect(args).toContain("--model");
    expect(args).toContain("claude-opus-4-6");
    expect(args).not.toContain("claude-haiku-4-5-20251001");
    expect(args.filter(a => a === "--model")).toHaveLength(1);
  });

  it("buildArgs appends --model when defaultArgs has no existing --model", () => {
    const manager = new SessionManager(
      { ...mockClaudeConfig, defaultArgs: ["--output-format", "stream-json"] },
      mockFormatterConfig,
    );
    const args = manager.buildArgs(null, "claude-opus-4-6");
    expect(args).toEqual(["--output-format", "stream-json", "--model", "claude-opus-4-6"]);
  });

  it("buildArgs includes --resume when sessionId is provided", () => {
    const manager = new SessionManager(mockClaudeConfig, mockFormatterConfig);
    const args = manager.buildArgs("session-abc", undefined);
    expect(args).toContain("--resume");
    expect(args).toContain("session-abc");
  });
});
