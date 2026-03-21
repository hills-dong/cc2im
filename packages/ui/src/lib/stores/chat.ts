import { writable } from "svelte/store";
import { on, send } from "./connection.js";

function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (HTTP)
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

let streamBuffer = "";
// Map server threadKey → client sessKey for correlating responses
const threadKeyMap = new Map<string, string>();

on("chat.stream", (event) => {
  if (event.contentType === "text") {
    streamBuffer += event.content;
    const sessKey = threadKeyMap.get(event.sessionId) ?? event.sessionId;
    sessions.update(s => {
      const session = s.get(sessKey);
      if (session) {
        const last = session.messages[session.messages.length - 1];
        if (last?.streaming) {
          // Create new objects so Svelte 5 $derived detects changes
          const updated = { ...last, content: streamBuffer };
          const newMessages = [...session.messages.slice(0, -1), updated];
          const newSession = { ...session, messages: newMessages };
          const newMap = new Map(s);
          newMap.set(sessKey, newSession);
          return newMap;
        }
      }
      return s;
    });
  }
});

on("chat.done", (event) => {
  const sessKey = threadKeyMap.get(event.sessionId) ?? event.sessionId;
  streamBuffer = "";
  sessions.update(s => {
    const session = s.get(sessKey);
    if (session) {
      const last = session.messages[session.messages.length - 1];
      if (last) {
        const updated = {
          ...last,
          content: event.result,
          streaming: false,
          tokens: {
            input: event.tokens?.inputTokens ?? 0,
            output: event.tokens?.outputTokens ?? 0,
            cacheRead: event.tokens?.cacheReadTokens ?? 0,
            cacheCreation: event.tokens?.cacheCreationTokens ?? 0,
          },
        };
        const newMessages = [...session.messages.slice(0, -1), updated];
        const realId = event.realSessionId ?? session.id;
        const newSession = {
          ...session,
          messages: newMessages,
          id: realId,
        };
        const newMap = new Map(s);
        newMap.set(sessKey, newSession);
        // Also store under the real session ID and threadKey so the session page can find it after navigation
        if (realId && realId !== sessKey) {
          newMap.set(realId, newSession);
        }
        if (session.threadKey && session.threadKey !== sessKey) {
          newMap.set(session.threadKey, newSession);
        }
        return newMap;
      }
    }
    return s;
  });
  threadKeyMap.delete(event.sessionId);
});

on("chat.error", (event) => {
  const sessKey = threadKeyMap.get(event.sessionId) ?? event.sessionId;
  streamBuffer = "";
  sessions.update(s => {
    const session = s.get(sessKey);
    if (session) {
      const last = session.messages[session.messages.length - 1];
      if (last?.streaming) {
        const updated = {
          ...last,
          content: `Error: ${event.error?.message ?? "Unknown error"}`,
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
  threadKeyMap.delete(event.sessionId);
});

export async function loadSession(baseUrl: string, threadId: string, project: string): Promise<void> {
  let existing: Session | undefined;
  sessions.update(s => { existing = s.get(threadId); return s; });
  if (existing && existing.messages.length > 0) return;

  try {
    const res = await fetch(`${baseUrl}/api/sessions/${encodeURIComponent(threadId)}/messages`);
    if (!res.ok) return;
    const rows: Array<{ message_id: string; is_bot: number; content_summary: string | null; input_tokens?: number; output_tokens?: number; created_at: string }> = await res.json();
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

    // Subscribe to this thread's events so we receive any in-progress or future messages
    send({ type: "chat.subscribe", threadKey: threadId });
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

  streamBuffer = "";
  send({ type: "chat.subscribe", threadKey });
  send({ type: "chat.send", project, sessionId, message, threadKey });
}
