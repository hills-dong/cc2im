import { spawn, type ChildProcess } from "child_process";
import { createInterface } from "readline";
import type { ClaudeConfig, FormatterConfig, StreamEvent } from "./types.js";

export interface SessionResult {
  sessionId: string;
  text: string;
  success: boolean;
}

type StreamCallback = (event: StreamEvent) => void;

export class SessionManager {
  private active = new Map<string, ChildProcess>();
  private queues = new Map<string, Array<() => void>>();

  constructor(
    private claudeConfig: ClaudeConfig,
    private formatterConfig: FormatterConfig,
  ) {}

  get activeCount(): number {
    return this.active.size;
  }

  canAccept(): boolean {
    return this.active.size < this.formatterConfig.maxConcurrentProcesses;
  }

  parseLine(line: string): StreamEvent | null {
    try {
      return JSON.parse(line) as StreamEvent;
    } catch {
      return null;
    }
  }

  async invoke(
    threadKey: string,
    projectDir: string,
    sessionId: string | null,
    message: string,
    onEvent: StreamCallback,
  ): Promise<SessionResult> {
    // Queue if a process is already running for this thread
    if (this.queues.has(threadKey)) {
      await new Promise<void>(resolve => {
        const queue = this.queues.get(threadKey)!;
        queue.push(resolve);
      });
    }
    this.queues.set(threadKey, []);

    // Wait for concurrency slot
    while (!this.canAccept()) {
      await new Promise(r => setTimeout(r, 500));
    }

    const args = [...this.claudeConfig.defaultArgs];
    if (sessionId) {
      args.push("--resume", sessionId);
    }
    args.push("-p", message);

    return new Promise<SessionResult>((resolve, reject) => {
      let timedOut = false;

      const proc = spawn(this.claudeConfig.command, args, {
        cwd: projectDir,
        env: { ...process.env, CLAUDECODE: undefined },
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.active.set(threadKey, proc);

      let resultSessionId = sessionId ?? "";
      let fullText = "";
      let success = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
      }, this.claudeConfig.timeout);

      const rl = createInterface({ input: proc.stdout! });

      rl.on("line", (line) => {
        const event = this.parseLine(line);
        if (!event) return;

        if (event.type === "system" && "subtype" in event && event.subtype === "init") {
          resultSessionId = (event as any).session_id;
        }

        if (event.type === "assistant" && "message" in event) {
          const msg = (event as any).message;
          if (msg?.content) {
            for (const block of msg.content) {
              if (block.type === "text" && block.text) {
                fullText += block.text;
              }
            }
          }
        }

        if (event.type === "result") {
          success = (event as any).subtype === "success";
          if ((event as any).result) {
            fullText = (event as any).result;
          }
        }

        onEvent(event);
      });

      proc.on("close", (code) => {
        clearTimeout(timeout);
        this.active.delete(threadKey);

        const queue = this.queues.get(threadKey);
        if (queue && queue.length > 0) {
          const next = queue.shift()!;
          next();
        } else {
          this.queues.delete(threadKey);
        }

        if (timedOut) {
          reject(new Error(`Claude Code timed out after ${this.claudeConfig.timeout}ms`));
        } else {
          resolve({
            sessionId: resultSessionId,
            text: fullText,
            success: success || code === 0,
          });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        this.active.delete(threadKey);
        this.queues.delete(threadKey);
        reject(err);
      });
    });
  }

  abort(sessionId: string): boolean {
    for (const [key, proc] of this.active) {
      if (key.includes(sessionId)) {
        proc.kill("SIGTERM");
        return true;
      }
    }
    return false;
  }
}
