import { readFileSync, existsSync } from "fs";
import { basename, extname } from "path";
import type { Attachment, FormatterConfig, Platform } from "./types.js";

interface FormatResult {
  messages: string[];
  attachments: Attachment[];
}

interface ReactionResult {
  cleanText: string;
  reactions: string[];
}

export class Formatter {
  constructor(private config: FormatterConfig) {}

  updateConfig(config: FormatterConfig): void {
    this.config = config;
  }

  getMaxLength(platform: Platform): number {
    return this.config.maxMessageLength[platform] ?? 2000;
  }

  formatOutput(text: string, platform: Platform): FormatResult {
    const maxLen = this.getMaxLength(platform);

    if (text.length <= maxLen) {
      return { messages: [text], attachments: [] };
    }

    if (text.length <= maxLen * 5) {
      return { messages: this.splitText(text, maxLen), attachments: [] };
    }

    const summary = this.generateSummary(text, maxLen);
    const attachment: Attachment = {
      filename: "full-output.md",
      content: Buffer.from(text, "utf-8"),
      mimeType: "text/markdown",
    };

    return {
      messages: [summary],
      attachments: [attachment],
    };
  }

  splitText(text: string, maxLen: number): string[] {
    const rawChunks: string[] = [];
    let remaining = text;
    const reservedForPrefix = 12;

    while (remaining.length > 0) {
      const available = Math.max(1, maxLen - reservedForPrefix);

      if (remaining.length <= available) {
        rawChunks.push(remaining);
        break;
      }

      let splitAt = remaining.lastIndexOf("\n", available);
      if (splitAt < available * 0.5) {
        splitAt = remaining.lastIndexOf(" ", available);
      }
      if (splitAt < available * 0.3) {
        splitAt = available;
      }

      rawChunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    const total = rawChunks.length;
    if (total === 1) return rawChunks;
    return rawChunks.map((chunk, i) => `[${i + 1}/${total}] ${chunk}`);
  }

  generateSummary(text: string, maxLen: number): string {
    const lines = text.split("\n").slice(0, 10);
    let summary = lines.join("\n");
    if (summary.length > maxLen - 50) {
      summary = summary.slice(0, maxLen - 50);
    }
    return summary + "\n\n_...完整输出见附件_";
  }

  extractReactions(text: string): ReactionResult {
    const reactions: string[] = [];
    // Extract all [react:emoji] patterns from the end of text (standalone lines or inline at line end)
    let cleaned = text;
    const inlinePattern = /\s*\[react:(.+?)\]\s*$/;
    // Repeatedly strip [react:...] from the end
    let match: RegExpMatchArray | null;
    while ((match = cleaned.match(inlinePattern)) !== null) {
      reactions.unshift(match[1]);
      cleaned = cleaned.slice(0, match.index!).trimEnd();
    }

    return { cleanText: cleaned, reactions };
  }

  /** Extract image file paths from text and return them as attachments */
  extractImages(text: string, projectDir: string): Attachment[] {
    const imageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
    const attachments: Attachment[] = [];
    const seen = new Set<string>();

    // Match absolute paths or relative paths that look like image files
    const pathPattern = /(?:^|\s|`)((?:\/[\w./-]+|[\w./-]+)\.(?:png|jpg|jpeg|gif|webp|bmp|svg))\b/gi;
    let match;
    while ((match = pathPattern.exec(text)) !== null) {
      let filePath = match[1];
      // Resolve relative paths against project dir
      if (!filePath.startsWith("/")) {
        filePath = `${projectDir}/${filePath}`;
      }
      if (seen.has(filePath)) continue;
      seen.add(filePath);

      if (existsSync(filePath)) {
        const ext = extname(filePath).toLowerCase();
        if (imageExts.has(ext)) {
          try {
            const content = readFileSync(filePath);
            attachments.push({
              filename: basename(filePath),
              content,
              mimeType: `image/${ext.slice(1) === "jpg" ? "jpeg" : ext.slice(1) === "svg" ? "svg+xml" : ext.slice(1)}`,
            });
          } catch {}
        }
      }
    }
    return attachments;
  }
}
