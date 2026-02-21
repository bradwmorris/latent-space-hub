import { getSQLiteClient } from '@/services/database/sqlite-client';
import { IngestionSourceKey } from './sources';

export type IngestionRunStatus = 'running' | 'completed' | 'failed';

export interface IngestionRunDetails {
  source: IngestionSourceKey;
  itemId: string;
  title: string;
  status: 'ingested' | 'skipped' | 'failed' | 'dry_run';
  nodeId?: number;
  message?: string;
  chunksCreated?: number;
}

export interface IngestionRunRow {
  id: number;
  started_at: string;
  completed_at?: string | null;
  status: IngestionRunStatus;
  source?: string | null;
  items_found: number;
  items_ingested: number;
  items_skipped: number;
  items_failed: number;
  details?: string | null;
  error?: string | null;
  duration_ms?: number | null;
}

export async function ensureIngestionRunsTable(): Promise<void> {
  const sqlite = getSQLiteClient();
  await sqlite.query(`
    CREATE TABLE IF NOT EXISTS ingestion_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      source TEXT,
      items_found INTEGER DEFAULT 0,
      items_ingested INTEGER DEFAULT 0,
      items_skipped INTEGER DEFAULT 0,
      items_failed INTEGER DEFAULT 0,
      details TEXT,
      error TEXT,
      duration_ms INTEGER
    )
  `);

  await sqlite.query(
    'CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started_at ON ingestion_runs(started_at DESC)'
  );
  await sqlite.query(
    'CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status ON ingestion_runs(status)'
  );
}

export async function hasActiveRun(windowMinutes = 30): Promise<boolean> {
  await ensureIngestionRunsTable();
  const sqlite = getSQLiteClient();
  const result = await sqlite.query<{ c: number }>(
    `SELECT COUNT(*) as c
     FROM ingestion_runs
     WHERE status = 'running'
       AND datetime(started_at) > datetime('now', ?)` ,
    [`-${windowMinutes} minutes`]
  );
  return Number(result.rows[0]?.c || 0) > 0;
}

export async function startIngestionRun(source: IngestionSourceKey | 'all'): Promise<number> {
  await ensureIngestionRunsTable();
  const sqlite = getSQLiteClient();
  const result = await sqlite.query(
    `INSERT INTO ingestion_runs (status, source, started_at)
     VALUES ('running', ?, datetime('now'))`,
    [source]
  );
  if (!result.lastInsertRowid) {
    throw new Error('Failed to create ingestion run');
  }
  return result.lastInsertRowid;
}

export async function completeIngestionRun(params: {
  runId: number;
  status: IngestionRunStatus;
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  details: IngestionRunDetails[];
  error?: string;
}): Promise<void> {
  const sqlite = getSQLiteClient();
  await sqlite.query(
    `UPDATE ingestion_runs
     SET completed_at = datetime('now'),
         status = ?,
         items_found = ?,
         items_ingested = ?,
         items_skipped = ?,
         items_failed = ?,
         details = ?,
         error = ?,
         duration_ms = CAST((julianday(datetime('now')) - julianday(started_at)) * 86400000 AS INTEGER)
     WHERE id = ?`,
    [
      params.status,
      params.itemsFound,
      params.itemsIngested,
      params.itemsSkipped,
      params.itemsFailed,
      JSON.stringify(params.details),
      params.error || null,
      params.runId,
    ]
  );
}

export async function getRecentIngestionRuns(limit = 20): Promise<IngestionRunRow[]> {
  await ensureIngestionRunsTable();
  const sqlite = getSQLiteClient();
  const result = await sqlite.query<IngestionRunRow>(
    `SELECT id, started_at, completed_at, status, source,
            items_found, items_ingested, items_skipped, items_failed,
            details, error, duration_ms
     FROM ingestion_runs
     ORDER BY id DESC
     LIMIT ?`,
    [limit]
  );
  return result.rows;
}
