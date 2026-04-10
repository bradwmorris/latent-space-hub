import { NextRequest, NextResponse } from 'next/server';
import { reorderBacklogProject } from '@/services/backlog';

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
    const body = await request.json();
    if (!body?.id) {
      return NextResponse.json({ success: false, error: 'Missing required field: id' }, { status: 400 });
    }

    const data = await reorderBacklogProject(body.id, body.beforeId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reorder backlog',
      },
      { status: 500 }
    );
  }
}
