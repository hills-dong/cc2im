import { describe, test, expect } from "vitest";
import { Formatter } from "../src/formatter.js";
import type { FormatterConfig } from "../src/types.js";

describe("Formatter.updateConfig", () => {
  test("updates internal config so getMaxLength returns new values", () => {
    const initial: FormatterConfig = {
      maxMessageLength: { discord: 2000, lark: 4000, web: 5000 },
      maxConcurrentProcesses: 3,
    };
    const formatter = new Formatter(initial);
    expect(formatter.getMaxLength("discord")).toBe(2000);

    const updated: FormatterConfig = {
      maxMessageLength: { discord: 3000, lark: 6000, web: 8000 },
      maxConcurrentProcesses: 5,
    };
    formatter.updateConfig(updated);

    expect(formatter.getMaxLength("discord")).toBe(3000);
    expect(formatter.getMaxLength("lark")).toBe(6000);
    expect(formatter.getMaxLength("web")).toBe(8000);
  });
});

describe("Formatter.getMaxLength", () => {
  test("returns configured max length for each platform", () => {
    const formatter = new Formatter({
      maxMessageLength: { discord: 1500, lark: 30000, web: 10000 },
      maxConcurrentProcesses: 1,
    });
    expect(formatter.getMaxLength("discord")).toBe(1500);
    expect(formatter.getMaxLength("lark")).toBe(30000);
    expect(formatter.getMaxLength("web")).toBe(10000);
  });

  test("falls back to 2000 when platform is not configured", () => {
    const formatter = new Formatter({
      maxMessageLength: {} as FormatterConfig["maxMessageLength"],
      maxConcurrentProcesses: 1,
    });
    expect(formatter.getMaxLength("discord")).toBe(2000);
    expect(formatter.getMaxLength("lark")).toBe(2000);
    expect(formatter.getMaxLength("web")).toBe(2000);
  });
});

describe("Formatter.generateSummary", () => {
  test("takes first 10 lines and appends Chinese suffix", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
    const text = lines.join("\n");
    const formatter = new Formatter({
      maxMessageLength: { discord: 2000, lark: 2000, web: 2000 },
      maxConcurrentProcesses: 1,
    });

    const result = formatter.generateSummary(text, 2000);
    const expectedPrefix = lines.slice(0, 10).join("\n");
    expect(result).toBe(expectedPrefix + "\n\n_...完整输出见附件_");
  });

  test("truncates to maxLen-50 when first 10 lines exceed that", () => {
    const longLine = "x".repeat(200);
    const lines = Array.from({ length: 10 }, () => longLine);
    const text = lines.join("\n");
    const maxLen = 500;
    const formatter = new Formatter({
      maxMessageLength: { discord: maxLen, lark: maxLen, web: maxLen },
      maxConcurrentProcesses: 1,
    });

    const result = formatter.generateSummary(text, maxLen);
    const suffix = "\n\n_...完整输出见附件_";
    const bodyLength = result.length - suffix.length;
    expect(bodyLength).toBeLessThanOrEqual(maxLen - 50);
    expect(result).toContain("...完整输出见附件");
  });

  test("does not truncate when first 10 lines fit within maxLen-50", () => {
    const lines = Array.from({ length: 5 }, (_, i) => `Short ${i}`);
    const text = lines.join("\n");
    const formatter = new Formatter({
      maxMessageLength: { discord: 2000, lark: 2000, web: 2000 },
      maxConcurrentProcesses: 1,
    });

    const result = formatter.generateSummary(text, 2000);
    expect(result).toBe(text + "\n\n_...完整输出见附件_");
  });
});
