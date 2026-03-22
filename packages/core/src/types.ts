export type Platform = "lark" | "discord" | "web";

export interface Attachment {
  filename: string;
  content: Buffer;
  mimeType?: string;
}

export interface IncomingMessage {
  platform: Platform;
  channelId: string;
  threadId: string | null;
  messageId: string;
  userId: string;
  userName: string;
  content: string;
  attachments: Attachment[];
  replyToMessageId?: string;
}

export interface Reaction {
  platform: Platform;
  channelId: string;
  threadId: string;
  messageId: string;
  emoji: string;
  userId: string;
}

export interface OutgoingMessage {
  threadId: string;
  content: string;
  attachments: Attachment[];
  reactions: string[];
}

export interface ProjectConfig {
  name: string;
  directory: string;
  model?: string;
  platforms: Partial<Record<Platform, boolean>>;
}

export interface ChannelInfo {
  channelId: string;
  platform: Platform;
  projectName: string;
}

export interface ClaudeConfig {
  command: string;
  defaultArgs: string[];
  bufferInterval: number;
  timeout: number;
}

export interface FormatterConfig {
  maxMessageLength: Record<Platform, number>;
  maxConcurrentProcesses: number;
}

export interface AppConfig {
  lark: { appId: string; appSecret: string; ownerOpenId?: string };
  discord: { token: string };
  projects: ProjectConfig[];
  claude: ClaudeConfig;
  formatter: FormatterConfig;
}

// Claude Code stream-json event types
export interface StreamInitEvent {
  type: "system";
  subtype: "init";
  session_id: string;
}

export interface StreamAssistantEvent {
  type: "assistant";
  message: {
    content: Array<{ type: string; text?: string }>;
  };
}

export interface StreamResultEvent {
  type: "result";
  subtype: "success" | "error";
  result: string;
  session_id: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export type StreamEvent = StreamInitEvent | StreamAssistantEvent | StreamResultEvent | { type: string; [key: string]: unknown };

export interface PlatformAdapter {
  readonly platform: Platform;
  start(): Promise<void>;
  stop(): Promise<void>;
  setupProject(project: ProjectConfig, store?: any): Promise<ChannelInfo>;
  createThread(channelId: string, messageId: string): Promise<string>;
  getThreadName(threadId: string): Promise<string>;
  renameThread(threadId: string, name: string): Promise<void>;
  sendMessage(channelId: string, threadId: string, content: string): Promise<string>;
  editMessage(channelId: string, messageId: string, content: string): Promise<void>;
  uploadFile(channelId: string, threadId: string, filename: string, content: Buffer): Promise<void>;
  addReaction(channelId: string, messageId: string, emoji: string): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => void): void;
  onReaction(handler: (reaction: Reaction) => void): void;
}
