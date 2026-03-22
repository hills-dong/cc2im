import * as lark from "@larksuiteoapi/node-sdk";
import type {
  PlatformAdapter, IncomingMessage, Reaction, ProjectConfig, ChannelInfo, Platform,
} from "@cc2im/core";

export class LarkAdapter implements PlatformAdapter {
  readonly platform: Platform = "lark";

  private client: lark.Client;
  private wsClient: lark.WSClient | null = null;
  private eventDispatcher: lark.EventDispatcher;
  private messageHandler?: (msg: IncomingMessage) => void;
  private reactionHandler?: (reaction: Reaction) => void;
  private botOpenId: string = "";
  // Map thread_id (omt_xxx) → a message_id within that thread, for reply-based sending
  private threadMsgMap = new Map<string, string>();

  constructor(
    private appId: string,
    private appSecret: string,
    private ownerOpenId?: string,
  ) {
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });

    this.eventDispatcher = new lark.EventDispatcher({});
    this.eventDispatcher.register({
      "im.message.receive_v1": async (data) => {
        await this.handleMessage(data).catch((err) =>
          console.error("[cc2im] Error handling Lark message:", err)
        );
      },
      "im.message.reaction.created_v1": async (data) => {
        this.handleReactionEvent(data);
      },
    });
  }

  async start(): Promise<void> {
    // Fetch bot info to get open_id for filtering self-messages
    try {
      const resp = await (this.client as any).request({
        method: "GET",
        url: "https://open.feishu.cn/open-apis/bot/v3/info",
      });
      this.botOpenId = resp?.bot?.open_id ?? "";
      console.log(`Lark bot info: open_id=${this.botOpenId}`);
    } catch (err) {
      console.error("[cc2im] Failed to fetch Lark bot info:", err);
    }

    // Start WebSocket event subscription
    this.wsClient = new lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      domain: lark.Domain.Feishu,
    });
    await this.wsClient.start({
      eventDispatcher: this.eventDispatcher,
    });
    console.log("Lark bot connected via WebSocket.");
  }

  async stop(): Promise<void> {
    this.wsClient?.close();
  }

  async setupProject(project: ProjectConfig, store?: { getLatestChannelId(platform: string, projectName: string): string | null }): Promise<ChannelInfo> {
    // Use latest channel_id from DB if available (set by /im-update or previous threads)
    const mapped = store?.getLatestChannelId("lark", project.name);
    if (mapped) {
      console.log(`Lark: using mapped chat for "${project.name}" → ${mapped}`);
      return { channelId: mapped, platform: "lark", projectName: project.name };
    }

    // Find existing chat group named cc2im-{project}
    const targetName = `cc2im-${project.name}`;

    try {
      const resp = await this.client.im.chat.list({
        params: { page_size: 100 },
      });
      const existing = resp?.data?.items?.find(
        (ch) => ch.name === targetName && ch.chat_status === "normal"
      );
      if (existing?.chat_id) {
        console.log(`Lark: found existing chat "${targetName}" → ${existing.chat_id}`);
        return { channelId: existing.chat_id, platform: "lark", projectName: project.name };
      }
    } catch (err) {
      console.error("[cc2im] Failed to list Lark chats:", err);
    }

    // Create new chat group
    try {
      const resp = await this.client.im.chat.create({
        params: {
          user_id_type: "open_id",
          set_bot_manager: true,
        },
        data: {
          name: targetName,
          description: `Claude Code project: ${project.name} (${project.directory})`,
          chat_type: "group",
          group_message_type: "thread",
          owner_id: this.ownerOpenId || undefined,
          user_id_list: this.ownerOpenId ? [this.ownerOpenId] : undefined,
        },
      });
      const chatId = resp?.data?.chat_id;
      if (!chatId) throw new Error("No chat_id returned from chat.create");
      console.log(`Lark: created chat "${targetName}" → ${chatId}`);
      return { channelId: chatId, platform: "lark", projectName: project.name };
    } catch (err) {
      console.error("[cc2im] Failed to create Lark chat:", err);
      throw err;
    }
  }

  async createThread(_channelId: string, messageId: string): Promise<string> {
    // Create a Lark topic (话题) by replying to the user's message with reply_in_thread
    try {
      const resp = await this.client.im.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: "interactive",
          content: JSON.stringify(buildCard("⏳ _创建话题中..._")),
          reply_in_thread: true,
        },
      });
      const threadId = resp?.data?.thread_id;
      const replyMsgId = resp?.data?.message_id;
      console.log(`[lark] createThread: messageId=${messageId}, thread_id=${threadId}, message_id=${replyMsgId}`);
      if (threadId) {
        if (replyMsgId) this.threadMsgMap.set(threadId, replyMsgId);
        return threadId;
      }
      return messageId;
    } catch (err) {
      console.error("[cc2im] Lark createThread failed:", err);
      return messageId;
    }
  }

  async getThreadName(_threadId: string): Promise<string> {
    // Lark doesn't have named threads
    return "";
  }

  async renameThread(_threadId: string, _name: string): Promise<void> {
    // No-op: Lark threads don't have names
  }

  async sendMessage(channelId: string, threadId: string, content: string): Promise<string> {
    console.log(`[lark] sendMessage threadId=${threadId} channelId=${channelId}`);
    try {
      // Use interactive card for topic threads (supports patch updates for streaming)
      const isThread = threadId.startsWith("omt_");
      const msgType = isThread ? "interactive" : "text";
      const msgContent = isThread
        ? JSON.stringify(buildCard(content))
        : JSON.stringify({ text: content });

      let resp;
      if (threadId.startsWith("omt_")) {
        // Feishu API doesn't support receive_id_type=thread_id;
        // send to threads by replying to a message within the thread
        const replyTo = await this.ensureThreadMsg(threadId);
        if (!replyTo) throw new Error(`Cannot resolve message_id for thread ${threadId}`);
        resp = await this.client.im.message.reply({
          path: { message_id: replyTo },
          data: { msg_type: msgType, content: msgContent, reply_in_thread: true },
        });
        // Update cached message_id for next reply
        if (resp?.data?.message_id) this.threadMsgMap.set(threadId, resp.data.message_id);
      } else if (threadId.startsWith("oc_")) {
        resp = await this.client.im.message.create({
          params: { receive_id_type: "chat_id" },
          data: { receive_id: threadId, msg_type: "text", content: JSON.stringify({ text: content }) },
        });
      } else {
        resp = await this.client.im.message.reply({
          path: { message_id: threadId },
          data: { msg_type: "text", content: JSON.stringify({ text: content }) },
        });
      }
      const msgId = resp?.data?.message_id;
      if (!msgId) throw new Error("No message_id returned");
      return msgId;
    } catch (err) {
      console.error("[cc2im] Lark sendMessage failed:", err);
      throw err;
    }
  }

  async editMessage(_channelId: string, messageId: string, content: string): Promise<void> {
    try {
      if (_channelId.startsWith("omt_")) {
        // Topic thread messages — update via card patch
        await this.client.im.message.patch({
          path: { message_id: messageId },
          data: { content: JSON.stringify(buildCard(content)) },
        });
      } else {
        // Regular messages — update text
        await this.client.im.message.update({
          path: { message_id: messageId },
          data: {
            msg_type: "text",
            content: JSON.stringify({ text: content }),
          },
        });
      }
    } catch (err) {
      const code = (err as any)?.code;
      if (code !== 230001) {
        console.error("[cc2im] Lark editMessage failed:", err);
      }
    }
  }

  async uploadFile(_channelId: string, threadId: string, filename: string, content: Buffer): Promise<void> {
    const imageExts = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    const isImage = imageExts.has(ext);

    try {
      if (isImage) {
        const uploadResp = await this.client.im.image.create({
          data: { image_type: "message", image: content },
        });
        const imageKey = uploadResp?.image_key;
        if (!imageKey) throw new Error("No image_key returned");
        await this.sendTypedMessage(threadId, "image", JSON.stringify({ image_key: imageKey }));
      } else {
        const uploadResp = await this.client.im.file.create({
          data: { file_type: "stream", file_name: filename, file: content },
        });
        const fileKey = uploadResp?.file_key;
        if (!fileKey) throw new Error("No file_key returned");
        await this.sendTypedMessage(threadId, "file", JSON.stringify({ file_key: fileKey }));
      }
    } catch (err) {
      console.error("[cc2im] Lark uploadFile failed:", err);
    }
  }

  /**
   * Ensure threadMsgMap has a message_id for the given thread.
   * On restart, the in-memory map is empty — fetch the latest message from the thread via API.
   */
  private async ensureThreadMsg(threadId: string): Promise<string | null> {
    const cached = this.threadMsgMap.get(threadId);
    if (cached) return cached;

    // Fetch the latest message in the thread via API to get a valid message_id
    try {
      const resp = await this.client.im.message.list({
        params: {
          container_id_type: "thread",
          container_id: threadId,
          sort_type: "ByCreateTimeDesc",
          page_size: 1,
        },
      });
      const items = resp?.data?.items;
      if (items?.length && items[0].message_id) {
        const msgId = items[0].message_id;
        this.threadMsgMap.set(threadId, msgId);
        console.log(`[lark] ensureThreadMsg: recovered thread ${threadId} → ${msgId}`);
        return msgId;
      }
    } catch (err) {
      console.error(`[lark] ensureThreadMsg: failed to list messages for ${threadId}:`, err);
    }

    // Fallback: try omt_ → om_ prefix swap (may not always work)
    const rootMsgId = threadId.replace(/^omt_/, "om_");
    this.threadMsgMap.set(threadId, rootMsgId);
    console.log(`[lark] ensureThreadMsg: fallback ${threadId} → ${rootMsgId}`);
    return rootMsgId;
  }

  /** Send a message of any type to the right destination based on threadId prefix */
  private async sendTypedMessage(threadId: string, msgType: string, content: string): Promise<void> {
    if (threadId.startsWith("omt_")) {
      const replyTo = await this.ensureThreadMsg(threadId);
      if (!replyTo) throw new Error(`Cannot resolve message_id for thread ${threadId}`);
      const resp = await this.client.im.message.reply({
        path: { message_id: replyTo },
        data: { msg_type: msgType, content, reply_in_thread: true },
      });
      if (resp?.data?.message_id) this.threadMsgMap.set(threadId, resp.data.message_id);
    } else {
      await this.client.im.message.reply({
        path: { message_id: threadId },
        data: { msg_type: msgType, content },
      });
    }
  }

  async addReaction(_channelId: string, messageId: string, emoji: string): Promise<void> {
    // Lark uses emoji_type strings like "THUMBSUP", "SMILE", etc.
    // Map common Unicode emoji to Lark emoji types
    const emojiType = mapUnicodeToLarkEmoji(emoji);
    if (!emojiType) return;

    try {
      await this.client.im.messageReaction.create({
        path: { message_id: messageId },
        data: {
          reaction_type: { emoji_type: emojiType },
        },
      });
    } catch (err) {
      console.error("[cc2im] Lark addReaction failed:", err);
    }
  }

  /** Get the name of a chat group */
  async getChatName(chatId: string): Promise<string | null> {
    try {
      const resp = await this.client.im.chat.get({ path: { chat_id: chatId } });
      return resp?.data?.name ?? null;
    } catch (err) {
      console.error("[cc2im] Failed to get chat info:", err);
      return null;
    }
  }

  /** Add a user to a chat group by open_id */
  async addMemberToChat(chatId: string, openId: string): Promise<void> {
    await this.client.im.chatMembers.create({
      path: { chat_id: chatId },
      params: { member_id_type: "open_id" },
      data: { id_list: [openId] },
    });
  }

  /** Transfer chat ownership to a user and ensure topic mode */
  async transferChatOwner(chatId: string, openId: string): Promise<void> {
    await this.client.im.chat.update({
      path: { chat_id: chatId },
      params: { user_id_type: "open_id" },
      data: { owner_id: openId },
    });
  }

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  onReaction(handler: (reaction: Reaction) => void): void {
    this.reactionHandler = handler;
  }

  private async handleMessage(data: any): Promise<void> {
    if (!this.messageHandler) return;

    const sender = data.sender;
    const message = data.message;

    // Ignore messages from the bot itself
    if (sender?.sender_type === "app") return;
    const senderOpenId = sender?.sender_id?.open_id ?? "";
    if (senderOpenId === this.botOpenId) return;

    const chatId = message.chat_id;
    const messageId = message.message_id;
    const chatType = message.chat_type; // "group" | "p2p"
    const threadId = message.thread_id ?? null; // non-null means it's inside a topic thread

    // Parse message content
    let content = "";
    try {
      const parsed = JSON.parse(message.content);
      if (message.message_type === "text") {
        content = parsed.text ?? "";
      } else if (message.message_type === "post") {
        // Rich text: extract plain text from all paragraphs
        content = extractPostText(parsed);
      } else if (message.message_type === "image") {
        // Image message — download and pass as attachment
        content = "[图片]";
      } else {
        content = `[${message.message_type}]`;
      }
    } catch {
      content = message.content ?? "";
    }

    // Strip bot @mention from content if present (Lark uses @_user_N placeholders)
    const mentions = message.mentions as Array<{ key: string; id: { open_id?: string }; name: string }> | undefined;
    if (mentions) {
      for (const mention of mentions) {
        if (mention.id?.open_id === this.botOpenId) {
          content = content.replace(new RegExp(mention.key + "\\s*", "g"), "").trim();
        }
      }
    }

    if (!content.trim()) return;

    // Keep threadMsgMap updated so we can reply into threads
    if (threadId && messageId) {
      this.threadMsgMap.set(threadId, messageId);
    }

    // Download image attachments
    const attachments = await this.downloadAttachments(message);

    this.messageHandler({
      platform: "lark",
      channelId: chatId,
      threadId, // null for top-level messages, t_xxx for topic threads
      messageId,
      userId: senderOpenId,
      userName: sender?.sender_id?.user_id ?? senderOpenId,
      content: content.trim(),
      attachments,
    });
  }

  private async downloadAttachments(message: any): Promise<Array<{ filename: string; content: Buffer; mimeType?: string }>> {
    const attachments: Array<{ filename: string; content: Buffer; mimeType?: string }> = [];

    if (message.message_type === "image") {
      try {
        const parsed = JSON.parse(message.content);
        const imageKey = parsed.image_key;
        if (imageKey) {
          const resp = await this.client.im.messageResource.get({
            path: { message_id: message.message_id, file_key: imageKey },
            params: { type: "image" },
          });
          if (resp) {
            const chunks: Buffer[] = [];
            const stream = resp.getReadableStream();
            for await (const chunk of stream) {
              chunks.push(Buffer.from(chunk));
            }
            attachments.push({
              filename: `image-${Date.now()}.png`,
              content: Buffer.concat(chunks),
              mimeType: "image/png",
            });
          }
        }
      } catch (err) {
        console.error("[cc2im] Failed to download Lark image:", err);
      }
    }

    return attachments;
  }

  private handleReactionEvent(data: any): void {
    if (!this.reactionHandler) return;

    const messageId = data.message_id;
    const emojiType = data.reaction_type?.emoji_type ?? "";
    const userId = data.user_id?.open_id ?? "";

    // We need the chat_id for the reaction, but the event doesn't include it.
    // We'll pass the messageId as both channelId and threadId as a workaround.
    // The router will look up the correct mapping.
    this.reactionHandler({
      platform: "lark",
      channelId: messageId, // Will be resolved by the router
      threadId: messageId,
      messageId,
      emoji: mapLarkEmojiToUnicode(emojiType),
      userId,
    });
  }
}

