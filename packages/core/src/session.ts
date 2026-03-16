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

  updateConfig(claudeConfig: ClaudeConfig, formatterConfig: FormatterConfig): void {
    this.claudeConfig = claudeConfig;
    this.formatterConfig = formatterConfig;
  }

  get activeCount(): number {
    return this.active.size;
  }

  canAccept(): boolean {
    return this.active.size < this.formatterConfig.maxConcurrentProcesses;
  }

  isBusy(threadKey: string): boolean {
    return this.queues.has(threadKey);
  }

  activeKeys(): string[] {
    return [...this.active.keys()];
  }

  parseLine(line: string): StreamEvent | null {
    try {
      return JSON.parse(line) as StreamEvent;
    } catch {
      return null;
    }
  }

  buildArgs(sessionId: string | null, model?: string): string[] {
    const args = [...this.claudeConfig.defaultArgs];
    if (model) {
      const idx = args.indexOf("--model");
      if (idx !== -1) args.splice(idx, 2);
      args.push("--model", model);
    }
    if (sessionId) {
      args.push("--resume", sessionId);
    }
    return args;
  }

  async invoke(
    threadKey: string,
    projectDir: string,
    sessionId: string | null,
    message: string,
    onEvent: StreamCallback,
    images?: string[],
    onStart?: () => void,
    model?: string,
  ): Promise<SessionResult> {
    // Queue if a process is already running for this thread
    if (this.queues.has(threadKey)) {
      await new Promise<void>(resolve => {
        const queue = this.queues.get(threadKey)!;
        queue.push(resolve);
      });
    }
    // Only create a new queue if one doesn't exist (another waiter may have created it)
    if (!this.queues.has(threadKey)) {
      this.queues.set(threadKey, []);
    }

    // Wait for concurrency slot
    while (!this.canAccept()) {
      await new Promise(r => setTimeout(r, 500));
    }

    // Notify caller that actual processing is starting
    onStart?.();

    const args = this.buildArgs(sessionId, model);
    // Build prompt: append image file paths so Claude Code can read them
    let fullMessage = message;
    if (images && images.length > 0) {
      const imageList = images.map(p => `- ${p}`).join("\n");
      fullMessage += `\n\n[User attached ${images.length} image(s). Read them with the Read tool:\n${imageList}\n]`;
    }
    args.push("-p", fullMessage);

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
      let stderrText = "";
      let success = false;

      const resetTimeout = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          timedOut = true;
          proc.kill("SIGTERM");
        }, this.claudeConfig.timeout);
      };
      let idleTimer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
      }, this.claudeConfig.timeout);

      proc.stderr!.on("data", (chunk: Buffer) => {
        stderrText += chunk.toString();
        resetTimeout();
      });

      const rl = createInterface({ input: proc.stdout! });

      rl.on("line", (line) => {
        resetTimeout();
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
        clearTimeout(idleTimer);
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
        } else if (code !== 0 && !fullText) {
          reject(new Error(stderrText.trim() || `Claude Code exited with code ${code}`));
        } else {
          resolve({
            sessionId: resultSessionId,
            text: fullText,
            success: success || code === 0,
          });
        }
      });

      proc.on("error", (err) => {
        clearTimeout(idleTimer);
        this.active.delete(threadKey);

        // Process queue so pending callers aren't stuck forever
        const queue = this.queues.get(threadKey);
        if (queue && queue.length > 0) {
          const next = queue.shift()!;
          next();
        } else {
          this.queues.delete(threadKey);
        }

        reject(err);
      });
    });
  }

  abort(sessionId: string): boolean {
    if (!sessionId) return false;
    for (const [key, proc] of this.active) {
      if (key.includes(sessionId)) {
        proc.kill("SIGTERM");
        return true;
      }
    }
    return false;
  }

  abortAll(): void {
    for (const [key, proc] of this.active) {
      console.log(`Killing claude process for ${key} (PID ${proc.pid})...`);
      proc.kill("SIGTERM");
    }
    this.active.clear();
    this.queues.clear();
  }
}
