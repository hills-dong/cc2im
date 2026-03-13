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
      const available = maxLen - reservedForPrefix;

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
    const lines = text.split("\n");
    const reactions: string[] = [];
    const reactionPattern = /^\[react:(.+)\]$/;

    let lastContentLine = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed === "") continue;
      const match = trimmed.match(reactionPattern);
      if (match) {
        reactions.unshift(match[1]);
        lastContentLine = i;
      } else {
        break;
      }
    }

    const cleanText = lines.slice(0, lastContentLine).join("\n").trimEnd();
    return { cleanText, reactions };
  }
}
