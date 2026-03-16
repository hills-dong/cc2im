import {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type Message as DiscordMessage,
  type MessageReaction,
  type User,
  type TextChannel,
  type ThreadChannel,
  type ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import type { PlatformAdapter, IncomingMessage, Reaction, ProjectConfig, ChannelInfo, Platform } from "../types.js";

export class DiscordAdapter implements PlatformAdapter {
  readonly platform: Platform = "discord";
  private client: Client;
  private messageHandler?: (msg: IncomingMessage) => void;
  private reactionHandler?: (reaction: Reaction) => void;
  private slashCommandHandler?: (interaction: ChatInputCommandInteraction) => void;

  constructor(private token: string) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });

    this.client.on("messageCreate", (msg) => {
      this.handleMessage(msg).catch((err) =>
        console.error("[cc2im] Error handling Discord message:", err)
      );
    });
    this.client.on("messageReactionAdd", (reaction, user) =>
      this.handleReaction(reaction as MessageReaction, user as User)
    );
    this.client.on("interactionCreate", (interaction) => {
      if (interaction.isChatInputCommand()) {
        this.slashCommandHandler?.(interaction);
      }
    });
  }

  async start(): Promise<void> {
    await this.client.login(this.token);
    await new Promise<void>((resolve) => {
      if (this.client.isReady()) return resolve();
      this.client.once("ready", () => resolve());
    });
    console.log(`Discord bot logged in as ${this.client.user?.tag}`);
    await this.registerSlashCommands();
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
      // Ensure permissions are up to date on existing channels
      await (existing as TextChannel).permissionOverwrites.set([
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: this.client.user!.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ]);
      return { channelId: existing.id, platform: "discord", projectName: project.name };
    }

    const channel = await guild.channels.create({
      name: `cc2im-${project.name}`,
      type: ChannelType.GuildText,
      topic: `Claude Code project: ${project.name} (${project.directory})`,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: this.client.user!.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ],
    });

    return { channelId: channel.id, platform: "discord", projectName: project.name };
  }

  async createThread(channelId: string, messageId: string): Promise<string> {
    const channel = await this.client.channels.fetch(channelId) as TextChannel;
    const message = await channel.messages.fetch(messageId);
    const thread = await message.startThread({
      name: "New conversation",
      autoArchiveDuration: 1440,
    });
    return thread.id;
  }

  async getThreadName(threadId: string): Promise<string> {
    const thread = await this.client.channels.fetch(threadId) as ThreadChannel;
    return thread.name;
  }

  async renameThread(threadId: string, name: string): Promise<void> {
    const thread = await this.client.channels.fetch(threadId) as ThreadChannel;
    await thread.setName(name);
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

  onSlashCommand(handler: (interaction: ChatInputCommandInteraction) => void): void {
    this.slashCommandHandler = handler;
  }

  private async registerSlashCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder().setName("im-done").setDescription("标记当前 thread 为已完成"),
      new SlashCommandBuilder().setName("im-reopen").setDescription("重新打开当前 thread"),
      new SlashCommandBuilder().setName("im-list-projects").setDescription("列出所有已注册项目"),
      new SlashCommandBuilder().setName("im-reload-config").setDescription("重新加载配置"),
      new SlashCommandBuilder()
        .setName("im-add-project")
        .setDescription("添加新项目")
        .addStringOption(o => o.setName("name").setDescription("项目名称").setRequired(true))
        .addStringOption(o => o.setName("directory").setDescription("项目目录").setRequired(true)),
      new SlashCommandBuilder()
        .setName("im-remove-project")
        .setDescription("移除项目")
        .addStringOption(o => o.setName("name").setDescription("项目名称").setRequired(true)),
    ];

    const rest = new REST().setToken(this.token);
    const appId = this.client.user!.id;
    const body = commands.map(c => c.toJSON());

    // Register per-guild for instant availability
    for (const guild of this.client.guilds.cache.values()) {
      try {
        await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body });
        console.log(`Discord slash commands registered for guild ${guild.name}.`);
      } catch (err) {
        console.error(`Failed to register slash commands for guild ${guild.name}:`, err);
      }
    }
  }

  private async handleMessage(msg: DiscordMessage): Promise<void> {
    if (msg.author.bot) return;
    if (!this.messageHandler) return;

    const isThread = msg.channel.type === ChannelType.PublicThread || msg.channel.type === ChannelType.PrivateThread;
    const threadId = isThread ? msg.channel.id : null;
    const channelId = isThread ? (msg.channel as ThreadChannel).parentId! : msg.channel.id;

    const attachments = await Promise.all(
      msg.attachments.map(async (a) => {
        const response = await fetch(a.url);
        const content = Buffer.from(await response.arrayBuffer());
        return {
          filename: a.name ?? "file",
          content,
          mimeType: a.contentType ?? undefined,
        };
      })
    );

    this.messageHandler({
      platform: "discord",
      channelId,
      threadId,
      messageId: msg.id,
      userId: msg.author.id,
      userName: msg.author.username,
      content: msg.content,
      attachments,
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