/**
 * Extract plain text content from a Lark "post" (rich text) message.
 */
function extractPostText(post: any): string {
  const lines: string[] = [];
  // post format: { "zh_cn": { "title": "...", "content": [[...], [...]] } }
  // or: { "title": "...", "content": [[...], [...]] }
  const body = post.zh_cn ?? post.en_us ?? post;
  if (body.title) lines.push(body.title);
  const content = body.content;
  if (Array.isArray(content)) {
    for (const paragraph of content) {
      if (Array.isArray(paragraph)) {
        const paraText = paragraph
          .map((el: any) => {
            if (el.tag === "text") return el.text ?? "";
            if (el.tag === "a") return el.text ?? el.href ?? "";
            if (el.tag === "at") return "";
            return "";
          })
          .join("");
        lines.push(paraText);
      }
    }
  }
  return lines.join("\n");
}

/**
 * Map Unicode emoji characters to Lark emoji type strings.
 * Lark uses uppercase identifiers like "THUMBSUP", "SMILE", etc.
 */
function mapUnicodeToLarkEmoji(emoji: string): string | null {
  const map: Record<string, string> = {
    "👍": "THUMBSUP",
    "👎": "THUMBSDOWN",
    "😀": "SMILE",
    "😊": "SMILE",
    "🙂": "SMILE",
    "😄": "GRINNING",
    "😂": "JOYFUL",
    "🤣": "JOYFUL",
    "❤️": "HEART",
    "❤": "HEART",
    "🔥": "FIRE",
    "🎉": "PARTY",
    "✅": "OK",
    "✔️": "OK",
    "✔": "OK",
    "❌": "CROSS",
    "⭐": "STAR",
    "🌟": "STAR",
    "👀": "EYES",
    "🤔": "THINKING",
    "💡": "LIGHTBULB",
    "🚀": "ROCKET",
    "💪": "MUSCLE",
    "👏": "CLAP",
    "😍": "HEARTEYESFACE",
    "🙏": "PRAY",
    "😢": "CRY",
    "😭": "LOUDCRY",
    "😱": "SCREAM",
    "🤷": "SHRUG",
    "✨": "GLOWING",
    "💯": "HUNDRED",
    "🎯": "BULLSEYE",
  };
  return map[emoji] ?? null;
}

