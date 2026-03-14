import Database from "better-sqlite3";
import type { Platform } from "./types.js";

export type ThreadStatus = "active" | "done";

export const THREAD_STATUS_ICONS: Record<ThreadStatus, string> = {
  active: "🔄",
  done: "✅",
};

export interface ThreadRow {
  thread_id: string;
  platform: string;
  channel_id: string;
  session_id: string;
  project_name: string;
  status: ThreadStatus;
  created_at: string;
}

export interface MessageRow {
  message_id: string;
  platform: string;
  thread_id: string;
  is_bot: number;
  content_summary: string | null;
  created_at: string;
}

export class Store {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        thread_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (thread_id, platform)
      );

      CREATE TABLE IF NOT EXISTS messages (
        message_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        is_bot BOOLEAN NOT NULL DEFAULT FALSE,
        content_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, platform)
      );

      CREATE TABLE IF NOT EXISTS pending_restarts (
        thread_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (thread_id, platform)
      );
    `);

    // Add status column to existing databases
    try {
      this.db.exec("ALTER TABLE threads ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
    } catch {
      // Column already exists
    }
  }

  upsertThread(threadId: string, platform: Platform, channelId: string, sessionId: string, projectName: string): void {
    this.db.prepare(`
      INSERT INTO threads (thread_id, platform, channel_id, session_id, project_name)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(thread_id, platform) DO UPDATE SET session_id = excluded.session_id
    `).run(threadId, platform, channelId, sessionId, projectName);
  }

  getThread(threadId: string, platform: Platform): ThreadRow | null {
    return (this.db.prepare(
      "SELECT * FROM threads WHERE thread_id = ? AND platform = ?"
    ).get(threadId, platform) as ThreadRow | undefined) ?? null;
  }

  updateThreadStatus(threadId: string, platform: Platform, status: ThreadStatus): void {
    this.db.prepare(
      "UPDATE threads SET status = ? WHERE thread_id = ? AND platform = ?"
    ).run(status, threadId, platform);
  }

  deleteThread(threadId: string, platform: Platform): void {
    this.db.prepare("DELETE FROM messages WHERE thread_id = ? AND platform = ?").run(threadId, platform);
    this.db.prepare("DELETE FROM threads WHERE thread_id = ? AND platform = ?").run(threadId, platform);
  }

  saveMessage(messageId: string, platform: Platform, threadId: string, isBot: boolean, contentSummary?: string): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO messages (message_id, platform, thread_id, is_bot, content_summary)
      VALUES (?, ?, ?, ?, ?)
    `).run(messageId, platform, threadId, isBot ? 1 : 0, contentSummary ?? null);
  }

  getMessage(messageId: string, platform: Platform): MessageRow | null {
    return this.db.prepare(
      "SELECT * FROM messages WHERE message_id = ? AND platform = ?"
    ).get(messageId, platform) as MessageRow | null;
  }

  getLastBotMessage(threadId: string, platform: Platform): MessageRow | null {
    return this.db.prepare(
      "SELECT * FROM messages WHERE thread_id = ? AND platform = ? AND is_bot = 1 ORDER BY created_at DESC LIMIT 1"
    ).get(threadId, platform) as MessageRow | null;
  }

  markPendingRestart(threadId: string, platform: Platform): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO pending_restarts (thread_id, platform) VALUES (?, ?)
    `).run(threadId, platform);
  }

  getPendingRestarts(): ThreadRow[] {
    return this.db.prepare(`
      SELECT t.* FROM pending_restarts pr
      JOIN threads t ON t.thread_id = pr.thread_id AND t.platform = pr.platform
    `).all() as ThreadRow[];
  }

  clearPendingRestarts(): void {
    this.db.prepare("DELETE FROM pending_restarts").run();
  }

  close(): void {
    this.db.close();
  }
}
