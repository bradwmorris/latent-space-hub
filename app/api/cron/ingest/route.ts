import { NextRequest, NextResponse } from 'next/server';
import { checkAndIngest } from '@/services/ingestion';
import { IngestionSourceKey } from '@/services/ingestion/sources';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parseSource(value: string | null): IngestionSourceKey | undefined {
  if (!value) return undefined;
  if (value === 'podcasts' || value === 'latentspacetv' || value === 'articles' || value === 'ainews') {
    return value;
  }
  return undefined;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[cron/ingest] CRON_SECRET is not configured');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const source = parseSource(searchParams.get('source'));
  if (searchParams.get('source') && !source) {
    return NextResponse.json({ success: false, error: 'Invalid source value' }, { status: 400 });
  }

  const dryRun = searchParams.get('dry_run') === 'true' || searchParams.get('dryRun') === 'true';
  const maxItemsPerSource = Number(searchParams.get('limit') || '10');

  const summary = await checkAndIngest({
    source,
    dryRun,
    maxDurationMs: 55_000,
    maxItemsPerSource: Number.isFinite(maxItemsPerSource) ? Math.max(1, Math.min(maxItemsPerSource, 25)) : 10,
  });

  const status = summary.status === 'failed' ? 500 : 200;
  return NextResponse.json({ success: summary.status !== 'failed', data: summary }, { status });
}
