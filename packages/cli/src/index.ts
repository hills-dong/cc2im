import {
  loadConfig, saveConfig, addProject, removeProject,
  Store, THREAD_STATUS_ICONS, type ThreadStatus,
  SessionManager, Formatter, Router,
  type PlatformAdapter, type IncomingMessage, type Reaction,
} from "@cc2im/core";
import { DiscordAdapter } from "./adapters/discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { resolve, join, dirname } from "path";
import { resolveConfigPath } from "./service.js";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { execFile } from "child_process";

// AskUserQuestion interception types
interface AskQuestion {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
}

interface PendingAsk {
  questions: AskQuestion[];
  sessionId: string;
  channelId: string;
  threadId: string;
  resolve: (answer: string) => void;
}

// Thread key → pending AskUserQuestion waiting for user reply
const pendingAsks = new Map<string, PendingAsk>();

/**
 * Format AskUserQuestion questions as a Discord-friendly message.
 */
function formatAskQuestions(questions: AskQuestion[]): string {
  const NUM_EMOJI = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
  const OPT_LETTERS = ["A", "B", "C", "D"];
  const lines: string[] = [];

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const num = NUM_EMOJI[qi] ?? `**${qi + 1}.**`;
    lines.push(`${num} **${q.header}**`);
    lines.push(q.question);
    for (let oi = 0; oi < q.options.length; oi++) {
      const opt = q.options[oi];
      lines.push(`> ${OPT_LETTERS[oi]}. **${opt.label}** — ${opt.description}`);
    }
    lines.push("");
  }

  if (questions.length > 1) {
    lines.push(`_回复字母组合即可，如 \`${"A".repeat(questions.length)}\`_`);
  } else {
    lines.push(`_回复字母即可，如 \`A\`_`);
  }

  return lines.join("\n");
}

/**
 * Parse user's answer to AskUserQuestion.
 * Accepts letter combos like "BABB" or "B, A, B, B" or full option text.
 */
function parseAskAnswer(answer: string, questions: AskQuestion[]): string {
  const OPT_LETTERS = ["A", "B", "C", "D"];
  // Try to parse as letter combo
  const letters = answer.toUpperCase().replace(/[\s,.\-/|]+/g, "");
  const results: string[] = [];

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi];
    const letter = letters[qi];
    const idx = letter ? OPT_LETTERS.indexOf(letter) : -1;
    if (idx >= 0 && idx < q.options.length) {
      results.push(`${q.header}: ${q.options[idx].label}`);
    } else {
      // Fallback: use the raw answer for this question
      results.push(`${q.header}: ${answer}`);
    }
  }

  return results.join("\n");
}

let CONFIG_PATH = "";

export interface MainOptions {
  webPort?: number;
  webBind?: string;
  configPath?: string;
}

