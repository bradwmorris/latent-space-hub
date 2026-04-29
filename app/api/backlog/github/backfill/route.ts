import { NextRequest, NextResponse } from 'next/server';
import { backfillGitHubIssues } from '@/services/backlog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.BACKLOG_ADMIN_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const headerSecret = request.headers.get('x-backlog-admin-secret')
    || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || '';
  return headerSecret === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await backfillGitHubIssues();
    return NextResponse.json({ success: true, data: { results } });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to backfill GitHub issues',
      },
      { status: 500 }
    );
  }
}
