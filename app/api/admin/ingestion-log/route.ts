import { NextRequest, NextResponse } from 'next/server';
import { getRecentIngestionRuns } from '@/services/ingestion/log';

export const runtime = 'nodejs';

interface IngestionRunResponse {
  id: number;
  started_at: string;
  completed_at?: string | null;
  status: string;
  source?: string | null;
  items_found: number;
  items_ingested: number;
  items_skipped: number;
  items_failed: number;
  duration_ms?: number | null;
  error?: string | null;
  details: unknown[];
}

function parseDetails(input?: string | null): unknown[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = Number(searchParams.get('limit') || '25');
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 25;

  const rows = await getRecentIngestionRuns(safeLimit);
  const runs: IngestionRunResponse[] = rows.map((row) => ({
    id: row.id,
    started_at: row.started_at,
    completed_at: row.completed_at,
    status: row.status,
    source: row.source,
    items_found: Number(row.items_found || 0),
    items_ingested: Number(row.items_ingested || 0),
    items_skipped: Number(row.items_skipped || 0),
    items_failed: Number(row.items_failed || 0),
    duration_ms: row.duration_ms,
    error: row.error,
    details: parseDetails(row.details),
  }));

  const now = Date.now();
  const aggregateWindow = (days: number) => {
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return runs
      .filter((run) => {
        const startedAt = new Date(run.started_at).getTime();
        return Number.isFinite(startedAt) && startedAt >= cutoff;
      })
      .reduce(
        (acc, run) => {
          acc.items_found += run.items_found;
          acc.items_ingested += run.items_ingested;
          acc.items_skipped += run.items_skipped;
          acc.items_failed += run.items_failed;
          return acc;
        },
        { items_found: 0, items_ingested: 0, items_skipped: 0, items_failed: 0 }
      );
  };

  const sourceHealth = runs
    .filter((run) => run.status === 'completed')
    .reduce<Record<string, string>>((acc, run) => {
      if (!run.source) return acc;
      if (!acc[run.source]) {
        acc[run.source] = run.started_at;
      }
      return acc;
    }, {});

  return NextResponse.json({
    success: true,
    data: {
      last_run: runs[0] || null,
      windows: {
        last_24h: aggregateWindow(1),
        last_7d: aggregateWindow(7),
        last_30d: aggregateWindow(30),
      },
      source_health: sourceHealth,
      runs,
    },
  });
}
