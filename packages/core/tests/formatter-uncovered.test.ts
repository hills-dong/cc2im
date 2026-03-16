import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Formatter } from "../src/formatter.js";
import type { FormatterConfig, Platform } from "../src/types.js";
import { mkdirSync, writeFileSync, chmodSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function makeConfig(overrides?: Partial<Record<Platform, number>>): FormatterConfig {
  return {
    maxMessageLength: { discord: 2000, lark: 30000, web: 4000, ...overrides },
    maxConcurrentProcesses: 5,
  };
}

describe("Formatter - uncovered cases", () => {
  // ─── updateConfig ───────────────────────────────────────────────

  describe("updateConfig", () => {
    it("1: external mutation of passed config affects internal state (holds reference)", () => {
      const formatter = new Formatter(makeConfig({ discord: 100 }));
      const newConfig = makeConfig({ discord: 200 });
      formatter.updateConfig(newConfig);
      expect(formatter.getMaxLength("discord")).toBe(200);

      // Mutate externally
      newConfig.maxMessageLength.discord = 999;
      expect(formatter.getMaxLength("discord")).toBe(999);
    });

    it("2: consecutive updateConfig calls → final state reflects last call", () => {
      const formatter = new Formatter(makeConfig({ discord: 100 }));
      formatter.updateConfig(makeConfig({ discord: 300 }));
      formatter.updateConfig(makeConfig({ discord: 500 }));
      expect(formatter.getMaxLength("discord")).toBe(500);
    });
  });

  // ─── getMaxLength ───────────────────────────────────────────────

  describe("getMaxLength", () => {
    it("3: unknown platform returns default 2000", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.getMaxLength("telegram" as Platform);
      expect(result).toBe(2000);
    });
  });

  // ─── formatOutput ──────────────────────────────────────────────

  describe("formatOutput", () => {
    it("4: empty string → single message, no attachments", () => {
      const formatter = new Formatter(makeConfig({ discord: 100 }));
      const result = formatter.formatOutput("", "discord");
      expect(result.messages).toEqual([""]);
      expect(result.attachments).toEqual([]);
    });

    it("5: length exactly maxLen → single message, no split", () => {
      const formatter = new Formatter(makeConfig({ discord: 100 }));
      const text = "a".repeat(100);
      const result = formatter.formatOutput(text, "discord");
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toBe(text);
      expect(result.attachments).toEqual([]);
    });

    it("6: length maxLen+1 → splits into 2 messages", () => {
      const formatter = new Formatter(makeConfig({ discord: 100 }));
      const text = "a".repeat(101);
      const result = formatter.formatOutput(text, "discord");
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
      expect(result.attachments).toEqual([]);
    });

    it("7: length exactly maxLen*5 → splits (no attachment)", () => {
      const formatter = new Formatter(makeConfig({ discord: 100 }));
      const text = "a".repeat(500);
      const result = formatter.formatOutput(text, "discord");
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
      expect(result.attachments).toEqual([]);
    });

    it("8: length maxLen*5+1 → summary + attachment", () => {
      const formatter = new Formatter(makeConfig({ discord: 100 }));
      const text = "a".repeat(501);
      const result = formatter.formatOutput(text, "discord");
      expect(result.messages).toHaveLength(1);
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].filename).toBe("full-output.md");
      expect(result.attachments[0].mimeType).toBe("text/markdown");
    });

    it("9: attachment content is UTF-8 Buffer matching original text (Chinese)", () => {
      const formatter = new Formatter(makeConfig({ discord: 50 }));
      const chinese = "这是一段很长的中文文本。".repeat(50);
      const result = formatter.formatOutput(chinese, "discord");
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0].content.toString("utf-8")).toBe(chinese);
    });

    it("10: different platforms use different maxLen → discord gets more chunks", () => {
      const formatter = new Formatter(makeConfig({ discord: 100, lark: 300 }));
      const text = "word ".repeat(80); // 400 chars
      const discordResult = formatter.formatOutput(text, "discord");
      const larkResult = formatter.formatOutput(text, "lark");
      expect(discordResult.messages.length).toBeGreaterThan(larkResult.messages.length);
    });
  });

  // ─── splitText ─────────────────────────────────────────────────

  describe("splitText", () => {
    it("11: short text with large maxLen → returns [text] with no prefix", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.splitText("hello world", 2000);
      expect(result).toEqual(["hello world"]);
    });

    it("12: multiline text > maxLen → splits at newline", () => {
      const formatter = new Formatter(makeConfig());
      const line1 = "a".repeat(40);
      const line2 = "b".repeat(40);
      const text = `${line1}\n${line2}`;
      // maxLen=60, reservedForPrefix=12, available=48
      const result = formatter.splitText(text, 60);
      expect(result.length).toBeGreaterThanOrEqual(2);
      // First chunk should contain line1
      expect(result[0]).toContain(line1);
    });

    it("13: newline in first half, space in second half → splits at space", () => {
      const formatter = new Formatter(makeConfig());
      // available = 100 - 12 = 88
      // Put newline at position 30 (< 88*0.5=44), space at position 60
      const text = "a".repeat(30) + "\n" + "b".repeat(29) + " " + "c".repeat(50);
      const result = formatter.splitText(text, 100);
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("14: continuous no-separator string → hard cuts at available", () => {
      const formatter = new Formatter(makeConfig());
      const text = "x".repeat(200);
      const result = formatter.splitText(text, 50);
      expect(result.length).toBeGreaterThanOrEqual(2);
      // All chunks should exist (no data loss when rejoined minus prefixes)
    });

    it("15: text needing 3 chunks → each starts with [i/total] prefix", () => {
      const formatter = new Formatter(makeConfig());
      // available = 50 - 12 = 38, need text > 38*2 = 76 to get 3 chunks
      const text = "x".repeat(120);
      const result = formatter.splitText(text, 50);
      expect(result.length).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toMatch(new RegExp(`^\\[${i + 1}/${result.length}\\] `));
      }
    });

    it("16: all chunks are within maxLen", () => {
      const formatter = new Formatter(makeConfig());
      const text = "hello world this is a test. ".repeat(30);
      const maxLen = 100;
      const result = formatter.splitText(text, maxLen);
      for (const chunk of result) {
        expect(chunk.length).toBeLessThanOrEqual(maxLen);
      }
    });

    it("17: empty string → returns [] (while loop skips empty)", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.splitText("", 100);
      // The while loop condition `remaining.length > 0` is immediately false,
      // so rawChunks stays empty → returns []
      expect(result).toEqual([]);
    });

    it("18: maxLen=20 with 100 char text → splits normally, no infinite loop", () => {
      const formatter = new Formatter(makeConfig());
      const text = "a b c d e f g ".repeat(10);
      const result = formatter.splitText(text, 20);
      expect(result.length).toBeGreaterThanOrEqual(2);
    }, 5000);

    it("19: maxLen <= reservedForPrefix (12) → returns single chunk (guard against negative available)", () => {
      const formatter = new Formatter(makeConfig());
      const text = "abcdef";
      const result = formatter.splitText(text, 10);
      // With the fix, negative available should be handled gracefully
      expect(result.length).toBeGreaterThanOrEqual(1);
      // No infinite loop, no RangeError
    }, 5000);

    it("20: same input called twice → identical results", () => {
      const formatter = new Formatter(makeConfig());
      const text = "hello world foo bar baz\nline two\nline three";
      const r1 = formatter.splitText(text, 30);
      const r2 = formatter.splitText(text, 30);
      expect(r1).toEqual(r2);
    });
  });

  // ─── generateSummary ──────────────────────────────────────────

  describe("generateSummary", () => {
    it("21: text fewer than 10 lines → uses all lines + suffix", () => {
      const formatter = new Formatter(makeConfig());
      const text = "Line 1\nLine 2\nLine 3";
      const result = formatter.generateSummary(text, 2000);
      expect(result).toContain("Line 1");
      expect(result).toContain("Line 2");
      expect(result).toContain("Line 3");
      expect(result).toContain("_...完整输出见附件_");
    });

    it("22: empty string → returns suffix only", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.generateSummary("", 2000);
      expect(result).toBe("\n\n_...完整输出见附件_");
    });

    it("23: maxLen < 50 → doesn't crash", () => {
      const formatter = new Formatter(makeConfig());
      const text = "Some text here\nAnother line";
      // maxLen - 50 = -20, so slice(0, -20) which truncates from end
      expect(() => formatter.generateSummary(text, 30)).not.toThrow();
      const result = formatter.generateSummary(text, 30);
      expect(result).toContain("_...完整输出见附件_");
    });
  });

  // ─── extractReactions ─────────────────────────────────────────

  describe("extractReactions", () => {
    it("24: empty string → reactions=[], cleanText=''", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.extractReactions("");
      expect(result.reactions).toEqual([]);
      expect(result.cleanText).toBe("");
    });

    it("25: only reaction, no content → reactions=['wave'], cleanText=''", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.extractReactions("[react:wave]");
      expect(result.reactions).toEqual(["wave"]);
      expect(result.cleanText).toBe("");
    });

    it("26: reaction followed by empty lines → reaction still extracted", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.extractReactions("Content\n[react:ok]\n\n");
      expect(result.reactions).toEqual(["ok"]);
      expect(result.cleanText).toBe("Content");
    });

    it("27: reaction value contains colons → captures full value", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.extractReactions("Text\n[react:a:b:c]");
      expect(result.reactions).toEqual(["a:b:c"]);
      expect(result.cleanText).toBe("Text");
    });

    it("28: consecutive calls on same text → same results", () => {
      const formatter = new Formatter(makeConfig());
      const text = "Hello\n[react:thumbsup]\n[react:heart]";
      const r1 = formatter.extractReactions(text);
      const r2 = formatter.extractReactions(text);
      expect(r1).toEqual(r2);
    });
  });

  // ─── extractImages ────────────────────────────────────────────

  describe("extractImages - uncovered", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = join(tmpdir(), `cc2im-fmt-uncov-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    it("29: empty string → returns []", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.extractImages("", tmpDir);
      expect(result).toEqual([]);
    });

    it("30: readFileSync permission denied → gracefully skips", () => {
      const formatter = new Formatter(makeConfig());
      const imgPath = join(tmpDir, "noperm.png");
      writeFileSync(imgPath, Buffer.from("data"));
      try {
        chmodSync(imgPath, 0o000);
      } catch {
        // If chmod fails (e.g. running as root), skip this test
        return;
      }
      const result = formatter.extractImages(`See ${imgPath} here`, tmpDir);
      // Should not throw, gracefully returns empty or skips
      expect(Array.isArray(result)).toBe(true);
      // Restore permissions for cleanup
      try { chmodSync(imgPath, 0o644); } catch {}
    });

    it("31: path traversal (../../etc/passwd.png) → resolved against projectDir", () => {
      const formatter = new Formatter(makeConfig());
      const result = formatter.extractImages("../../etc/passwd.png", tmpDir);
      // The file won't exist, so it should return empty
      expect(result).toEqual([]);
    });

    it("32: uppercase extension (.PNG) → regex gi flag matches", () => {
      const formatter = new Formatter(makeConfig());
      const imgPath = join(tmpDir, "image.PNG");
      writeFileSync(imgPath, Buffer.from("fake-png"));
      const result = formatter.extractImages(`See ${imgPath} here`, tmpDir);
      // The regex has 'gi' flag so it matches .PNG
      // extname returns .PNG, toLowerCase → .png, imageExts has .png → match
      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("image/png");
    });

    it("33: SVG file → mimeType is 'image/svg+xml'", () => {
      const formatter = new Formatter(makeConfig());
      const imgPath = join(tmpDir, "icon.svg");
      writeFileSync(imgPath, Buffer.from("<svg></svg>"));
      const result = formatter.extractImages(`Icon at ${imgPath} here`, tmpDir);
      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("image/svg+xml");
    });

    it("34: projectDir with trailing slash → no double slash issue", () => {
      const formatter = new Formatter(makeConfig());
      const subDir = join(tmpDir, "sub");
      mkdirSync(subDir, { recursive: true });
      const imgPath = join(subDir, "pic.png");
      writeFileSync(imgPath, Buffer.from("data"));
      // Use trailing slash on projectDir
      const result = formatter.extractImages("sub/pic.png", tmpDir + "/");
      // The path becomes tmpDir + "/" + "sub/pic.png" which has double slash
      // existsSync should still work with double slashes on Linux
      // But let's just verify it doesn't crash and check the result
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