export async function main(options?: MainOptions) {
  console.log("cc2im starting...");

  CONFIG_PATH = resolveConfigPath(options?.configPath ?? process.env.CC2IM_CONFIG);
  const dbPath = resolve(process.env.CC2IM_DB ?? join(dirname(CONFIG_PATH), "cc2im.db"));

  let config = loadConfig(CONFIG_PATH);
  const store = new Store(dbPath);
  const sessionManager = new SessionManager(config.claude, config.formatter);
  const formatter = new Formatter(config.formatter);
  const router = new Router(config, store);

  const adapters: PlatformAdapter[] = [];

  // Initialize Discord adapter if configured
  if (config.discord.token) {
    const discord = new DiscordAdapter(config.discord.token);
    adapters.push(discord);
  }

  // Initialize Web adapter if web port is configured
  let webAdapter: import("./adapters/web.js").WebAdapter | null = null;
  if (options?.webPort) {
    const { WebAdapter } = await import("./adapters/web.js");
    webAdapter = new WebAdapter({
      port: options.webPort,
      bind: options.webBind ?? "0.0.0.0",
      configPath: CONFIG_PATH,
      store,
      config,
    });
    adapters.push(webAdapter);
  }

  // Start all adapters
  for (const adapter of adapters) {
    await adapter.start();

    // Setup project channels — web adapter registers all projects
    for (const project of config.projects) {
      if (adapter.platform !== "web" && !project.platforms[adapter.platform]) continue;
      const channelInfo = await adapter.setupProject(project);
      router.registerChannel(channelInfo.channelId, adapter.platform, project.name);
      console.log(`Registered ${adapter.platform} channel ${channelInfo.channelId} → ${project.name}`);
    }

    // Handle incoming messages
    if (adapter.platform === "web" && webAdapter) {
      // Web adapter: wrap handleMessage with done/error signaling
      const wa = webAdapter;
      adapter.onMessage(async (msg) => {
        const threadId = msg.threadId ?? msg.channelId;
        const project = router.getProject(msg.channelId, msg.platform);
        try {
          await handleMessage(msg, adapter, router, sessionManager, formatter, store, config);
          const tokens = store.getSessionTokens(threadId);
          wa.sendDone(threadId, tokens);
        } catch (err) {
          console.error("Error handling web message:", err);
          wa.sendError(threadId, err instanceof Error ? err.message : String(err));
        }
        // Notify sidebar of new/updated session
        const thread = store.getThread(threadId, "web");
        wa.sendSessionUpdate(project?.name ?? "", threadId, thread?.name ?? "");
      });
    } else {
      adapter.onMessage(async (msg) => {
        try {
          await handleMessage(msg, adapter, router, sessionManager, formatter, store, config);
        } catch (err) {
          console.error("Error handling message:", err);
        }
      });
    }

    // Handle reactions
    adapter.onReaction(async (reaction) => {
      try {
        await handleReaction(reaction, adapter, router, sessionManager, formatter, store, config);
      } catch (err) {
        console.error("Error handling reaction:", err);
      }
    });

    // Handle slash commands (Discord only)
    if (adapter instanceof DiscordAdapter) {
      adapter.onSlashCommand(async (interaction) => {
        try {
          await handleSlashCommand(interaction, adapter, router, store, config, sessionManager, formatter);
        } catch (err) {
          console.error("Error handling slash command:", err);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ ${err instanceof Error ? err.message : String(err)}`, flags: 64 }).catch(() => {});
          }
        }
      });
    }
  }

  if (adapters.length === 0) {
    console.error("No platform adapters configured. Set at least one platform token or --port.");
    process.exit(1);
  }

  console.log("cc2im ready.");

  // Process pending restarts from previous shutdown
  const pendingRestarts = store.getPendingRestarts();
  if (pendingRestarts.length > 0) {
    console.log(`Recovering ${pendingRestarts.length} pending restart(s)...`);
    store.clearPendingRestarts();

    for (const thread of pendingRestarts) {
      const adapter = adapters.find(a => a.platform === thread.platform);
      const project = config.projects.find(p => p.name === thread.project_name);
      if (!adapter || !project) continue;

      const threadKey = `${thread.platform}:${thread.thread_id}`;
      console.log(`Resuming session ${thread.session_id} in thread ${thread.thread_id}...`);

      // Resume session in background — don't block startup
      sessionManager.invoke(
        threadKey,
        project.directory,
        thread.session_id,
        "cc2im 服务已重启完成，请简短告知用户重启成功并继续之前的工作。",
        () => {},
        undefined,
        undefined,
        project.model,
      ).then(async (result) => {
        store.upsertThread(thread.thread_id, thread.platform as any, thread.channel_id, result.sessionId, thread.project_name);
        const { cleanText } = formatter.extractReactions(result.text);
        const formatted = formatter.formatOutput(cleanText, thread.platform as any);
        for (const msg of formatted.messages) {
          await adapter.sendMessage(thread.channel_id, thread.thread_id, msg);
        }
        console.log(`Resumed thread ${thread.thread_id} successfully.`);
      }).catch((err) => {
        console.error(`Failed to resume thread ${thread.thread_id}:`, err);
      });
    }
  }

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Shutting down (${signal})...`);

    // Save active threads for post-restart recovery
    for (const threadKey of sessionManager.activeKeys()) {
      const [platform, threadId] = threadKey.split(":", 2);
      if (platform && threadId) {
        store.markPendingRestart(threadId, platform as any);
        console.log(`Marked pending restart: ${threadKey}`);
      }
    }

    sessionManager.abortAll();
    for (const adapter of adapters) {
      await adapter.stop();
    }
    store.close();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function handleMessage(
  msg: IncomingMessage,
  adapter: PlatformAdapter,
  router: Router,
  sessionManager: SessionManager,
  formatter: Formatter,
  store: Store,
  config: ReturnType<typeof loadConfig>,
) {
  // Check if this is an answer to a pending AskUserQuestion
  const askKey = `${msg.platform}:${msg.threadId ?? msg.channelId}`;
  const pending = pendingAsks.get(askKey);
  if (pending) {
    pendingAsks.delete(askKey);
    const parsed = parseAskAnswer(msg.content, pending.questions);
    pending.resolve(parsed);
    return;
  }

  // Check for management commands
  if (router.isManagementCommand(msg.content)) {
    await handleManagementCommand(msg, adapter, router, store, config, sessionManager, formatter);
    return;
  }

  // Find project for this channel
  const project = router.getProject(msg.channelId, msg.platform);
  if (!project) return; // Not a registered channel

  // Create thread if this is a top-level message
  let threadId = msg.threadId;
  if (!threadId) {
    threadId = await adapter.createThread(msg.channelId, msg.messageId);
    // Immediately rename with truncated user message as fallback title
    const fallbackTitle = msg.content.replace(/\n/g, " ").slice(0, 30) || "New conversation";
    const tid = threadId;
    adapter.renameThread(tid, `${THREAD_STATUS_ICONS.active} ${fallbackTitle}`).catch((err) => {
      console.error(`[thread-title] Failed to set fallback title:`, err);
    });
    // Then async try to generate a better title via Claude
    generateThreadTitle(msg.content, config.claude.command).then(
      (title) => {
        console.log(`[thread-title] Generated title: "${title}" for thread ${tid}`);
        adapter.renameThread(tid, `${THREAD_STATUS_ICONS.active} ${title}`).catch((err) => {
          console.error(`[thread-title] Failed to set model title for thread ${tid}:`, err);
        });
      },
      (err) => {
        console.error(`[thread-title] Claude title generation failed (fallback already applied):`, err);
      },
    );
  }

  // Save user message to database (Web needs this for persistence; harmless for Discord)
  store.saveMessage(msg.messageId, msg.platform, threadId, false, msg.content.slice(0, 200));

  // Create thread record immediately so the sidebar shows it while Claude is thinking
  const threadName = msg.platform === "web"
    ? msg.content.replace(/\n/g, " ").slice(0, 50) || "New conversation"
    : msg.userName;
  const existingThread = store.getThread(threadId, msg.platform);
  if (!existingThread) {
    store.upsertThread(threadId, msg.platform, msg.channelId, "", project.name, threadName);
  }

  // Get existing session for this thread
  const existingSessionId = existingThread?.session_id || null;

  // Send initial indicator: "queued" if thread is busy, "thinking" otherwise
  const threadKey = `${msg.platform}:${threadId}`;
  const isBusy = sessionManager.isBusy(threadKey);
  const initialText = isBusy ? "⏳ _请稍等，有任务正在执行中..._" : "⏳ _Thinking..._";
  const currentMessageId = await adapter.sendMessage(msg.channelId, threadId, initialText);
  store.saveMessage(currentMessageId, msg.platform, threadId, true, isBusy ? "queued" : "thinking...");

  // Save image attachments to temp files for Claude Code
  const imageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
  const imageMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/svg+xml"]);
  let tempDir: string | null = null;
  const imagePaths: string[] = [];

  const imageAttachments = msg.attachments.filter(a =>
    (a.mimeType && imageMimeTypes.has(a.mimeType)) ||
    imageExts.has(a.filename.slice(a.filename.lastIndexOf(".")).toLowerCase())
  );

  if (imageAttachments.length > 0) {
    tempDir = await mkdtemp(join(tmpdir(), "cc2im-"));
    for (const att of imageAttachments) {
      const filePath = join(tempDir, att.filename);
      await writeFile(filePath, att.content);
      imagePaths.push(filePath);
    }
  }

  let bufferedText = "";
  const activities: string[] = []; // recent activity log
  const flushInterval = msg.platform === "web" ? 100 : 3000;
  const startTime = Date.now();
  let lastAskQuestions: AskQuestion[] | null = null; // intercepted AskUserQuestion

  const maxLen = formatter.getMaxLength(msg.platform);

  const pushActivity = (text: string) => {
    activities.push(text);
    if (activities.length > 5) activities.shift();
  };

  const formatElapsed = (): string => {
    const sec = Math.floor((Date.now() - startTime) / 1000);
    return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
  };

  // Build display: buffered text + activity log footer with elapsed time
  const buildDisplay = (): string => {
    const elapsed = formatElapsed();
    const lastActivity = activities.length > 0
      ? activities[activities.length - 1]
      : "thinking";
    const statusLine = `_⏳ [${elapsed}] ${lastActivity}..._`;
    const activityLog = activities.length > 1
      ? "\n\n---\n" + activities.slice(-5).map(a => `_• ${a}_`).join("\n") + `\n${statusLine}`
      : `\n\n${statusLine}`;
    if (bufferedText) {
      // Strip [react:emoji] lines from display during streaming
      const displayText = bufferedText.replace(/\n?\[react:.+\]\s*$/gm, "").trimEnd();
      const maxText = maxLen - activityLog.length;
      return displayText.slice(0, maxText) + activityLog;
    }
    return statusLine;
  };

  // Periodic flush timer - updates message every 3s with elapsed time
  console.log(`[stream] Timer started for thread ${threadId}, messageId ${currentMessageId}`);
  const flushTimer = setInterval(async () => {
    const display = buildDisplay();
    console.log(`[stream] Tick ${formatElapsed()} | activities=${activities.length} | text=${bufferedText.length}c`);
    try {
      await adapter.editMessage(threadId!, currentMessageId, display);
    } catch (err) {
      console.error(`[stream] editMessage failed:`, err);
    }
  }, flushInterval);

  // Inject platform context so Claude knows which platform it's on
  const platformHints: Record<string, string> = {
    discord: "[平台: Discord | 可自由使用 emoji。禁止使用 plugin_discord_discord MCP 工具（reply/fetch_messages/react/edit_message/download_attachment 等），所有 Discord 交互由外层 harness 处理。要给消息加 reaction 请在回复末尾写 [react:emoji]。要发送图片请在回复中写出图片的绝对路径，系统会自动上传。]",
    lark: "[平台: 飞书/Lark | 请使用简洁的文字回复。]",
    web: "[平台: Web UI]",
  };
  const platformPrefix = platformHints[msg.platform] ? platformHints[msg.platform] + "\n\n" : "";

  try {
    const result = await sessionManager.invoke(
      threadKey,
      project.directory,
      existingSessionId,
      platformPrefix + msg.content,
      (event) => {
        // Track current activity from stream events
        const evt = event as any;
        const blockTypes = evt.message?.content?.map((b: any) => b.type)?.join(",") ?? "n/a";
        console.log(`[stream] Event: type=${event.type}, blocks=[${blockTypes}]`);
        if (event.type === "assistant" && "message" in event) {
          const content = evt.message?.content;
          if (content) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                bufferedText += block.text;
              } else if (block.type === "tool_use") {
                const name = block.name ?? "tool";
                const input = block.input;
                let detail = name;
                console.log(`[stream] tool_use: name=${name}, inputKeys=${input ? Object.keys(input).join(",") : "null"}`);
                // Intercept AskUserQuestion tool calls
                if (name === "AskUserQuestion" && input?.questions) {
                  lastAskQuestions = input.questions as AskQuestion[];
                  console.log(`[stream] AskUserQuestion intercepted: ${lastAskQuestions.length} questions`);
                  detail = "AskUserQuestion: waiting for user input";
                }
                // Show relevant tool input details
                if (input) {
                  if (input.file_path) detail = `${name}: ${input.file_path}`;
                  else if (input.command) detail = `${name}: \`${String(input.command).slice(0, 60)}\``;
                  else if (input.pattern) detail = `${name}: ${input.pattern}`;
                  else if (input.query) detail = `${name}: ${String(input.query).slice(0, 60)}`;
                }
                pushActivity(detail);
              }
            }
          }
        }
      },
      imagePaths.length > 0 ? imagePaths : undefined,
      // When task starts processing (exits queue), update message to "Thinking"
      () => {
        adapter.editMessage(threadId!, currentMessageId, "⏳ _Thinking..._").catch(() => {});
      },
      project.model,
    );

    // Update thread with real Claude session ID (threadName already set on creation)
    store.upsertThread(threadId, msg.platform, msg.channelId, result.sessionId, project.name, threadName);

    // If AskUserQuestion was intercepted, send questions to user and wait for reply
    if (lastAskQuestions) {
      clearInterval(flushTimer);
      const questionMsg = formatAskQuestions(lastAskQuestions);
      await adapter.editMessage(threadId!, currentMessageId, questionMsg);

      // Wait for user reply via pendingAsks map
      const userAnswer = await new Promise<string>((resolve) => {
        pendingAsks.set(threadKey, {
          questions: lastAskQuestions!,
          sessionId: result.sessionId,
          channelId: msg.channelId,
          threadId: threadId!,
          resolve,
        });
      });

      // Re-invoke Claude with the user's answer, resuming the session
      const answerPrefix = platformHints[msg.platform] ? platformHints[msg.platform] + "\n\n" : "";
      const answerMessage = `${answerPrefix}[AskUserQuestion Response]\n${userAnswer}\n\nPlease continue from where you left off with these answers.`;

      // Show "thinking" while re-invoking
      const thinkingId = await adapter.sendMessage(msg.channelId, threadId!, "⏳ _Thinking..._");
      store.saveMessage(thinkingId, msg.platform, threadId!, true, "thinking...");

      // Reset state for re-invoke
      bufferedText = "";
      activities.length = 0;
      lastAskQuestions = null;
      const startTime2 = Date.now();

      const formatElapsed2 = (): string => {
        const sec = Math.floor((Date.now() - startTime2) / 1000);
        return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${sec % 60}s`;
      };

      const flushTimer2 = setInterval(async () => {
        const lastActivity = activities.length > 0 ? activities[activities.length - 1] : "thinking";
        const statusLine = `_⏳ [${formatElapsed2()}] ${lastActivity}..._`;
        const display = bufferedText
          ? bufferedText.replace(/\n?\[react:.+\]\s*$/gm, "").trimEnd().slice(0, maxLen - statusLine.length - 10) + `\n\n${statusLine}`
          : statusLine;
        try {
          await adapter.editMessage(threadId!, thinkingId, display);
        } catch {}
      }, flushInterval);

      try {
        const result2 = await sessionManager.invoke(
          threadKey,
          project.directory,
          result.sessionId,
          answerMessage,
          (event) => {
            const evt = event as any;
            if (event.type === "assistant" && "message" in event) {
              const content = evt.message?.content;
              if (content) {
                for (const block of content) {
                  if (block.type === "text" && block.text) {
                    bufferedText += block.text;
                  } else if (block.type === "tool_use") {
                    const name = block.name ?? "tool";
                    const input = block.input;
                    let detail = name;
                    if (name === "AskUserQuestion" && input?.questions) {
                      lastAskQuestions = input.questions as AskQuestion[];
                    }
                    if (input) {
                      if (input.file_path) detail = `${name}: ${input.file_path}`;
                      else if (input.command) detail = `${name}: \`${String(input.command).slice(0, 60)}\``;
                      else if (input.pattern) detail = `${name}: ${input.pattern}`;
                      else if (input.query) detail = `${name}: ${String(input.query).slice(0, 60)}`;
                    }
                    pushActivity(detail);
                  }
                }
              }
            }
          },
          undefined,
          undefined,
          project.model,
        );



        const { cleanText: cleanText2, reactions: reactions2 } = formatter.extractReactions(result2.text);
        const formatted2 = formatter.formatOutput(cleanText2, msg.platform);
        const footer2 = `\n\n_✅ done [${formatElapsed2()}]_`;
        if (formatted2.messages.length > 0) {
          formatted2.messages[formatted2.messages.length - 1] += footer2;
          await adapter.editMessage(threadId!, thinkingId, formatted2.messages[0]);
        }
        for (let i = 1; i < formatted2.messages.length; i++) {
          const extraId = await adapter.sendMessage(msg.channelId, threadId!, formatted2.messages[i]);
          store.saveMessage(extraId, msg.platform, threadId!, true, formatted2.messages[i].slice(0, 100));
        }
        for (const attachment of formatted2.attachments) {
          await adapter.uploadFile(msg.channelId, threadId!, attachment.filename, attachment.content);
        }
        const imageAttachmentsOut2 = formatter.extractImages(cleanText2, project.directory);
        for (const img of imageAttachmentsOut2) {
          await adapter.uploadFile(msg.channelId, threadId!, img.filename, img.content);
        }
        for (const emoji of reactions2) {
          await adapter.addReaction(threadId!, msg.messageId, emoji);
        }
        store.saveMessage(thinkingId, msg.platform, threadId!, true, cleanText2.slice(0, 200), result2.inputTokens, result2.outputTokens, result2.cacheReadTokens, result2.cacheCreationTokens, project.model);
      } finally {
        clearInterval(flushTimer2);
      }

      // Clean up temp files and return early — don't fall through to normal output
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
      return;
    }

    // Format final output
    const { cleanText, reactions } = formatter.extractReactions(result.text);
    const formatted = formatter.formatOutput(cleanText, msg.platform);

    // Append completion indicator with elapsed time to the last message chunk
    const completionFooter = `\n\n_✅ done [${formatElapsed()}]_`;
    const lastIdx = formatted.messages.length - 1;
    if (lastIdx >= 0) {
      formatted.messages[lastIdx] += completionFooter;
    }

    // Update the message with final content
    if (formatted.messages.length > 0) {
      await adapter.editMessage(threadId!, currentMessageId, formatted.messages[0]);
    }

    // Send additional message chunks
    for (let i = 1; i < formatted.messages.length; i++) {
      const extraId = await adapter.sendMessage(msg.channelId, threadId, formatted.messages[i]);
      store.saveMessage(extraId, msg.platform, threadId, true, formatted.messages[i].slice(0, 100));
    }

    // Upload text attachments (long output)
    for (const attachment of formatted.attachments) {
      await adapter.uploadFile(msg.channelId, threadId, attachment.filename, attachment.content);
    }

    // Detect and send image files referenced in output
    const imageAttachmentsOut = formatter.extractImages(cleanText, project.directory);
    for (const img of imageAttachmentsOut) {
      await adapter.uploadFile(msg.channelId, threadId, img.filename, img.content);
    }

    // Add reactions to the user's original message
    for (const emoji of reactions) {
      await adapter.addReaction(threadId!, msg.messageId, emoji);
    }

    // Update message record
    store.saveMessage(currentMessageId, msg.platform, threadId, true, cleanText.slice(0, 200), result.inputTokens, result.outputTokens, result.cacheReadTokens, result.cacheCreationTokens, project.model);

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const displayMsg = formatUserError(err);
    await adapter.editMessage(threadId!, currentMessageId, displayMsg);

    // If resume failed, clear session and notify
    if (errorMsg.includes("resume") || errorMsg.includes("session")) {
      store.deleteThread(threadId, msg.platform);
      await adapter.sendMessage(msg.channelId, threadId, "⚠️ Session reset. Please send your message again.");
    }
  } finally {
    clearInterval(flushTimer);
    // Clean up temp image files
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function handleReaction(
  reaction: Reaction,
  adapter: PlatformAdapter,
  router: Router,
  sessionManager: SessionManager,
  formatter: Formatter,
  store: Store,
  config: ReturnType<typeof loadConfig>,
) {
  const project = router.getProject(reaction.channelId, reaction.platform);
  if (!project) return;

  const sessionId = router.getSessionId(reaction.threadId, reaction.platform);
  if (!sessionId) return;

  // Find the message that was reacted to
  const msg = store.getMessage(reaction.messageId, reaction.platform);
  const summary = msg?.content_summary ?? "a message";

  // Send the reaction context as a new message to Claude
  const reactionText = `用户对消息「${summary}」添加了表情 ${reaction.emoji}`;
  await handleMessage(
    {
      platform: reaction.platform,
      channelId: reaction.channelId,
      threadId: reaction.threadId,
      messageId: reaction.messageId,
      userId: reaction.userId,
      userName: "user",
      content: reactionText,
      attachments: [],
    },
    adapter,
    router,
    sessionManager,
    formatter,
    store,
    config,
  );
}

async function handleSlashCommand(
  interaction: ChatInputCommandInteraction,
  adapter: DiscordAdapter,
  router: Router,
  store: Store,
  config: ReturnType<typeof loadConfig>,
  sessionManager?: SessionManager,
  formatter?: Formatter,
) {
  const command = interaction.commandName.replace("im-", "");
  const channel = interaction.channel;
  const isThread = channel?.isThread() ?? false;
  const channelId = isThread ? (channel as any).parentId! as string : interaction.channelId;
  const threadId = isThread ? interaction.channelId : interaction.channelId;

  switch (command) {
    case "done":
    case "reopen": {
      if (!isThread) {
        await interaction.reply({ content: "⚠️ 请在 thread 中使用此命令", flags: 64 });
        return;
      }
      const newStatus: ThreadStatus = command === "done" ? "done" : "active";
      const thread = store.getThread(threadId, "discord");
      if (!thread) {
        await interaction.reply({ content: "⚠️ 未找到此 thread 的记录", flags: 64 });
        return;
      }
      store.updateThreadStatus(threadId, "discord", newStatus);
      await interaction.reply(newStatus === "done" ? "✅ 已标记为完成" : "🔄 已重新打开");
      // Rename thread async — may be rate-limited by Discord
      const icon = THREAD_STATUS_ICONS[newStatus];
      adapter.getThreadName(threadId).then(currentName => {
        const cleanName = stripStatusIcon(currentName);
        adapter.renameThread(threadId, `${icon} ${cleanName}`).catch(() => {});
      }).catch(() => {});
      break;
    }

    case "list-projects": {
      const list = config.projects.map(p =>
        `• **${p.name}** → \`${p.directory}\` (${Object.entries(p.platforms).filter(([, v]) => v).map(([k]) => k).join(", ")})`
      ).join("\n");
      await interaction.reply(list || "_No projects configured_");
      break;
    }

    case "add-project": {
      const name = interaction.options.getString("name", true);
      const directory = interaction.options.getString("directory", true);
      const project = { name, directory, platforms: { discord: true } as Partial<Record<"lark" | "discord", boolean>> };
      addProject(config, project);
      saveConfig(CONFIG_PATH, config);
      const channelInfo = await adapter.setupProject(project);
      router.registerChannel(channelInfo.channelId, "discord", name);
      await interaction.reply(`✅ Project **${name}** added → \`${directory}\``);
      break;
    }

    case "remove-project": {
      const name = interaction.options.getString("name", true);
      removeProject(config, name);
      saveConfig(CONFIG_PATH, config);
      await interaction.reply(`✅ Project **${name}** removed`);
      break;
    }

    case "reload-config": {
      const newConfig = loadConfig(CONFIG_PATH);
      Object.assign(config, newConfig);
      sessionManager?.updateConfig(config.claude, config.formatter);
      formatter?.updateConfig(config.formatter);
      await interaction.reply("✅ Config reloaded");
      break;
    }

    default:
      await interaction.reply({ content: `未知命令: ${interaction.commandName}`, flags: 64 });
  }
}

async function handleManagementCommand(
  msg: IncomingMessage,
  adapter: PlatformAdapter,
  router: Router,
  store: Store,
  config: ReturnType<typeof loadConfig>,
  sessionManager?: SessionManager,
  formatter?: Formatter,
) {
  const parsed = router.parseManagementCommand(msg.content);
  if (!parsed) return;

  const threadId = msg.threadId ?? msg.channelId;

  switch (parsed.command) {
    case "list-projects": {
      const list = config.projects.map(p =>
        `• **${p.name}** → \`${p.directory}\` (${Object.entries(p.platforms).filter(([, v]) => v).map(([k]) => k).join(", ")})`
      ).join("\n");
      await adapter.sendMessage(msg.channelId, threadId, list || "_No projects configured_");
      break;
    }

    case "add-project": {
      if (parsed.args.length < 2) {
        await adapter.sendMessage(msg.channelId, threadId, "Usage: `/im-add-project <name> <directory>`");
        return;
      }
      const [name, directory] = parsed.args;
      const project = { name, directory, platforms: { [msg.platform]: true } as Partial<Record<"lark" | "discord", boolean>> };
      addProject(config, project);
      saveConfig(CONFIG_PATH, config);

      const channelInfo = await adapter.setupProject(project);
      router.registerChannel(channelInfo.channelId, msg.platform, name);

      await adapter.sendMessage(msg.channelId, threadId, `✅ Project **${name}** added → \`${directory}\``);
      break;
    }

    case "remove-project": {
      if (parsed.args.length < 1) {
        await adapter.sendMessage(msg.channelId, threadId, "Usage: `/im-remove-project <name>`");
        return;
      }
      removeProject(config, parsed.args[0]);
      saveConfig(CONFIG_PATH, config);
      await adapter.sendMessage(msg.channelId, threadId, `✅ Project **${parsed.args[0]}** removed`);
      break;
    }

    case "reload-config": {
      const newConfig = loadConfig(CONFIG_PATH);
      Object.assign(config, newConfig);
      sessionManager?.updateConfig(config.claude, config.formatter);
      formatter?.updateConfig(config.formatter);
      await adapter.sendMessage(msg.channelId, threadId, "✅ Config reloaded");
      break;
    }

    case "done":
    case "reopen": {
      if (!msg.threadId) {
        await adapter.sendMessage(msg.channelId, threadId, "⚠️ 请在 thread 中使用此命令");
        return;
      }
      const newStatus: ThreadStatus = parsed.command === "done" ? "done" : "active";
      const thread = store.getThread(msg.threadId, msg.platform);
      if (!thread) {
        await adapter.sendMessage(msg.channelId, threadId, "⚠️ 未找到此 thread 的记录");
        return;
      }
      store.updateThreadStatus(msg.threadId, msg.platform, newStatus);
      await adapter.sendMessage(msg.channelId, threadId,
        newStatus === "done" ? "✅ 已标记为完成" : "🔄 已重新打开"
      );
      // Rename thread async — may be rate-limited by Discord
      const icon = THREAD_STATUS_ICONS[newStatus];
      getThreadName(adapter, msg.threadId).then(currentName => {
        const cleanName = stripStatusIcon(currentName);
        adapter.renameThread(msg.threadId!, `${icon} ${cleanName}`).catch(() => {});
      }).catch(() => {});
      break;
    }
  }
}

export function formatUserError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as NodeJS.ErrnoException)?.code;

  if (code === "ENOENT" || msg.includes("ENOENT")) {
    return "❌ Claude Code is not installed or not found in PATH. Please install it first: https://docs.anthropic.com/en/docs/claude-code";
  }
  if (code === "EACCES" || msg.includes("EACCES")) {
    return "❌ Permission denied when running Claude Code. Please check file permissions.";
  }
  if (/auth|login|log in|API key|unauthorized|not logged in|account/i.test(msg)) {
    return "❌ Claude Code is not logged in. Please run `claude login` to authenticate.";
  }
  if (msg.includes("timed out")) {
    return `❌ Claude Code timed out. Please try again with a simpler request.`;
  }
  return `❌ Error: ${msg}`;
}

