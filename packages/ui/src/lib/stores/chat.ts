import { writable } from "svelte/store";
import { on, send } from "./connection.js";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokens?: { input: number; output: number; cacheRead: number; cacheCreation: number };
  streaming?: boolean;
}

export interface Session {
  id: string | null;
  project: string;
  messages: ChatMessage[];
  threadKey?: string;
  baseInputTokens?: number;
  baseOutputTokens?: number;
  baseCacheReadTokens?: number;
  baseCacheCreationTokens?: number;
}

export const sessions = writable<Map<string, Session>>(new Map());

// Map server threadKey → client sessKey for correlating responses
const threadKeyMap = new Map<string, string>();
// Map server messageId → { sessKey, localMsgId } for correlating updates
const messageIdMap = new Map<string, { sessKey: string; localMsgId: string }>();

// --- chat.message: new message from adapter.sendMessage ---
on("chat.message", (event) => {
  const threadId = event.threadId as string;
  const messageId = event.messageId as string;
  const content = event.content as string;
  const sessKey = threadKeyMap.get(threadId);

  if (!sessKey) return; // Not a thread we're tracking

  sessions.update(s => {
    const session = s.get(sessKey);
    if (!session) return s;

    const last = session.messages[session.messages.length - 1];
    if (last?.streaming) {
      // Update existing streaming assistant message with server's messageId
      const updated = { ...last, content };
      messageIdMap.set(messageId, { sessKey, localMsgId: last.id });
      const newMessages = [...session.messages.slice(0, -1), updated];
      const newMap = new Map(s);
      newMap.set(sessKey, { ...session, messages: newMessages });
      return newMap;
    }

    return s;
  });
});

// --- chat.update: message edited by adapter.editMessage (full content replace) ---
on("chat.update", (event) => {
  const threadId = event.threadId as string;
  const messageId = event.messageId as string;
  const content = event.content as string;

  // Try to find session by messageId mapping first, then by threadKey
  const mapping = messageIdMap.get(messageId);
  const sessKey = mapping?.sessKey ?? threadKeyMap.get(threadId);
  if (!sessKey) return;

  sessions.update(s => {
    const session = s.get(sessKey);
    if (!session) return s;

    const last = session.messages[session.messages.length - 1];
    if (last?.streaming) {
      const updated = { ...last, content };
      const newMessages = [...session.messages.slice(0, -1), updated];
      const newMap = new Map(s);
      newMap.set(sessKey, { ...session, messages: newMessages });
      return newMap;
    }

    return s;
  });
});

// --- chat.done: handleMessage completed, tokens available ---
on("chat.done", (event) => {
  const threadId = event.threadId as string;
  const sessKey = threadKeyMap.get(threadId) ?? threadId;

  sessions.update(s => {
    const session = s.get(sessKey);
    if (session) {
      const last = session.messages[session.messages.length - 1];
      if (last) {
        const tokens = event.tokens as any;
        const updated = {
          ...last,
          streaming: false,
          tokens: {
            input: tokens?.inputTokens ?? 0,
            output: tokens?.outputTokens ?? 0,
            cacheRead: tokens?.cacheReadTokens ?? 0,
            cacheCreation: tokens?.cacheCreationTokens ?? 0,
          },
        };
        const newMessages = [...session.messages.slice(0, -1), updated];
        const newSession = { ...session, messages: newMessages };
        const newMap = new Map(s);
        newMap.set(sessKey, newSession);
        if (session.threadKey && session.threadKey !== sessKey) {
          newMap.set(session.threadKey, newSession);
        }
        return newMap;
      }
    }
    return s;
  });
  threadKeyMap.delete(threadId);
});

// --- chat.error: handleMessage threw ---
on("chat.error", (event) => {
  const threadId = event.threadId as string;
  const sessKey = threadKeyMap.get(threadId) ?? threadId;

  sessions.update(s => {
    const session = s.get(sessKey);
    if (session) {
      const last = session.messages[session.messages.length - 1];
      if (last?.streaming) {
        const error = event.error as any;
        const updated = {
          ...last,
          content: `Error: ${error?.message ?? "Unknown error"}`,
          streaming: false,
        };
        const newMessages = [...session.messages.slice(0, -1), updated];
        const newSession = { ...session, messages: newMessages };
        const newMap = new Map(s);
        newMap.set(sessKey, newSession);
        return newMap;
      }
    }
    return s;
  });
  threadKeyMap.delete(threadId);
});

export async function loadSession(baseUrl: string, threadId: string, project: string): Promise<void> {
  let existing: Session | undefined;
  sessions.update(s => { existing = s.get(threadId); return s; });
  if (existing && existing.messages.length > 0) return;

  try {
    const res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(threadId)}/messages`);
    if (!res.ok) return;
    const rows: Array<{ message_id: string; is_bot: number; content_summary: string | null; input_tokens?: number; output_tokens?: number; cache_read_tokens?: number; cache_creation_tokens?: number; created_at: string }> = await res.json();
    if (rows.length === 0) return;

    const messages: ChatMessage[] = rows.map(r => ({
      id: r.message_id,
      role: r.is_bot ? "assistant" as const : "user" as const,
      content: r.content_summary ?? "",
      ...(r.is_bot && (r.input_tokens || r.output_tokens) ? { tokens: { input: r.input_tokens ?? 0, output: r.output_tokens ?? 0, cacheRead: r.cache_read_tokens ?? 0, cacheCreation: r.cache_creation_tokens ?? 0 } } : {}),
    }));

    // Fetch session-level token totals for historical sessions
    let baseInputTokens = 0;
    let baseOutputTokens = 0;
    let baseCacheReadTokens = 0;
    let baseCacheCreationTokens = 0;
    try {
      const tokenRes = await fetch(`${baseUrl}/api/stats/tokens?session=${encodeURIComponent(threadId)}`);
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        baseInputTokens = tokenData.inputTokens ?? 0;
        baseOutputTokens = tokenData.outputTokens ?? 0;
        baseCacheReadTokens = tokenData.cacheReadTokens ?? 0;
        baseCacheCreationTokens = tokenData.cacheCreationTokens ?? 0;
      }
    } catch {
      // Silently fail
    }

    sessions.update(s => {
      const newMap = new Map(s);
      newMap.set(threadId, { id: threadId, project, messages, threadKey: threadId, baseInputTokens, baseOutputTokens, baseCacheReadTokens, baseCacheCreationTokens });
      return newMap;
    });
  } catch {
    // Silently fail
  }
}

export function sendMessage(project: string, message: string, sessionId?: string): void {
  const msgId = uuid();
  const sessKey = sessionId ?? `new-${project}`;

  // Reuse threadKey from existing session for multi-turn, or create new one
  let threadKey = "";
  sessions.update(s => {
    const existing = s.get(sessKey);
    threadKey = existing?.threadKey ?? `web:${project}:${Date.now()}`;
    return s;
  });

  // Map threadKey so we can correlate server responses to our local session
  threadKeyMap.set(threadKey, sessKey);

  sessions.update(s => {
    const newMap = new Map(s);
    const existing = newMap.get(sessKey);
    const session = existing ?? { id: sessionId ?? null, project, messages: [] };
    const newMessages = [
      ...session.messages,
      { id: msgId, role: "user" as const, content: message },
      { id: msgId + "-reply", role: "assistant" as const, content: "", streaming: true },
    ];
    newMap.set(sessKey, { ...session, messages: newMessages, threadKey });
    return newMap;
  });

  send({ type: "chat.send", project, sessionId, message, threadKey });
}
