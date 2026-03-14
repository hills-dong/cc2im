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

on("chat.stream", (event) => {
  if (event.contentType === "text") {
    streamBuffer += event.content;
    sessions.update(s => {
      const key = event.sessionId;
      const session = s.get(key);
      if (session) {
        const last = session.messages[session.messages.length - 1];
        if (last?.streaming) {
          last.content = streamBuffer;
        }
      }
      return s;
    });
  }
});

on("chat.done", (event) => {
  streamBuffer = "";
  sessions.update(s => {
    const session = s.get(event.sessionId);
    if (session) {
      const last = session.messages[session.messages.length - 1];
      if (last) {
        last.content = event.result;
        last.streaming = false;
        last.tokens = { input: event.tokens.inputTokens, output: event.tokens.outputTokens };
      }
    }
    return s;
  });
});

export function sendMessage(project: string, message: string, sessionId?: string): void {
  const msgId = crypto.randomUUID();
  const sessKey = sessionId ?? `new-${Date.now()}`;

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
  send({ type: "chat.send", project, sessionId, message });
}
