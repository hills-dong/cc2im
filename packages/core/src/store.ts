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

      // Compat: add columns that may be missing in pre-versioned databases
      const addColumnIfMissing = (table: string, column: string, def: string) => {
        try { this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`); } catch { /* already exists */ }
      };
      addColumnIfMissing("threads", "status", "TEXT NOT NULL DEFAULT 'active'");
      addColumnIfMissing("threads", "name", "TEXT");
      addColumnIfMissing("messages", "input_tokens", "INTEGER DEFAULT 0");
      addColumnIfMissing("messages", "output_tokens", "INTEGER DEFAULT 0");
      addColumnIfMissing("messages", "cache_read_tokens", "INTEGER DEFAULT 0");
      addColumnIfMissing("messages", "cache_creation_tokens", "INTEGER DEFAULT 0");
    }

    // v1 → v2: add indexes for query performance
    if (version < 2) {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, platform);
        CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);
        CREATE INDEX IF NOT EXISTS idx_token_usage_project ON token_usage(project_name, created_at);
        CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_name, status);
      `);
    }

    this.setSchemaVersion(2);
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
    // Look up the session_id before deleting so we can clean up token_usage
    const thread = this.getThread(threadId, platform);
    this.db.prepare("DELETE FROM messages WHERE thread_id = ? AND platform = ?").run(threadId, platform);
    this.db.prepare("DELETE FROM threads WHERE thread_id = ? AND platform = ?").run(threadId, platform);
    // Clean up token_usage for this session (by session_id or threadId as fallback key)
    if (thread?.session_id) {
      // Only delete if no other threads still reference this session
      const remaining = this.db.prepare(
        "SELECT 1 FROM threads WHERE session_id = ? LIMIT 1"
      ).get(thread.session_id);
      if (!remaining) {
        this.db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(thread.session_id);
      }
    }
    // Also clean up token_usage keyed by threadId (web sessions before real session_id assigned)
    this.db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(threadId);
  }

  saveMessage(messageId: string, platform: Platform, threadId: string, isBot: boolean, contentSummary?: string, inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO messages (message_id, platform, thread_id, is_bot, content_summary, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, platform, threadId, isBot ? 1 : 0, contentSummary ?? null, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens);
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
    // Two separate JOINs to handle the session_id duality:
    // - ts1: matches by real Claude session_id (grouped to avoid row multiplication)
    // - ts2: matches by thread_id (for web sessions stored with threadKey before real session_id)
    // COALESCE picks whichever matched, preferring ts1 (real session_id)
    const sql = `
      SELECT
        tu.project_name AS projectName,
        tu.session_id AS sessionId,
        COALESCE(ts1.platform, ts2.platform) AS platform,
        COALESCE(ts1.sessionName, ts2.sessionName) AS sessionName,
        COALESCE(ts1.sessionCreatedAt, ts2.sessionCreatedAt) AS sessionCreatedAt,
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
      ) ts1 ON ts1.session_id = tu.session_id
      LEFT JOIN (
        SELECT thread_id,
               platform,
               name AS sessionName,
               created_at AS sessionCreatedAt
        FROM threads
      ) ts2 ON ts2.thread_id = tu.session_id AND ts1.session_id IS NULL
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
