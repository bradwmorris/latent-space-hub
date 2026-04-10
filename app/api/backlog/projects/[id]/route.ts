import { NextRequest, NextResponse } from 'next/server';
import { updateBacklogProject } from '@/services/backlog';

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

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const result = await updateBacklogProject(id, {
      notes: body.notes,
      type: body.type,
      priority: body.priority,
      status: body.status,
      dueDate: body.dueDate,
      tasks: body.tasks,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update backlog project',
      },
      { status: 500 }
    );
  }
}
