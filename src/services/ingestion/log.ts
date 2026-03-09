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
  entityExtractionStatus?: 'success' | 'failed' | 'skipped';
  entityExtractionError?: string;
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

  // Auto-clear stuck runs older than the window — they crashed without completing
  await sqlite.query(
    `UPDATE ingestion_runs
     SET status = 'failed', completed_at = datetime('now'),
         error = 'Auto-cleared: exceeded maximum run duration'
     WHERE status = 'running'
       AND datetime(started_at) <= datetime('now', ?)`,
    [`-${windowMinutes} minutes`]
  );

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

// ---------------------------------------------------------------------------
// Extraction failure cooldown — prevents retrying the same broken URL every hour
// ---------------------------------------------------------------------------

async function ensureIngestionFailuresTable(): Promise<void> {
  const sqlite = getSQLiteClient();
  await sqlite.query(`
    CREATE TABLE IF NOT EXISTS ingestion_failures (
      url TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT,
      failure_count INTEGER NOT NULL DEFAULT 1,
      last_error TEXT,
      first_failed_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_failed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Cooldown hours based on failure count:
 *  1 failure  →  6 hours
 *  2 failures → 24 hours
 *  3+ failures → 72 hours
 */
function cooldownHours(failureCount: number): number {
  if (failureCount <= 1) return 6;
  if (failureCount <= 2) return 24;
  return 72;
}

export async function hasRecentFailure(url: string): Promise<{ coolingDown: boolean; failureCount: number; lastError?: string }> {
  await ensureIngestionFailuresTable();
  const sqlite = getSQLiteClient();
  const result = await sqlite.query<{
    failure_count: number;
    last_failed_at: string;
    last_error: string | null;
  }>(
    'SELECT failure_count, last_failed_at, last_error FROM ingestion_failures WHERE url = ?',
    [url]
  );

  if (result.rows.length === 0) {
    return { coolingDown: false, failureCount: 0 };
  }

  const row = result.rows[0];
  const count = Number(row.failure_count);
  const hours = cooldownHours(count);

  const coolingDown = await sqlite.query<{ c: number }>(
    `SELECT COUNT(*) as c FROM ingestion_failures
     WHERE url = ? AND datetime(last_failed_at) > datetime('now', ?)`,
    [url, `-${hours} hours`]
  );

  return {
    coolingDown: Number(coolingDown.rows[0]?.c || 0) > 0,
    failureCount: count,
    lastError: row.last_error || undefined,
  };
}

export async function recordFailure(url: string, source: string, title: string, error: string): Promise<void> {
  await ensureIngestionFailuresTable();
  const sqlite = getSQLiteClient();
  await sqlite.query(
    `INSERT INTO ingestion_failures (url, source, title, failure_count, last_error, first_failed_at, last_failed_at)
     VALUES (?, ?, ?, 1, ?, datetime('now'), datetime('now'))
     ON CONFLICT(url) DO UPDATE SET
       failure_count = failure_count + 1,
       last_error = excluded.last_error,
       last_failed_at = datetime('now'),
       title = excluded.title`,
    [url, source, title, error]
  );
}

export async function clearFailure(url: string): Promise<void> {
  await ensureIngestionFailuresTable();
  const sqlite = getSQLiteClient();
  await sqlite.query('DELETE FROM ingestion_failures WHERE url = ?', [url]);
}
