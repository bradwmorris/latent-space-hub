import { getSQLiteClient } from './sqlite-client';

export type PaperMention = {
  id: number;
  title: string;
  paper_url: string;
  summary: string;
  source_url: string | null;
  discord_channel_id: string | null;
  discord_message_id: string | null;
  discord_thread_id: string | null;
  suggested_by_discord_id: string | null;
  suggested_by_handle: string | null;
  status: string;
  scheduled_event_node_id: number | null;
  confirmed_by_discord_id: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export class PaperMentionService {
  async ensureTable(): Promise<void> {
    const sqlite = getSQLiteClient();
    await sqlite.batch([
      {
        sql: `CREATE TABLE IF NOT EXISTS paper_mentions (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                paper_url TEXT NOT NULL,
                summary TEXT NOT NULL,
                source_url TEXT,
                discord_channel_id TEXT,
                discord_message_id TEXT UNIQUE,
                discord_thread_id TEXT,
                suggested_by_discord_id TEXT,
                suggested_by_handle TEXT,
                status TEXT NOT NULL DEFAULT 'mentioned',
                scheduled_event_node_id INTEGER,
                confirmed_by_discord_id TEXT,
                confirmed_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
              )`,
      },
      { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_created_at ON paper_mentions(created_at)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_paper_url ON paper_mentions(paper_url)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_status ON paper_mentions(status)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_suggested_by ON paper_mentions(suggested_by_discord_id)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_paper_mentions_thread ON paper_mentions(discord_thread_id)` },
    ]);
  }

  async list(limit = 100): Promise<PaperMention[]> {
    await this.ensureTable();
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<PaperMention>(
      `SELECT id, title, paper_url, summary, source_url,
              discord_channel_id, discord_message_id, discord_thread_id,
              suggested_by_discord_id, suggested_by_handle,
              status, scheduled_event_node_id, confirmed_by_discord_id,
              confirmed_at, created_at, updated_at
       FROM paper_mentions
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT ?`,
      [Math.min(Math.max(limit, 1), 250)]
    );
    return result.rows;
  }
}

export const paperMentionService = new PaperMentionService();
