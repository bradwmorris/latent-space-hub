import { getSQLiteClient } from './sqlite-client';

export type PaperMention = {
  id: number;
  title: string;
  paper_url: string;
  summary: string;
  thumbnail_url: string | null;
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
  suggested_by_avatar_url: string | null;
  scheduled_presenter_name: string | null;
  scheduled_presenter_discord_id: string | null;
  scheduled_presenter_avatar_url: string | null;
  scheduled_event_date: string | null;
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
                thumbnail_url TEXT,
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
    await sqlite.query(`ALTER TABLE paper_mentions ADD COLUMN thumbnail_url TEXT`).catch(() => undefined);
  }

  async list(limit = 100): Promise<PaperMention[]> {
    await this.ensureTable();
    const sqlite = getSQLiteClient();
    const result = await sqlite.query<PaperMention>(
      `SELECT pm.id, pm.title, pm.paper_url, pm.summary, pm.source_url,
              pm.thumbnail_url,
              pm.discord_channel_id, pm.discord_message_id, pm.discord_thread_id,
              pm.suggested_by_discord_id, pm.suggested_by_handle,
              pm.status, pm.scheduled_event_node_id, pm.confirmed_by_discord_id,
              pm.confirmed_at, pm.created_at, pm.updated_at,
              json_extract(suggester.metadata, '$.avatar_url') AS suggested_by_avatar_url,
              json_extract(event.metadata, '$.presenter_name') AS scheduled_presenter_name,
              json_extract(event.metadata, '$.presenter_discord_id') AS scheduled_presenter_discord_id,
              json_extract(presenter.metadata, '$.avatar_url') AS scheduled_presenter_avatar_url,
              event.event_date AS scheduled_event_date
       FROM paper_mentions pm
       LEFT JOIN nodes suggester
         ON suggester.node_type = 'member'
        AND (
          json_extract(suggester.metadata, '$.discord_id') = pm.suggested_by_discord_id
          OR lower(json_extract(suggester.metadata, '$.discord_handle')) = lower(pm.suggested_by_handle)
        )
       LEFT JOIN nodes event
         ON event.id = pm.scheduled_event_node_id
        AND event.node_type = 'event'
       LEFT JOIN nodes presenter
         ON presenter.node_type = 'member'
        AND json_extract(presenter.metadata, '$.discord_id') = json_extract(event.metadata, '$.presenter_discord_id')
       ORDER BY datetime(pm.created_at) DESC, pm.id DESC
       LIMIT ?`,
      [Math.min(Math.max(limit, 1), 250)]
    );
    return result.rows;
  }
}

export const paperMentionService = new PaperMentionService();
