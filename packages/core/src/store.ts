import Database from "better-sqlite3";
import type { Platform } from "./types.js";

export type ThreadStatus = "active" | "done" | "archived";

export const THREAD_STATUS_ICONS: Record<ThreadStatus, string> = {
  active: "🔄",
  done: "✅",
  archived: "📦",
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
  cache_read_tokens: number;
  cache_creation_tokens: number;
  model: string | null;
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

  private getSchemaVersion(): number {
    try {
      const row = this.db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | undefined;
      return row?.version ?? 0;
    } catch {
      return 0;
    }
  }

  private setSchemaVersion(version: number): void {
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
    this.db.exec("DELETE FROM schema_version");
    this.db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
  }

  private migrate(): void {
    const addCol = (table: string, column: string, def: string) => {
      try { this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`); } catch { /* already exists */ }
    };
    const version = this.getSchemaVersion();

    // v0 → v1: initial schema
    if (version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS threads (
          thread_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          project_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          name TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (thread_id, platform)
        );

        CREATE TABLE IF NOT EXISTS messages (
          message_id TEXT NOT NULL,
          platform TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          is_bot BOOLEAN NOT NULL DEFAULT FALSE,
          content_summary TEXT,
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          cache_read_tokens INTEGER DEFAULT 0,
          cache_creation_tokens INTEGER DEFAULT 0,
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

      // Compat: add columns that may be missing in pre-versioned databases
      addCol("threads", "status", "TEXT NOT NULL DEFAULT 'active'");
      addCol("threads", "name", "TEXT");
      addCol("messages", "input_tokens", "INTEGER DEFAULT 0");
      addCol("messages", "output_tokens", "INTEGER DEFAULT 0");
      addCol("messages", "cache_read_tokens", "INTEGER DEFAULT 0");
      addCol("messages", "cache_creation_tokens", "INTEGER DEFAULT 0");
      addCol("messages", "model", "TEXT");
    }

    // v1 → v2: add indexes for query performance
    if (version < 2) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, platform);
        CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_name, status);
      `);
    }

    // v2 → v3: drop token_usage table, add model to messages, migrate data
    if (version < 3) {
      addCol("messages", "model", "TEXT");
      // Migrate token_usage data into messages if the table exists
      try {
        const hasTokenUsage = this.db.prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='token_usage'"
        ).get();
        if (hasTokenUsage) {
          this.db.exec("DROP TABLE IF EXISTS token_usage");
        }
      } catch { /* table doesn't exist, nothing to migrate */ }
      // Drop obsolete indexes
      this.db.exec("DROP INDEX IF EXISTS idx_token_usage_session");
      this.db.exec("DROP INDEX IF EXISTS idx_token_usage_project");
    }

    this.setSchemaVersion(3);
  }

  upsertThread(threadId: string, platform: Platform, channelId: string, sessionId: string, projectName: string, name?: string): void {
    if (name) {
      this.db.prepare(`
        INSERT INTO threads (thread_id, platform, channel_id, session_id, project_name, name)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, platform) DO UPDATE SET session_id = excluded.session_id, name = excluded.name
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

  archiveThread(threadId: string, platform?: Platform): void {
    if (platform) {
      this.db.prepare(
        "UPDATE threads SET status = 'archived' WHERE thread_id = ? AND platform = ?"
      ).run(threadId, platform);
    } else {
      // Fallback: archive across all platforms (used by web API which has no platform context)
      this.db.prepare(
        "UPDATE threads SET status = 'archived' WHERE thread_id = ?"
      ).run(threadId);
    }
  }

  deleteThread(threadId: string, platform: Platform): void {
    this.db.prepare("DELETE FROM messages WHERE thread_id = ? AND platform = ?").run(threadId, platform);
    this.db.prepare("DELETE FROM threads WHERE thread_id = ? AND platform = ?").run(threadId, platform);
  }

  saveMessage(messageId: string, platform: Platform, threadId: string, isBot: boolean, contentSummary?: string, inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0, model?: string | null): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO messages (message_id, platform, thread_id, is_bot, content_summary, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, platform, threadId, isBot ? 1 : 0, contentSummary ?? null, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, model ?? null);
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

  listSessions(projectName?: string, includeArchived = false): ThreadRow[] {
    const statusFilter = includeArchived ? "" : "status != 'archived'";
    if (projectName) {
      const where = statusFilter ? `project_name = ? AND ${statusFilter}` : "project_name = ?";
      return this.db.prepare(
        `SELECT * FROM threads WHERE ${where} ORDER BY created_at DESC`
      ).all(projectName) as ThreadRow[];
    }
    const where = statusFilter ? `WHERE ${statusFilter}` : "";
    return this.db.prepare(
      `SELECT * FROM threads ${where} ORDER BY created_at DESC`
    ).all() as ThreadRow[];
  }

  /** Aggregate tokens for a thread (by thread_id) from bot messages */
  getSessionTokens(threadId: string): TokenStats {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0) as inputTokens,
        COALESCE(SUM(output_tokens), 0) as outputTokens,
        COALESCE(SUM(cache_read_tokens), 0) as cacheReadTokens,
        COALESCE(SUM(cache_creation_tokens), 0) as cacheCreationTokens
      FROM messages WHERE thread_id = ? AND is_bot = 1
    `).get(threadId) as TokenStats;
    return row;
  }

  /** Aggregate tokens for a project from bot messages via threads */
  getProjectTokens(projectName: string): TokenStats {
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(m.input_tokens), 0) as inputTokens,
        COALESCE(SUM(m.output_tokens), 0) as outputTokens,
        COALESCE(SUM(m.cache_read_tokens), 0) as cacheReadTokens,
        COALESCE(SUM(m.cache_creation_tokens), 0) as cacheCreationTokens
      FROM messages m
      JOIN threads t ON t.thread_id = m.thread_id AND t.platform = m.platform
      WHERE t.project_name = ? AND m.is_bot = 1
    `).get(projectName) as TokenStats;
    return row;
  }

  /** Daily token breakdown by model for a project */
  getDailyTokens(projectName: string): DailyTokenStats[] {
    return this.db.prepare(`
      SELECT
        DATE(m.created_at) as date,
        m.model,
        COALESCE(SUM(m.input_tokens), 0) as inputTokens,
        COALESCE(SUM(m.output_tokens), 0) as outputTokens,
        COALESCE(SUM(m.cache_read_tokens), 0) as cacheReadTokens,
        COALESCE(SUM(m.cache_creation_tokens), 0) as cacheCreationTokens
      FROM messages m
      JOIN threads t ON t.thread_id = m.thread_id AND t.platform = m.platform
      WHERE t.project_name = ? AND m.is_bot = 1
      GROUP BY DATE(m.created_at), m.model
      ORDER BY date DESC
    `).all(projectName) as DailyTokenStats[];
  }

  /** Overview: per-session token totals with thread metadata */
  getOverviewTokens(since: string | null): OverviewTokenRow[] {
    const sql = `
      SELECT
        t.project_name AS projectName,
        t.thread_id AS sessionId,
        t.platform,
        t.name AS sessionName,
        t.created_at AS sessionCreatedAt,
        COALESCE(SUM(m.input_tokens), 0) AS inputTokens,
        COALESCE(SUM(m.output_tokens), 0) AS outputTokens,
        COALESCE(SUM(m.cache_read_tokens), 0) AS cacheReadTokens,
        COALESCE(SUM(m.cache_creation_tokens), 0) AS cacheCreationTokens
      FROM threads t
      LEFT JOIN messages m ON m.thread_id = t.thread_id AND m.platform = t.platform AND m.is_bot = 1
      WHERE (? IS NULL OR t.created_at >= ?)
      GROUP BY t.thread_id, t.platform
      ORDER BY t.project_name, SUM(m.input_tokens + m.output_tokens) DESC
    `;
    return this.db.prepare(sql).all(since, since) as OverviewTokenRow[];
  }

  close(): void {
    this.db.close();
  }
}
