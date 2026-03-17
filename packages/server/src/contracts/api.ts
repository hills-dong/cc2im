/** API response envelope for errors */
export interface ApiError {
  error: { code: string; message: string };
}

/** Project CRUD */
export interface ProjectBody {
  name: string;
  directory: string;
  model?: string;
  platforms?: Partial<Record<"lark" | "discord", boolean>>;
}

/** Auth */
export interface LoginRequest { password: string }
export interface LoginResponse { token: string; expiresIn: number }

/** Token stats */
export interface TokenStatsResponse {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** WS events — client to server */
export interface WsChatSend {
  type: "chat.send";
  project: string;
  sessionId?: string;
  message: string;
  images?: string[];
}

export interface WsChatAbort {
  type: "chat.abort";
  project: string;
  sessionId: string;
}

export interface WsSyncState {
  type: "sync.state";
}

export type WsClientEvent = WsChatSend | WsChatAbort | WsSyncState;

/** WS events — server to client */
export interface WsChatStream {
  type: "chat.stream";
  sessionId: string;
  contentType: "text" | "tool_use";
  content: string;
}

export interface WsChatDone {
  type: "chat.done";
  sessionId: string;
  result: string;
  tokens: TokenStatsResponse;
}

export interface WsChatError {
  type: "chat.error";
  sessionId: string;
  error: { code: string; message: string };
}

export interface WsStatusUpdate {
  type: "status.update";
  activeCount: number;
  queued: number;
}

export interface WsSyncStateResponse {
  type: "sync.state";
  activeSessions: Array<{ sessionId: string; project: string }>;
  bufferedOutput: Record<string, string>;
}

export type WsServerEvent = WsChatStream | WsChatDone | WsChatError | WsStatusUpdate | WsSyncStateResponse;

/** Token stats overview */
export type WindowParam = "24h" | "7d" | "all";

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface SessionOverview {
  sessionId: string;
  platform: string | null;
  name: string | null;
  createdAt: string | null;
  total: TokenTotals;
}

export interface ProjectOverview {
  name: string;
  total: TokenTotals;
  sessions: SessionOverview[];
}

export interface OverviewResponse {
  window: WindowParam;
  total: TokenTotals;
  projects: ProjectOverview[];
}
