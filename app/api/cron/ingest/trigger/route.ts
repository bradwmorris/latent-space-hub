import { NextRequest, NextResponse } from 'next/server';
import { checkAndIngest } from '@/services/ingestion';
import { IngestionSourceKey } from '@/services/ingestion/sources';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parseSource(value?: string): IngestionSourceKey | undefined {
  if (!value) return undefined;
  if (value === 'podcasts' || value === 'latentspacetv' || value === 'articles' || value === 'ainews') {
    return value;
  }
  return undefined;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: { source?: string; dry_run?: boolean; limit?: number } = {};
  try {
    body = (await request.json()) as { source?: string; dry_run?: boolean; limit?: number };
  } catch {
    body = {};
  }

  const source = parseSource(body.source);
  if (body.source && !source) {
    return NextResponse.json({ success: false, error: 'Invalid source value' }, { status: 400 });
  }

  const summary = await checkAndIngest({
    source,
    dryRun: Boolean(body.dry_run),
    maxDurationMs: 55_000,
    maxItemsPerSource: body.limit ? Math.max(1, Math.min(body.limit, 25)) : 10,
  });

  const status = summary.status === 'failed' ? 500 : 200;
  return NextResponse.json({ success: summary.status !== 'failed', data: summary }, { status });
}
