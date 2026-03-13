import { loadConfig, saveConfig, addProject, removeProject } from "./config.js";
import { Store } from "./store.js";
import { SessionManager } from "./session.js";
import { Formatter } from "./formatter.js";
import { Router } from "./router.js";
import { DiscordAdapter } from "./adapters/discord.js";
import type { PlatformAdapter, IncomingMessage, Reaction } from "./types.js";
import { resolve, join } from "path";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";

const CONFIG_PATH = resolve(process.env.CC2IM_CONFIG ?? "config.yaml");
const DB_PATH = resolve(process.env.CC2IM_DB ?? "cc2im.db");

async function main() {
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
  }

  console.log("cc2im ready.");

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    for (const adapter of adapters) {
      await adapter.stop();
    }
    store.close();
    process.exit(0);
  });
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
    await handleManagementCommand(msg, adapter, router, config);
    return;
  }

  // Find project for this channel
  const project = router.getProject(msg.channelId, msg.platform);
  if (!project) return; // Not a registered channel

  // Create thread if this is a top-level message
  let threadId = msg.threadId;
  if (!threadId) {
    threadId = await adapter.createThread(msg.channelId, msg.messageId);
  }

  // Get existing session for this thread
  const existingSessionId = router.getSessionId(threadId, msg.platform);

  // Send initial "thinking" indicator
  const currentMessageId = await adapter.sendMessage(msg.channelId, threadId, "⏳ _Thinking..._");
  store.saveMessage(currentMessageId, msg.platform, threadId, true, "thinking...");

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
  let lastFlush = Date.now();
  const bufferInterval = config.claude.bufferInterval;
  const threadKey = `${msg.platform}:${threadId}`;

  try {
    const result = await sessionManager.invoke(
      threadKey,
      project.directory,
      existingSessionId,
      msg.content,
      async (event) => {
        // Stream handler: buffer and flush text updates
        if (event.type === "assistant" && "message" in event) {
          const content = (event as any).message?.content;
          if (content) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                bufferedText += block.text;
              }
            }
          }

          // Flush buffer periodically
          const now = Date.now();
          if (now - lastFlush >= bufferInterval && bufferedText) {
            const display = bufferedText.slice(0, formatter.getMaxLength(msg.platform));
            await adapter.editMessage(threadId!, currentMessageId, display).catch(() => {});
            lastFlush = now;
          }
        }
      },
      imagePaths.length > 0 ? imagePaths : undefined,
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
    await adapter.editMessage(threadId!, currentMessageId, `❌ Error: ${errorMsg}`);

    // If resume failed, clear session and notify
    if (errorMsg.includes("resume") || errorMsg.includes("session")) {
      store.deleteThread(threadId, msg.platform);
      await adapter.sendMessage(msg.channelId, threadId, "⚠️ Session reset. Please send your message again.");
    }
  } finally {
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

async function handleManagementCommand(
  msg: IncomingMessage,
  adapter: PlatformAdapter,
  router: Router,
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
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
