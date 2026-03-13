import {
  Client,
  GatewayIntentBits,
  type Message as DiscordMessage,
  type MessageReaction,
  type User,
  type TextChannel,
  type ThreadChannel,
  ChannelType,
} from "discord.js";
import type { PlatformAdapter, IncomingMessage, Reaction, ProjectConfig, ChannelInfo, Platform } from "../types.js";

export class DiscordAdapter implements PlatformAdapter {
  readonly platform: Platform = "discord";
  private client: Client;
  private messageHandler?: (msg: IncomingMessage) => void;
  private reactionHandler?: (reaction: Reaction) => void;

  constructor(private token: string) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });

    this.client.on("messageCreate", (msg) => this.handleMessage(msg));
    this.client.on("messageReactionAdd", (reaction, user) =>
      this.handleReaction(reaction as MessageReaction, user as User)
    );
  }

  async start(): Promise<void> {
    await this.client.login(this.token);
    console.log(`Discord bot logged in as ${this.client.user?.tag}`);
  }

  async stop(): Promise<void> {
    this.client.destroy();
  }

  async setupProject(project: ProjectConfig): Promise<ChannelInfo> {
    const guild = this.client.guilds.cache.first();
    if (!guild) throw new Error("Bot is not in any Discord server");

    const existing = guild.channels.cache.find(
      ch => ch.name === `cc2im-${project.name}` && ch.type === ChannelType.GuildText
    );
    if (existing) {
      return { channelId: existing.id, platform: "discord", projectName: project.name };
    }

    const channel = await guild.channels.create({
      name: `cc2im-${project.name}`,
      type: ChannelType.GuildText,
      topic: `Claude Code project: ${project.name} (${project.directory})`,
    });

    return { channelId: channel.id, platform: "discord", projectName: project.name };
  }

  async createThread(channelId: string, messageId: string): Promise<string> {
    const channel = await this.client.channels.fetch(channelId) as TextChannel;
    const message = await channel.messages.fetch(messageId);
    const thread = await message.startThread({
      name: `Claude ${new Date().toISOString().slice(0, 16)}`,
      autoArchiveDuration: 1440,
    });
    return thread.id;
  }

  async sendMessage(channelId: string, threadId: string, content: string): Promise<string> {
    const thread = await this.client.channels.fetch(threadId) as ThreadChannel;
    const msg = await thread.send(content);
    return msg.id;
  }

  async editMessage(channelId: string, messageId: string, content: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId) as TextChannel | ThreadChannel;
    const msg = await channel.messages.fetch(messageId);
    await msg.edit(content);
  }

  async uploadFile(channelId: string, threadId: string, filename: string, content: Buffer): Promise<void> {
    const thread = await this.client.channels.fetch(threadId) as ThreadChannel;
    await thread.send({
      files: [{ attachment: content, name: filename }],
    });
  }

  async addReaction(channelId: string, messageId: string, emoji: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId) as TextChannel | ThreadChannel;
    const msg = await channel.messages.fetch(messageId);
    await msg.react(emoji);
  }

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this.messageHandler = handler;
  }

  onReaction(handler: (reaction: Reaction) => void): void {
    this.reactionHandler = handler;
  }

  private handleMessage(msg: DiscordMessage): void {
    if (msg.author.bot) return;
    if (!this.messageHandler) return;

    const isThread = msg.channel.type === ChannelType.PublicThread || msg.channel.type === ChannelType.PrivateThread;
    const threadId = isThread ? msg.channel.id : null;
    const channelId = isThread ? (msg.channel as ThreadChannel).parentId! : msg.channel.id;

    this.messageHandler({
      platform: "discord",
      channelId,
      threadId,
      messageId: msg.id,
      userId: msg.author.id,
      userName: msg.author.username,
      content: msg.content,
      attachments: msg.attachments.map(a => ({
        filename: a.name ?? "file",
        content: Buffer.alloc(0),
        mimeType: a.contentType ?? undefined,
      })),
      replyToMessageId: msg.reference?.messageId ?? undefined,
    });
  }

  private handleReaction(reaction: MessageReaction, user: User): void {
    if (user.bot) return;
    if (!this.reactionHandler) return;

    const channel = reaction.message.channel;
    const isThread = channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread;

    if (!isThread) return;

    this.reactionHandler({
      platform: "discord",
      channelId: (channel as ThreadChannel).parentId!,
      threadId: channel.id,
      messageId: reaction.message.id,
      emoji: reaction.emoji.name ?? "❓",
      userId: user.id,
    });
  }
}
