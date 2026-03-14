import { describe, it, expect } from "vitest";
import { Formatter } from "../src/formatter.js";
import type { Platform } from "../src/types.js";

const formatter = new Formatter({
  maxMessageLength: { discord: 100, lark: 300 },
  maxConcurrentProcesses: 5,
});

describe("Formatter", () => {
  it("passes short messages through unchanged", () => {
    const result = formatter.formatOutput("Hello world", "discord");
    expect(result.messages).toEqual(["Hello world"]);
    expect(result.attachments).toHaveLength(0);
  });

  it("splits long messages for discord", () => {
    const long = "a".repeat(150);
    const result = formatter.formatOutput(long, "discord");
    expect(result.messages.length).toBeGreaterThan(1);
    for (const msg of result.messages) {
      expect(msg.length).toBeLessThanOrEqual(100);
    }
  });

  it("uses summary + attachment when output is very long", () => {
    const veryLong = "Line of code\n".repeat(200);
    const result = formatter.formatOutput(veryLong, "discord");
    expect(result.attachments.length).toBeGreaterThan(0);
  });

  it("parses reaction from end of output", () => {
    const text = "Here is my response\n[react:👍]";
    const result = formatter.extractReactions(text);
    expect(result.reactions).toEqual(["👍"]);
    expect(result.cleanText).toBe("Here is my response");
  });

  it("does not parse reaction from middle of output", () => {
    const text = "Some [react:👍] in the middle\nMore text";
    const result = formatter.extractReactions(text);
    expect(result.reactions).toHaveLength(0);
    expect(result.cleanText).toBe(text);
  });

  it("handles multiple reactions", () => {
    const text = "Done!\n[react:✅]\n[react:🎉]";
    const result = formatter.extractReactions(text);
    expect(result.reactions).toEqual(["✅", "🎉"]);
    expect(result.cleanText).toBe("Done!");
  });
});
