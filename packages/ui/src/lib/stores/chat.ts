import { writable } from "svelte/store";
import { on, send } from "./connection.js";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tokens?: { input: number; output: number };
  streaming?: boolean;
}

export interface Session {
  id: string | null;
  project: string;
  messages: ChatMessage[];
}

export const currentProject = writable<string | null>(null);
export const currentSessionId = writable<string | null>(null);
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
          },
        };
        const newMessages = [...session.messages.slice(0, -1), updated];
        const newSession = {
          ...session,
          messages: newMessages,
          id: event.realSessionId ?? session.id,
        };
        const newMap = new Map(s);
        newMap.set(sessKey, newSession);
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

export function sendMessage(project: string, message: string, sessionId?: string): void {
  const msgId = crypto.randomUUID();
  const sessKey = sessionId ?? `new-${project}`;
  const threadKey = `web:${project}:${Date.now()}`;

  // Map threadKey so we can correlate server responses to our local session
  threadKeyMap.set(threadKey, sessKey);

  sessions.update(s => {
    if (!s.has(sessKey)) {
      s.set(sessKey, { id: sessionId ?? null, project, messages: [] });
    }
    const session = s.get(sessKey)!;
    session.messages.push({ id: msgId, role: "user", content: message });
    session.messages.push({ id: msgId + "-reply", role: "assistant", content: "", streaming: true });
    return s;
  });

  streamBuffer = "";
  send({ type: "chat.send", project, sessionId, message, threadKey });
}
