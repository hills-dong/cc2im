import { loadConfig, saveConfig, addProject, removeProject } from "./config.js";
import { Store, THREAD_STATUS_ICONS, type ThreadStatus } from "./store.js";
import { SessionManager } from "./session.js";
import { Formatter } from "./formatter.js";
import { Router } from "./router.js";
import { DiscordAdapter } from "./adapters/discord.js";
import type { PlatformAdapter, IncomingMessage, Reaction } from "./types.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { resolve, join } from "path";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { execFile } from "child_process";

const CONFIG_PATH = resolve(process.env.CC2IM_CONFIG ?? "config.yaml");
const DB_PATH = resolve(process.env.CC2IM_DB ?? "cc2im.db");

export async function main() {
  console.log("cc2im starting...");

  let config = loadConfig(CONFIG_PATH);
  const store = new Store(DB_PATH);
  const sessionManager = new SessionManager(config.claude, config.formatter);
  const formatter = new Formatter(config.formatter);
  const router = new Router(config, store);

  const adapters: PlatformAdapter[] = [];

  // Initialize Discord adapter if configured
  if (config.discord.token) {
    const discord = new DiscordAdapter(config.discord.token);
    adapters.push(discord);
  }

  // Start all adapters
  for (const adapter of adapters) {
    await adapter.start();

    // Setup project channels
    for (const project of config.projects) {
      if (!project.platforms[adapter.platform]) continue;
      const channelInfo = await adapter.setupProject(project);
      router.registerChannel(channelInfo.channelId, adapter.platform, project.name);
      console.log(`Registered ${adapter.platform} channel ${channelInfo.channelId} → ${project.name}`);
    }

    // Handle incoming messages
    adapter.onMessage(async (msg) => {
      try {
        await handleMessage(msg, adapter, router, sessionManager, formatter, store, config);
      } catch (err) {
        console.error("Error handling message:", err);
      }
    });

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
          await handleSlashCommand(interaction, adapter, router, store, config);
        } catch (err) {
          console.error("Error handling slash command:", err);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: `❌ ${err instanceof Error ? err.message : String(err)}`, flags: 64 }).catch(() => {});
          }
        }
      });
    }
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
  // Check for management commands
  if (router.isManagementCommand(msg.content)) {
    await handleManagementCommand(msg, adapter, router, store, config);
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

  // Get existing session for this thread
  const existingSessionId = router.getSessionId(threadId, msg.platform);

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
  const flushInterval = 3000; // 3 seconds
  const startTime = Date.now();

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
      const maxText = maxLen - activityLog.length;
      return bufferedText.slice(0, maxText) + activityLog;
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

  try {
    const result = await sessionManager.invoke(
      threadKey,
      project.directory,
      existingSessionId,
      msg.content,
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

    // Save session mapping
    store.upsertThread(threadId, msg.platform, msg.channelId, result.sessionId, project.name);

    // Format final output
    const { cleanText, reactions } = formatter.extractReactions(result.text);
    const formatted = formatter.formatOutput(cleanText, msg.platform);

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

    // Add reactions
    for (const emoji of reactions) {
      await adapter.addReaction(threadId!, currentMessageId, emoji);
    }

    // Update message record
    store.saveMessage(currentMessageId, msg.platform, threadId, true, cleanText.slice(0, 200));

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
      Object.assign(config, loadConfig(CONFIG_PATH));
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
      Object.assign(config, loadConfig(CONFIG_PATH));
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

function formatUserError(err: unknown): string {
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

function stripStatusIcon(name: string): string {
  // Remove known status icon prefixes
  return name.replace(/^[🔄✅]\s*/, "");
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