export function stripStatusIcon(name: string): string {
  // Remove known status icon prefixes
  return name.replace(/^(?:🔄|✅)\s*/, "");
}

async function getThreadName(adapter: PlatformAdapter, threadId: string): Promise<string> {
  // Try to get the thread name via the adapter; fall back to empty
  try {
    return await adapter.getThreadName(threadId);
  } catch {
    return "";
  }
}

export function generateThreadTitle(userMessage: string, claudeCommand: string): Promise<string> {
  const prompt = `根据以下用户消息，生成一个15字以内的简短中文标题，只输出标题本身，不要引号或其他内容：\n\n${userMessage}`;
  return new Promise((resolve, reject) => {
    execFile(claudeCommand, ["--print", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "--model", "haiku", "--max-turns", "1", "-p", prompt], {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, CLAUDECODE: undefined },
    }, (err, stdout) => {
      if (err) return reject(err);
      // Parse stream-json NDJSON output to extract result text
      let title = "";
      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as any;
          if (event.type === "result" && event.result) {
            title = String(event.result).trim().slice(0, 15);
            break;
          }
        } catch {}
      }
      resolve(title || userMessage.slice(0, 15) || "New conversation");
    });
  });
}

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith("/index.js") || process.argv[1].endsWith("/index.ts")
);
if (isDirectRun) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
