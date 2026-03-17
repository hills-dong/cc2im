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
  name?: string;
  created_at: string;
}

export interface MessageRow {
  message_id: string;
  platform: string;
  thread_id: string;
  is_bot: number;
  content_summary: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface DailyTokenStats extends TokenStats {
  date: string;
  model: string | null;
}

export interface OverviewTokenRow {
  projectName: string;
  sessionId: string;
  platform: string | null;
  sessionName: string | null;
  sessionCreatedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
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

      CREATE TABLE IF NOT EXISTS token_usage (
        id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        model TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cache_read_tokens INTEGER DEFAULT 0,
        cache_creation_tokens INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add status column to existing databases
    try {
      this.db.exec("ALTER TABLE threads ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
    } catch {
      // Column already exists
    }

    // Add name column to existing databases
    try {
      this.db.exec("ALTER TABLE threads ADD COLUMN name TEXT");
    } catch {
      // Column already exists
    }

    // Add token columns to messages table
    try {
      this.db.exec("ALTER TABLE messages ADD COLUMN input_tokens INTEGER DEFAULT 0");
      this.db.exec("ALTER TABLE messages ADD COLUMN output_tokens INTEGER DEFAULT 0");
    } catch {
      // Columns already exist
    }
  }

  upsertThread(threadId: string, platform: Platform, channelId: string, sessionId: string, projectName: string, name?: string): void {
    if (name) {
      this.db.prepare(`
        INSERT INTO threads (thread_id, platform, channel_id, session_id, project_name, name)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, platform) DO UPDATE SET session_id = excluded.session_id
      `).run(threadId, platform, channelId, sessionId, projectName, name);
    } else {
      this.db.prepare(`
        INSERT INTO threads (thread_id, platform, channel_id, session_id, project_name)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, platform) DO UPDATE SET session_id = excluded.session_id
      `).run(threadId, platform, channelId, sessionId, projectName);
    }
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

  saveMessage(messageId: string, platform: Platform, threadId: string, isBot: boolean, contentSummary?: string, inputTokens = 0, outputTokens = 0): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO messages (message_id, platform, thread_id, is_bot, content_summary, input_tokens, output_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, platform, threadId, isBot ? 1 : 0, contentSummary ?? null, inputTokens, outputTokens);
  }

  getMessage(messageId: string, platform: Platform): MessageRow | null {
    return (this.db.prepare(
      "SELECT * FROM messages WHERE message_id = ? AND platform = ?"
    ).get(messageId, platform) as MessageRow | undefined) ?? null;
  }

  getLastBotMessage(threadId: string, platform: Platform): MessageRow | null {
    return (this.db.prepare(
      "SELECT * FROM messages WHERE thread_id = ? AND platform = ? AND is_bot = 1 ORDER BY created_at DESC LIMIT 1"
    ).get(threadId, platform) as MessageRow | undefined) ?? null;
  }

  getMessagesByThread(threadId: string, platform: Platform): MessageRow[] {
    return this.db.prepare(
      "SELECT * FROM messages WHERE thread_id = ? AND platform = ? ORDER BY created_at ASC"
    ).all(threadId, platform) as MessageRow[];
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

  listSessions(projectName?: string): ThreadRow[] {
    if (projectName) {
      return this.db.prepare(
        "SELECT * FROM threads WHERE project_name = ? ORDER BY created_at DESC"
      ).all(projectName) as ThreadRow[];
    }
    return this.db.prepare(
      "SELECT * FROM threads ORDER BY created_at DESC"
    ).all() as ThreadRow[];
  }

  saveTokenUsage(
    sessionId: string, projectName: string, model: string | null,
    inputTokens: number, outputTokens: number,
    cacheReadTokens: number, cacheCreationTokens: number,
  ): void {
    this.db.prepare(`
      INSERT INTO token_usage (session_id, project_name, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, projectName, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);
  }

  getSessionTokens(sessionId: string): TokenStats {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0) as inputTokens,
        COALESCE(SUM(output_tokens), 0) as outputTokens,
        COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
        COALESCE(SUM(cache_creation_tokens), 0) as cacheCreationTokens
      FROM token_usage WHERE session_id = ?
    `).get(sessionId) as TokenStats;
    return row;
  }

  getProjectTokens(projectName: string): TokenStats {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0) as inputTokens,
        COALESCE(SUM(output_tokens), 0) as outputTokens,
        COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
        COALESCE(SUM(cache_creation_tokens), 0) as cacheCreationTokens
      FROM token_usage WHERE project_name = ?
    `).get(projectName) as TokenStats;
    return row;
  }

  getDailyTokens(projectName: string): DailyTokenStats[] {
    return this.db.prepare(`
      SELECT
        DATE(created_at) as date,
        model,
        COALESCE(SUM(input_tokens), 0) as inputTokens,
        COALESCE(SUM(output_tokens), 0) as outputTokens,
        COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
        COALESCE(SUM(cache_creation_tokens), 0) as cacheCreationTokens
      FROM token_usage
      WHERE project_name = ?
      GROUP BY DATE(created_at), model
      ORDER BY date DESC
    `).all(projectName) as DailyTokenStats[];
  }

  getOverviewTokens(since: string | null): OverviewTokenRow[] {
    const sql = `
      SELECT
        tu.project_name AS projectName,
        tu.session_id AS sessionId,
        ts.platform,
        ts.sessionName,
        ts.sessionCreatedAt,
        COALESCE(SUM(tu.input_tokens), 0) AS inputTokens,
        COALESCE(SUM(tu.output_tokens), 0) AS outputTokens,
        COALESCE(SUM(tu.cache_read_tokens), 0) AS cacheReadTokens,
        COALESCE(SUM(tu.cache_creation_tokens), 0) AS cacheCreationTokens
      FROM token_usage tu
      LEFT JOIN (
        SELECT session_id,
               MIN(platform) AS platform,
               MIN(name) AS sessionName,
               MIN(created_at) AS sessionCreatedAt
        FROM threads
        GROUP BY session_id
      ) ts ON ts.session_id = tu.session_id
      WHERE (? IS NULL OR tu.created_at >= ?)
      GROUP BY tu.project_name, tu.session_id
      ORDER BY tu.project_name, SUM(tu.input_tokens + tu.output_tokens) DESC
    `;
    return this.db.prepare(sql).all(since, since) as OverviewTokenRow[];
  }

  close(): void {
    this.db.close();
  }
}