/**
 * Map Lark emoji type strings back to Unicode emoji.
 */
function mapLarkEmojiToUnicode(emojiType: string): string {
  const map: Record<string, string> = {
    "THUMBSUP": "👍",
    "THUMBSDOWN": "👎",
    "SMILE": "😊",
    "GRINNING": "😄",
    "JOYFUL": "😂",
    "HEART": "❤️",
    "FIRE": "🔥",
    "PARTY": "🎉",
    "OK": "✅",
    "CROSS": "❌",
    "STAR": "⭐",
    "EYES": "👀",
    "THINKING": "🤔",
    "LIGHTBULB": "💡",
    "ROCKET": "🚀",
    "MUSCLE": "💪",
    "CLAP": "👏",
    "HEARTEYESFACE": "😍",
    "PRAY": "🙏",
    "CRY": "😢",
    "LOUDCRY": "😭",
    "SCREAM": "😱",
    "SHRUG": "🤷",
    "GLOWING": "✨",
    "HUNDRED": "💯",
    "BULLSEYE": "🎯",
  };
  return map[emojiType] ?? emojiType;
}

/**
 * Build a Lark interactive card with markdown content.
 * Uses update_multi:true so it can be patched for streaming updates.
 */
function buildCard(content: string): object {
  return {
    config: { update_multi: true, wide_screen_mode: true },
    elements: [
      { tag: "markdown", content },
    ],
  };
}
